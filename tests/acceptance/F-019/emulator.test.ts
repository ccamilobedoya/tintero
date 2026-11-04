/* eslint-disable security/detect-non-literal-fs-filename -- carpetas temporales propias */
// CA14: el emulador con --formats pb1,raw1 deja la misma pantalla que con raw1.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer } from "../../../server/src/index.ts";
import { RAW_BYTES, captureStdout, engineWith, run, sameBytes } from "./helpers.ts";
import { rmDir, tmpDir } from "../F-005/helpers.ts";

let close: () => Promise<void>;
let url: string;
const stores: string[] = [];

beforeAll(async () => {
  const engine = engineWith("text", ["hoy", "pendientes", "agenda"]);
  const server = await startServer({ nextWakeS: 1800, headersTimeoutMs: 5000, engine }, 0);
  url = server.url;
  close = async () => {
    await server.close();
    await engine.idle();
    await engine.close();
  };
});
afterAll(async () => {
  await close();
  for (const s of stores) rmDir(s);
});

async function wake(formats: string | undefined) {
  const store = tmpDir("tintero-f019-emu-");
  stores.push(store);
  const args = ["emulator/src/cli.ts", "--server", url, "--store", store];
  if (formats !== undefined) args.push("--formats", formats);
  const { value: exit, lines } = await captureStdout(() => run("node", args, 60_000));
  const imageBytes = lines
    .map((l) => {
      try {
        return JSON.parse(l) as { route?: string; status?: number; bytes?: number };
      } catch {
        return {};
      }
    })
    .filter((l) => l.route?.includes("/image") === true && l.status === 200)
    .map((l) => l.bytes ?? 0);
  return { exit, store, imageBytes };
}

describe("CA14 emulador con --formats", () => {
  it("--formats pb1,raw1 deja el mismo screen.png (y screen.raw1) que --formats raw1", async () => {
    const a = await wake("raw1");
    expect(a.exit.code, a.exit.out).toBe(0);
    const b = await wake("pb1,raw1");
    expect(b.exit.code, b.exit.out).toBe(0);

    // el informe de la despertada no trae errores
    for (const r of [a, b]) {
      const last =
        r.exit.out
          .trim()
          .split("\n")
          .filter((l) => l.startsWith("{"))
          .pop() ?? "{}";
      expect((JSON.parse(last) as { errors?: unknown[] }).errors ?? []).toEqual([]);
    }

    const rawA = new Uint8Array(readFileSync(join(a.store, "screen.raw1")));
    const rawB = new Uint8Array(readFileSync(join(b.store, "screen.raw1")));
    expect(rawA.length).toBe(RAW_BYTES);
    expect(sameBytes(rawA, rawB)).toBe(true);
    expect(rawA.some((x) => x !== 0)).toBe(true);
    const pngA = readFileSync(join(a.store, "screen.png"));
    const pngB = readFileSync(join(b.store, "screen.png"));
    expect(pngB.equals(pngA)).toBe(true);
  }, 120_000);

  it("con pb1 bajan menos bytes de imagen que con raw1 (de verdad se negoció pb1)", async () => {
    const a = await wake(undefined); // por defecto, raw1 como hoy
    const b = await wake("pb1,raw1");
    expect(a.imageBytes.length).toBeGreaterThan(0);
    expect(a.imageBytes.every((n) => n === RAW_BYTES)).toBe(true);
    expect(b.imageBytes.length).toBe(a.imageBytes.length);
    expect(b.imageBytes.every((n) => n < RAW_BYTES)).toBe(true);
  }, 120_000);

  it("--formats con un nombre desconocido sigue siendo un error de uso (código 2)", async () => {
    const r = await run(
      "node",
      ["emulator/src/cli.ts", "--server", url, "--formats", "bmp"],
      20_000,
    );
    expect(r.code).toBe(2);
  });
});
