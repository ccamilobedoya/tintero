import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { validateIndex } from "../../../contract/src/index.ts";
import { ROOT, jsonLines, runNpm } from "./helpers.ts";
import { rmStore, tmpStore } from "./testserver.ts";

let proc: ChildProcess | undefined;
let store: string | undefined;

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

afterEach(async () => {
  await stop();
  if (store) rmStore(store);
  store = undefined;
});

/** Única llamada a fetch del archivo: solo loopback (docs/seguridad.md). */
async function getLocal(base: string, path: string, init: RequestInit = {}): Promise<Response> {
  if (!base.startsWith("http://127.0.0.1:")) throw new Error("solo 127.0.0.1");
  // nosemgrep: react-insecure-request -- loopback de prueba (docs/seguridad.md)
  return fetch(base + path, { ...init, signal: AbortSignal.timeout(3000) });
}

const HEADERS: Record<string, string> = {
  "Tintero-Protocol": "1",
  "Tintero-Firmware": "emulator-0.1.0",
  "Tintero-Power": "battery",
  "Tintero-Formats": "raw1",
  "Tintero-Panel": "w=800,h=480,dpi=124,depth=1",
};

async function waitForMock(base: string, ms: number): Promise<Response> {
  const end = Date.now() + ms;
  let last: unknown;
  while (Date.now() < end) {
    try {
      return await getLocal(base, "/api/v1/index", { headers: HEADERS });
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("el simulador no respondió: " + String(last));
}

describe("CA21 contra el simulador (Prism)", () => {
  it("la CLI termina con 0 y el GET index responde 200 con un índice válido", async () => {
    const base = "http://127.0.0.1:4010";
    proc = spawn("npm", ["run", "contract:mock"], { cwd: ROOT, detached: true, stdio: "ignore" });
    const direct = await waitForMock(base, 60_000);
    expect(direct.status).toBe(200);
    const idx = validateIndex(await direct.text());
    expect(idx.ok, JSON.stringify(idx.ok ? [] : idx.errors)).toBe(true);

    store = tmpStore();
    const r = await runNpm(
      "emulator",
      ["--server", base, "--store", store, "--wakes", "1"],
      90_000,
    );
    expect(r.code, r.stderr).toBe(0);
    const out = jsonLines(r.stdout);
    expect(out).toHaveLength(1);
    const first = out[0]?.requests?.[0];
    expect(first).toMatchObject({ method: "GET", path: "/api/v1/index", status: 200 });
    const codes = (out[0]?.errors ?? []).map((e) => e.code);
    expect(codes).not.toContain("index_invalid");
    expect(codes).not.toContain("network");
  }, 180_000);
});
