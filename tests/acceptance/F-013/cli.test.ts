/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- carpetas temporales propias y JSON de prueba */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { decodePng, toRaw1 } from "../../../server/src/engine/index.ts";
import {
  P124,
  ROOT,
  holidays2026,
  isBlack,
  pixelErrors,
  rmDir,
  runNpm,
  tmpDir,
  blackIn,
  startNager,
} from "./helpers.ts";
import { startServer, wait, VIEWS, DATA } from "../F-011/helpers.ts";

const dir = tmpDir("tintero-f013-cli-");
afterAll(() => {
  rmDir(dir);
});

const EVENTS_DATA = join(ROOT, "config/calendario.data.example.json");

function renderArgs(out: string, holidays?: string): string[] {
  return [
    "--views",
    join(ROOT, "config/tablero.views.example.json"),
    "--data",
    EVENTS_DATA,
    "--panel",
    "w=800,h=480,dpi=124,depth=1",
    "--out",
    out,
    "--now",
    "2026-10-25T20:00:00Z",
    ...(holidays === undefined ? [] : ["--holidays", holidays]),
  ];
}

describe("CA19 npm run render --holidays", () => {
  it("escribe hoy.png con lo de CA6", async () => {
    const file = join(dir, "festivos.json");
    writeFileSync(file, JSON.stringify(holidays2026()));
    const out = join(dir, "salida");
    mkdirSync(out);
    const r = await runNpm("render", renderArgs(out, file), 240_000);
    expect(r.code, r.out + r.err).toBe(0);
    const png = readFileSync(join(out, "hoy.png"));
    const raw1 = toRaw1(decodePng(new Uint8Array(png), P124), P124);
    expect(
      pixelErrors(
        raw1,
        P124.w,
        [
          [748, 400],
          [779, 400],
          [748, 423],
          [779, 423],
          [561, 356],
          [576, 357],
          [646, 461],
          [685, 461],
          [724, 462],
        ],
        [
          [747, 410],
          [780, 410],
          [607, 461],
          [560, 356],
        ],
      ),
    ).toEqual([]);
    expect(blackIn(raw1, P124.w, { x0: 640, x1: 793, y0: 249, y1: 268 })).toBeGreaterThan(0);
    expect(isBlack(raw1, P124.w, 748, 400)).toBe(true);
  }, 300_000);

  it("un archivo de 65 KiB sale con código 2", async () => {
    const file = join(dir, "grande.json");
    writeFileSync(file, "[" + " ".repeat(65 * 1024) + "]");
    const out = join(dir, "salida-grande");
    mkdirSync(out);
    const r = await runNpm("render", renderArgs(out, file), 120_000);
    expect(r.code).toBe(2);
    expect(r.out + r.err).not.toBe("");
  }, 150_000);

  it("una fecha mala sale con código 2 y el error", async () => {
    const file = join(dir, "mala.json");
    writeFileSync(file, JSON.stringify([{ date: "2026-13-01", name: "Mala" }]));
    const out = join(dir, "salida-mala");
    mkdirSync(out);
    const r = await runNpm("render", renderArgs(out, file), 120_000);
    expect(r.code).toBe(2);
    expect(r.out + r.err).not.toBe("");
  }, 150_000);
});

describe("CA17 país en las vistas pero festivos apagada", () => {
  it("ninguna petición en 3 s y el registro «festivos integration is off» una vez", async () => {
    const fake = await startNager();
    const integ = join(dir, "integrations.json");
    writeFileSync(integ, JSON.stringify({ version: 1, integrations: {} }), { mode: 0o600 });
    const server = await startServer(["--views", VIEWS, "--data", DATA, "--integrations", integ]);
    try {
      expect(server.url, server.raw.join("\n")).toBeDefined();
      await wait(3000);
      expect(fake.requests).toHaveLength(0);
      const hits = server.raw.filter((l) => l.includes("holidays: festivos integration is off"));
      expect(hits).toHaveLength(1);
    } finally {
      await server.stop();
      await fake.close();
    }
  }, 240_000);
});

describe("Archivos de ejemplo", () => {
  it("calendario.data.example.json = tablero.data con los 9 eventos de la ficha", () => {
    const tablero = JSON.parse(
      readFileSync(join(ROOT, "config/tablero.data.example.json"), "utf8"),
    );
    const cal = JSON.parse(readFileSync(EVENTS_DATA, "utf8"));
    const expected = structuredClone(tablero);
    expected.sources.calendario.items = cal.sources.calendario.items;
    expect(cal).toEqual(expected);
    const items = cal.sources.calendario.items as { id: string; start: string; end?: string }[];
    expect(items.map((i) => i.id)).toEqual([
      "e-01",
      "e-02",
      "e-03",
      "e-04",
      "e-05",
      "e-06",
      "e-07",
      "e-08",
      "e-09",
    ]);
    expect(items[5]).toMatchObject({ start: "2026-10-29", end: "2026-11-01", title: "Viaje" });
  });

  it("integrations.example.json muestra la entrada festivos con baseUrl y stateFile", () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, "config/integrations.example.json"), "utf8"));
    expect(cfg.integrations.festivos.baseUrl).toBe("https://date.nager.at");
    expect(typeof cfg.integrations.festivos.stateFile).toBe("string");
    expect(String(cfg.integrations.festivos.stateFile).startsWith("/")).toBe(true);
  });
});
