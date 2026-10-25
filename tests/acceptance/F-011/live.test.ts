import { delimiter } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkImage, validateIndex, type Panel } from "../../../contract/src/index.ts";
import { API, P124, P200, devHeaders, getLocal } from "../F-005/helpers.ts";
import {
  DATA,
  VIEWS,
  hex,
  labelled,
  makeFakeDocker,
  realDocker,
  removeInstance,
  startServer,
  wait,
  dockerReal,
  type FakeDocker,
  type Server,
} from "./helpers.ts";

const servers: Server[] = [];
const instances: string[] = [];
let fake: FakeDocker | undefined;

afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop();
  for (const i of instances.splice(0)) removeInstance(i);
  fake?.cleanup();
  fake = undefined;
});

function instance(): string {
  const name = `f011-${hex()}`;
  instances.push(name);
  return name;
}

const args = (inst: string): string[] => ["--views", VIEWS, "--data", DATA, "--instance", inst];

/** GET con las cabeceras de un dispositivo; devuelve el estado y el cuerpo. */
const get = (base: string, path: string, panel: Panel) =>
  getLocal(base, `${API}${path}`, { headers: devHeaders(panel) });

/** Dibuja de verdad: index válido y la imagen de cada vista con su huella. */
async function drawsFine(base: string, panel: Panel): Promise<boolean> {
  const res = await get(base, "/index", panel);
  if (res.status !== 200) return false;
  const idx = validateIndex(res.text);
  if (!idx.ok) return false;
  for (const view of idx.value.views) {
    const img = await get(base, `/views/${view.id}/image?h=${view.hash}`, panel);
    if (img.status !== 200) return false;
    if (!checkImage("raw1", img.buf, panel, view.crc32).ok) return false;
  }
  return true;
}

describe("CA1 el servidor real espera a Docker", () => {
  it("N = 2: no sale con 2, escribe listening y contesta", async () => {
    fake = makeFakeDocker(2);
    realDocker(); // se resolvió antes de cambiar el PATH
    const inst = instance();
    const server = await startServer(args(inst), {
      PATH: `${fake.dir}${delimiter}${process.env.PATH ?? ""}`,
    });
    servers.push(server);
    expect(server.exitCode(), server.raw.join("\n")).toBeUndefined();
    expect(server.url, server.raw.join("\n")).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(fake.versionCalls()).toBeGreaterThanOrEqual(3);
    const dockerLines = server.lines.filter((l) => l.event === "docker");
    expect(dockerLines.some((l) => l.ok === false)).toBe(true);
    expect(dockerLines.some((l) => l.ok === true)).toBe(true);
    const base = server.url ?? "";
    const res = await get(base, "/index", P124);
    expect(res.status).toBe(200);
  }, 240_000);
});

describe("CA2 Chromium muere", () => {
  it("docker kill: solo 200 o 503 busy, vista nueva en ≤ 30 s, mismo proceso, un restart, un contenedor", async () => {
    const inst = instance();
    const server = await startServer(args(inst));
    servers.push(server);
    expect(server.url, server.raw.join("\n")).toBeDefined();
    const base = server.url ?? "";
    const pid = server.pid;

    // una vista ya dibujada
    expect(await drawsFine(base, P124)).toBe(true);
    const before = labelled(inst, false);
    expect(before).toHaveLength(1);
    const oldId = before[0] ?? "";

    dockerReal(["kill", oldId]);
    const killedAt = Date.now();

    // Con otro panel el motor tiene que dibujar de nuevo (no hay caché de ese panel).
    const seen: number[] = [];
    let ok = false;
    while (Date.now() - killedAt < 30_000 && !ok) {
      const old = await get(base, "/index", P124);
      seen.push(old.status);
      if (old.status === 503) expect(old.text).toContain("busy");
      const fresh = await get(base, "/index", P200);
      seen.push(fresh.status);
      if (fresh.status === 503) expect(fresh.text).toContain("busy");
      if (fresh.status === 200) ok = await drawsFine(base, P200);
      if (!ok) await wait(300);
    }
    expect(
      seen.every((s) => s === 200 || s === 503),
      `estados ${seen.join(",")}`,
    ).toBe(true);
    expect(ok, `sin vista nueva en 30 s; estados ${seen.join(",")}`).toBe(true);
    expect(Date.now() - killedAt).toBeLessThanOrEqual(30_000 + 5_000);

    // mismo proceso
    expect(server.exitCode()).toBeUndefined();
    expect(server.pid).toBe(pid);
    process.kill(pid, 0);

    // línea restart y exactamente un contenedor con la etiqueta
    const restarts = server.lines.filter((l) => l.event === "chromium" && l.action === "restart");
    expect(restarts.length).toBeGreaterThanOrEqual(1);
    const after = labelled(inst);
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(oldId);
    expect(labelled(inst, false)).toHaveLength(1);
  }, 240_000);
});
