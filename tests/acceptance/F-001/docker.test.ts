import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { validateIndex, validateZones } from "../../../contract/src/index.ts";
import { PANEL } from "./helpers.ts";

const root = new URL("../../../", import.meta.url).pathname;
let proc: ChildProcess | undefined;

function start(script: string): void {
  proc = spawn("npm", ["run", script], { cwd: root, detached: true, stdio: "ignore" });
}

async function stop(): Promise<void> {
  const p = proc;
  proc = undefined;
  if (!p?.pid) return;
  const exited = new Promise<void>((r) =>
    p.once("exit", () => {
      r();
    }),
  );
  try {
    process.kill(-p.pid, "SIGINT");
  } catch {
    return;
  }
  await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))]);
  try {
    process.kill(-p.pid, "SIGKILL");
  } catch {
    /* ya terminó */
  }
}

async function waitFor(url: string, init: RequestInit, ms: number): Promise<Response> {
  const end = Date.now() + ms;
  let last: unknown;
  while (Date.now() < end) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(3000) });
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("no respondió " + url + ": " + String(last));
}

afterEach(stop);

const HEADERS: Record<string, string> = {
  "Tintero-Protocol": "1",
  "Tintero-Firmware": "0.1.0",
  "Tintero-Power": "battery",
  "Tintero-Formats": "raw1",
  "Tintero-Panel": "w=800,h=480,dpi=124,depth=1",
};

describe("CA15 simulador (Prism)", () => {
  it("responde índice y zonas válidos; sin Tintero-Power → 4xx", async () => {
    start("contract:mock");
    const base = "http://127.0.0.1:4010/api/v1";
    const r = await waitFor(base + "/index", { headers: HEADERS }, 60_000);
    expect(r.status).toBe(200);
    const idx = validateIndex(await r.text());
    expect(idx.ok, JSON.stringify(idx.ok ? [] : idx.errors)).toBe(true);

    const sinPower = Object.fromEntries(
      Object.entries(HEADERS).filter(([k]) => k !== "Tintero-Power"),
    );
    const bad = await fetch(base + "/index", { headers: sinPower });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);

    const z = await fetch(base + "/views/todo/zones?h=9f2c1a7b", { headers: HEADERS });
    expect(z.status).toBe(200);
    const zr = validateZones(await z.text(), PANEL);
    expect(zr.ok, JSON.stringify(zr.ok ? [] : zr.errors)).toBe(true);
  }, 120_000);
});

describe("CA16 visor (Swagger UI)", () => {
  it("GET / responde 200; la especificación responde en /v1.json y el visor apunta a esa URL", async () => {
    start("contract:docs");
    const base = "http://127.0.0.1:8099";
    const r = await waitFor(base + "/", {}, 60_000);
    expect(r.status).toBe(200);

    const init = await fetch(base + "/swagger-initializer.js");
    const initJs = init.ok ? await init.text() : "";
    const m = /["']([^"']*v1\.json)["']/.exec(initJs);
    expect(m?.[1], "el visor debe apuntar a v1.json").toBeTruthy();
    expect(new URL(m?.[1] ?? "", base + "/").href).toBe(base + "/v1.json");

    const spec = await fetch(base + "/v1.json");
    expect(spec.status).toBe(200);
    const body = (await spec.json()) as { openapi?: string };
    expect(body.openapi).toMatch(/^3\.1/);
  }, 120_000);
});
