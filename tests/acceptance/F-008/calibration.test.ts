/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, security/detect-non-literal-fs-filename -- JSON de prueba y carpeta temporal propia */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkImage } from "../../../contract/src/index.ts";
import { ConfigError, parseDataFile, parseViewsConfig } from "../../../server/src/engine/index.ts";
import { decodePng1, pngBit } from "../F-002/helpers.ts";
import {
  P124,
  ROOT,
  edited,
  index8,
  isBlack,
  launchChromium,
  mkEngine,
  rmDir,
  runNpm,
  tmpDir,
  views6Text,
  type Loose,
  type RunResult,
  type TestChromium,
} from "./helpers.ts";

const VIEWS = join(ROOT, "config/calibracion.views.example.json");
const DATA = join(ROOT, "config/calibracion.data.example.json");

// Píxeles de la ficha (P124, x0 = 14, y0 = 46)
const COLUMN_X34 = {
  black: [46, 61, 62, 75, 76, 77],
  white: [45, 47, 60, 63, 74, 78],
};
const ROW_Y66 = {
  black: [234, 248, 249, 263, 264, 265],
  white: [233, 235, 247, 250, 262, 266],
};

function checkStripes(black: (x: number, y: number) => boolean): void {
  for (const y of COLUMN_X34.black) expect(black(34, y), `negro en (34, ${String(y)})`).toBe(true);
  for (const y of COLUMN_X34.white)
    expect(black(34, y), `blanco en (34, ${String(y)})`).toBe(false);
  for (const x of ROW_Y66.black) expect(black(x, 66), `negro en (${String(x)}, 66)`).toBe(true);
  for (const x of ROW_Y66.white) expect(black(x, 66), `blanco en (${String(x)}, 66)`).toBe(false);
}

describe("CA11 calibración por la vista previa", () => {
  let out: string;
  let run: RunResult;
  beforeAll(async () => {
    out = tmpDir("tintero-f008-cal-");
    run = await runNpm(
      "render",
      [
        "--views",
        VIEWS,
        "--data",
        DATA,
        "--panel",
        "w=800,h=480,dpi=124,depth=1",
        "--now",
        "2026-10-24T17:00:00Z",
        "--out",
        out,
      ],
      150_000,
    );
  }, 170_000);
  afterAll(() => {
    rmDir(out);
  });

  it("sale con 0, escribe calibracion.png (png1 válido) y no tiene zonas", () => {
    expect(run.code, run.out + run.err).toBe(0);
    const png = join(out, "calibracion.png");
    expect(existsSync(png)).toBe(true);
    expect(checkImage("png1", new Uint8Array(readFileSync(png)), P124).ok).toBe(true);
    const zonesFile = join(out, "calibracion.zones.json");
    if (existsSync(zonesFile)) {
      const z = JSON.parse(readFileSync(zonesFile, "utf8")) as { zones: unknown[] };
      expect(z.zones).toEqual([]);
    }
  });

  it("rayas de 1, 2 y 3 px en las columnas y filas de la ficha (en el PNG)", () => {
    const { w, rows } = decodePng1(new Uint8Array(readFileSync(join(out, "calibracion.png"))));
    expect(w).toBe(800);
    checkStripes((x, y) => pngBit(rows, w, x, y) === 0);
  });
});

describe("CA11 calibración con el motor", () => {
  let cr: TestChromium;
  beforeAll(async () => {
    cr = await launchChromium();
  }, 120_000);
  afterAll(async () => {
    await cr.stop();
  }, 60_000);

  it("calibracion: sin desborde ni zonas, rayas exactas y siete líneas de texto con su nombre", async () => {
    const config = parseViewsConfig(readFileSync(VIEWS, "utf8"));
    const data = parseDataFile(readFileSync(DATA, "utf8"), config);
    const e = mkEngine(cr.renderer, { config, data });
    try {
      const n0 = cr.renderer.calls.length;
      const { views } = await index8(e, "local", P124);
      await e.idle();
      const v = views.find((x) => x.id === "calibracion");
      expect(v, "vista calibracion").toBeDefined();
      if (!v) return;
      expect(v.overflow).toEqual([]);
      expect(v.zones).toEqual([]);
      expect(v.bandInk).toEqual([]);
      checkStripes((x, y) => isBlack(v.raw1, 800, x, y));

      const html = cr.renderer.calls
        .slice(n0)
        .map((c) => c.html)
        .filter((h) => h.includes("data-fit="))
        .join("\n");
      const sample = "Ñandú pingüino ÁÉÍÓÚ 0123 22 oct";
      for (const name of [
        "Terminus 14 normal",
        "Terminus 14 negrita",
        "Terminus 16 normal",
        "Terminus 16 negrita",
        "DejaVu Sans 9 pt",
        "DejaVu Sans 12 pt",
        "DejaVu Sans 9 pt tachado",
      ])
        expect(html, name).toContain(`${name}: `);
      expect(html.split(sample).length - 1).toBeGreaterThanOrEqual(7);
      for (const t of ["Foco", "Enviando", "22 oct"]) expect(html, t).toContain(t);
    } finally {
      await e.idle();
      await e.close();
    }
  }, 120_000);
});

describe("CA11 configuración del bloque calibration", () => {
  it("los ejemplos cargan: vista calibracion con una sola área todo y datos sin fuentes", () => {
    const config = parseViewsConfig(readFileSync(VIEWS, "utf8"));
    expect(() => parseDataFile(readFileSync(DATA, "utf8"), config)).not.toThrow();
    const raw: Loose = JSON.parse(readFileSync(VIEWS, "utf8"));
    expect(raw.devices["*"]).toBeDefined();
    expect(raw.views[0].id).toBe("calibracion");
    expect(raw.views[0].title).toBe("Calibración");
    expect(Object.keys(raw.views[0].slots as object)).toEqual(["todo"]);
    expect(raw.views[0].slots.todo.block).toBe("calibration");
    expect(JSON.parse(readFileSync(DATA, "utf8"))).toEqual({ version: 1, sources: {} });
  });

  it("un calibration con `source` → ConfigError", () => {
    const text = edited(readFileSync(VIEWS, "utf8"), (o: Loose) => {
      o.views[0].slots.todo.source = "tablero";
    });
    expect(() => parseViewsConfig(text)).toThrow(ConfigError);
  });

  it("los demás bloques siguen exigiendo `source`", () => {
    const text = edited(views6Text(), (o: Loose) => {
      delete o.views[0].slots.tareas.source;
    });
    expect(() => parseViewsConfig(text)).toThrow(ConfigError);
  });
});
