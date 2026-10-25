/* eslint-disable security/detect-non-literal-fs-filename -- carpetas temporales propias */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkImage, validateIndex, type Panel } from "../../../contract/src/index.ts";
import { startChromiumService } from "../../../server/src/engine/chromium.ts";
import { API, P124, P200, devHeaders, getLocal } from "../F-005/helpers.ts";
import {
  DATA,
  VIEWS,
  dockerReal,
  hex,
  labelled,
  realDocker,
  removeInstance,
  startServer,
  wait,
  type Line,
  type Server,
} from "./helpers.ts";

const servers: Server[] = [];
const instances: string[] = [];
const names = new Set<string>();
const dirs: string[] = [];
let savedPath: string | undefined;

beforeEach(() => {
  savedPath = process.env.PATH;
});

afterEach(async () => {
  process.env.PATH = savedPath;
  for (const s of servers.splice(0)) await s.stop();
  for (const i of instances.splice(0)) removeInstance(i);
  for (const n of names) {
    try {
      dockerReal(["rm", "-f", n]);
    } catch {
      /* no existe */
    }
  }
  names.clear();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const get = (base: string, path: string, panel: Panel) =>
  getLocal(base, `${API}${path}`, { headers: devHeaders(panel) });

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

describe("CA9 vivo pero sordo", () => {
  it("docker pause: 200/503 busy, vista nueva en ≤ 45 s, mismo proceso, un contenedor nuevo", async () => {
    const inst = `f011-${hex()}`;
    instances.push(inst);
    const server = await startServer(["--views", VIEWS, "--data", DATA, "--instance", inst]);
    servers.push(server);
    expect(server.url, server.raw.join("\n")).toBeDefined();
    const base = server.url ?? "";
    const pid = server.pid;

    expect(await drawsFine(base, P124)).toBe(true);
    const before = labelled(inst, false);
    expect(before).toHaveLength(1);
    const pausedId = before[0] ?? "";

    dockerReal(["pause", pausedId]);
    const pausedAt = Date.now();
    try {
      const seen: number[] = [];
      let ok = false;
      while (Date.now() - pausedAt < 45_000 && !ok) {
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
      expect(ok, `sin vista nueva en 45 s; estados ${seen.join(",")}`).toBe(true);
      expect(Date.now() - pausedAt).toBeLessThanOrEqual(45_000 + 5_000);
    } finally {
      try {
        dockerReal(["unpause", pausedId]);
      } catch {
        /* ya no existe, o no estaba pausado */
      }
    }

    expect(server.exitCode()).toBeUndefined();
    expect(server.pid).toBe(pid);
    process.kill(pid, 0);

    const restarts = server.lines.filter((l) => l.event === "chromium" && l.action === "restart");
    expect(restarts.length).toBeGreaterThanOrEqual(1);
    const after = labelled(inst);
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(pausedId);
    expect(after.some((id) => pausedId.startsWith(id) || id.startsWith(pausedId))).toBe(false);
    expect(labelled(inst, false)).toHaveLength(1);
  }, 240_000);
});

/**
 * Docker falso cuyo `run`: crea de verdad el contenedor (docker real) y luego sale con 1
 * (`exit`) o se queda dormido (`hang`). El resto pasa al docker real.
 */
function makeRunFailingDocker(mode: "exit" | "hang"): { dir: string; calls: () => string[][] } {
  const real = realDocker();
  const dir = mkdtempSync(join(tmpdir(), "tintero-f011-runfail-"));
  dirs.push(dir);
  const logFile = join(dir, "calls.log");
  writeFileSync(logFile, "");
  const after = mode === "exit" ? "exit 1" : "exec sleep 900";
  const script = `#!/bin/sh
printf '%s\\n' "$*" >> '${logFile}'
if [ "$1" = "run" ]; then
  '${real}' "$@" >/dev/null 2>&1
  ${after}
fi
exec '${real}' "$@"
`;
  const bin = join(dir, "docker");
  writeFileSync(bin, script);
  chmodSync(bin, 0o700);
  return {
    dir,
    calls: () =>
      readFileSync(logFile, "utf8")
        .split("\n")
        .filter((l) => l !== "")
        .map((l) => l.split(" ")),
  };
}

function containerName(call: string[]): string | undefined {
  const i = call.indexOf("--name");
  if (i >= 0) return call[i + 1];
  const eq = call.find((a) => a.startsWith("--name="));
  return eq?.slice("--name=".length);
}

const exists = (name: string): boolean =>
  dockerReal(["ps", "-aq", "--filter", `name=^${name}$`]).trim() !== "";

describe("CA10 sin restos de un run fallido", () => {
  for (const mode of ["exit", "hang"] as const) {
    it(`run ${mode === "exit" ? "sale con 1 tras crear" : "tarda más que el tope"}: dos intentos, sin restos, un rm -f por cada uno`, async () => {
      const fake = makeRunFailingDocker(mode);
      process.env.PATH = `${fake.dir}${delimiter}${savedPath ?? ""}`;
      const inst = `f011-${hex()}`;
      instances.push(inst);
      const lines: Line[] = [];
      let sleeps = 0;
      void startChromiumService({
        instance: inst,
        log: (l) => lines.push(l),
        // las dos primeras esperas pasan; la tercera se queda colgada para parar el bucle
        sleep: () => {
          sleeps += 1;
          return sleeps >= 3 ? new Promise<void>(() => undefined) : Promise.resolve();
        },
      }).catch(() => undefined);

      const end = Date.now() + 170_000;
      while (sleeps < 3 && Date.now() < end) await wait(200);
      expect(sleeps, JSON.stringify(lines)).toBeGreaterThanOrEqual(3);

      const calls = fake.calls();
      const runs = calls.filter((c) => c[0] === "run");
      expect(runs.length).toBeGreaterThanOrEqual(2);
      const attempts = runs.slice(0, 2).map((c) => containerName(c));
      for (const n of attempts) {
        expect(n).toBeDefined();
        names.add(n ?? "");
      }
      for (const [k, n] of attempts.entries()) {
        const runIdx = calls.indexOf(runs[k] ?? []);
        const rmIdx = calls.findIndex(
          (c, i) => i > runIdx && c[0] === "rm" && c.includes("-f") && c.includes(n ?? ""),
        );
        expect(rmIdx, `sin rm -f ${n} tras el intento ${k + 1}`).toBeGreaterThan(runIdx);
        if (k === 0) expect(rmIdx).toBeLessThan(calls.indexOf(runs[1] ?? []));
        expect(
          calls.filter((c) => c[0] === "rm" && c.includes("-f") && c.includes(n ?? "")),
        ).toHaveLength(calls.filter((c) => c[0] === "run" && containerName(c) === n).length);
      }
      for (const n of attempts) expect(exists(n ?? ""), `quedó ${n}`).toBe(false);
      expect(labelled(inst)).toEqual([]);
    }, 240_000);
  }
});
