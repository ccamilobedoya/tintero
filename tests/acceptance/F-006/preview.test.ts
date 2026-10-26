/* eslint-disable security/detect-non-literal-fs-filename -- carpeta temporal propia */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkImage, validateZones } from "../../../contract/src/index.ts";
import { DATA6_PATH, P124, VIEWS6_PATH, rmDir, runNpm, tmpDir, type RunResult } from "./helpers.ts";

let out: string;
let run: RunResult;
beforeAll(async () => {
  out = tmpDir("tintero-f006-render-");
  run = await runNpm(
    "render",
    [
      "--views",
      VIEWS6_PATH,
      "--data",
      DATA6_PATH,
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

describe("CA13 vista previa", () => {
  it("sale con 0 y escribe hoy.png y tablero.png", () => {
    expect(run.code, run.out + run.err).toBe(0);
    const files = readdirSync(out);
    expect(files).toContain("hoy.png");
    expect(files).toContain("tablero.png");
  });

  it("las imágenes son png1 válidas y las zonas pasan validateZones", () => {
    for (const id of ["hoy", "tablero"]) {
      const bytes = new Uint8Array(readFileSync(join(out, `${id}.png`)));
      expect(checkImage("png1", bytes, P124).ok, id).toBe(true);
      const v = validateZones(readFileSync(join(out, `${id}.zones.json`), "utf8"), P124);
      expect(v.ok, id).toBe(true);
      if (v.ok && id === "hoy") expect(v.value.zones).toHaveLength(10); // F-015: hoy tiene 10 zonas
    }
  });
});
