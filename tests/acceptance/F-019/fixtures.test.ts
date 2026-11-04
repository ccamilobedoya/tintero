/* eslint-disable security/detect-non-literal-fs-filename -- carpeta de datos propia de la prueba */
// Datos de CA11/CA12. Los .raw1 los dibuja el motor real (Chromium) con los ejemplos del repo, como en F-005;
// los .pb1 los codifica `refEncode` (R8, escrito desde la ficha). Si faltan los archivos, el primer bloque los
// genera (una vez, con Chromium); para rehacerlos a mano, borrar fixtures/*.raw1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseDataFile, parseViewsConfig } from "../../../server/src/engine/index.ts";
import { dataText, getViews, launchChromium, mkEngine, viewsText } from "../F-005/helpers.ts";
import type { TestChromium } from "../F-005/helpers.ts";
import {
  FIXTURES,
  NAMES,
  NOON,
  NOW_HOY,
  P124,
  RAW_BYTES,
  ROOT,
  noiseBytes,
  readFixture,
  refDecode,
  refEncode,
  sameBytes,
} from "./helpers.ts";

const missing = !NAMES.every((n) => existsSync(join(FIXTURES, `${n}.raw1`)));

describe.skipIf(!missing)("generar los datos de prueba (solo si faltan)", () => {
  let cr: TestChromium;
  beforeAll(async () => {
    cr = await launchChromium();
  }, 120_000);
  afterAll(async () => {
    await cr.stop();
  }, 60_000);

  it("dibuja hoy, tablero y agenda y escribe los pares", async () => {
    mkdirSync(FIXTURES, { recursive: true });
    const save = (name: string, raw: Uint8Array): void => {
      writeFileSync(join(FIXTURES, `${name}.raw1`), raw);
      writeFileSync(join(FIXTURES, `${name}.pb1`), refEncode(raw));
    };

    const hoyText = readFileSync(join(ROOT, "config/hoy.views.example.json"), "utf8");
    const hoyData = readFileSync(join(ROOT, "config/hoy.data.example.json"), "utf8");
    const hoyConfig = parseViewsConfig(hoyText);
    const e1 = mkEngine(cr.renderer, {
      config: hoyConfig,
      data: parseDataFile(hoyData, hoyConfig),
      clock: () => new Date(NOW_HOY),
    });
    const hoy = await getViews(e1, "local", P124);
    await e1.idle();
    await e1.close();
    for (const id of ["hoy", "tablero"]) {
      const v = hoy.views.find((x) => x.id === id);
      if (!v) throw new Error(`missing ${id}`);
      save(id, v.raw1);
    }

    const config = parseViewsConfig(viewsText());
    const e2 = mkEngine(cr.renderer, {
      config,
      data: parseDataFile(dataText(), config),
      clock: () => new Date(NOON),
    });
    const agenda = await getViews(e2, "local", P124);
    await e2.idle();
    await e2.close();
    const a = agenda.views.find((x) => x.id === "agenda");
    if (!a) throw new Error("missing agenda");
    save("agenda", a.raw1);

    save("blank", new Uint8Array(RAW_BYTES));
    save("noise", noiseBytes(RAW_BYTES, 20261104));
    expect(true).toBe(true);
  }, 240_000);
});

describe("datos de prueba de pb1 (CA11, CA12)", () => {
  it("cada par .raw1/.pb1 existe, mide 48 000 y el .pb1 es el que sigue R8", () => {
    for (const name of NAMES) {
      const raw = readFixture(name, "raw1");
      const pb = readFixture(name, "pb1");
      expect(raw.length, name).toBe(RAW_BYTES);
      expect(sameBytes(pb, refEncode(raw)), `${name}.pb1`).toBe(true);
      expect(sameBytes(refDecode(pb, RAW_BYTES), raw), `${name} ida y vuelta`).toBe(true);
    }
  });

  it("hoy, agenda y tablero tienen dibujo; blank es todo blanco; noise es el ruido de semilla fija", () => {
    for (const name of ["hoy", "agenda", "tablero"] as const) {
      expect(
        readFixture(name, "raw1").some((b) => b !== 0),
        name,
      ).toBe(true);
    }
    expect(readFixture("blank", "raw1").every((b) => b === 0)).toBe(true);
    expect(sameBytes(readFixture("noise", "raw1"), noiseBytes(RAW_BYTES, 20261104))).toBe(true);
  });

  it("hoy en pb1 cabe en 16 000 bytes (R8, CA12)", () => {
    expect(readFixture("hoy", "pb1").length).toBeLessThanOrEqual(16_000);
  });
});
