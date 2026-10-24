/* eslint-disable security/detect-non-literal-fs-filename -- carpeta temporal propia */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkImage, validateZones } from "../../../contract/src/index.ts";
import { DATA_PATH, P124, VIEWS_PATH, rmDir, runNpm, tmpDir, type RunResult } from "./helpers.ts";

let out: string;
let run: RunResult;
beforeAll(async () => {
  out = tmpDir("tintero-f005-render-");
  run = await runNpm(
    "render",
    [
      "--views",
      VIEWS_PATH,
      "--data",
      DATA_PATH,
      "--panel",
      "w=800,h=480,dpi=124,depth=1",
      "--now",
      "2026-10-23T12:00:00Z",
      "--out",
      out,
    ],
    150_000,
  );
}, 170_000);
afterAll(() => {
  rmDir(out);
});

describe("CA21 vista previa", () => {
  it("sale con 0 y escribe los nueve archivos", () => {
    expect(run.code, run.out + run.err).toBe(0);
    const files = readdirSync(out).sort();
    for (const id of ["agenda", "hoy", "pendientes"])
      for (const ext of ["png", "zones.png", "zones.json"])
        expect(files, `${id}.${ext}`).toContain(`${id}.${ext}`);
  });

  it("cada <id>.png es una imagen png1 válida", () => {
    for (const id of ["hoy", "pendientes", "agenda"]) {
      const bytes = new Uint8Array(readFileSync(join(out, `${id}.png`)));
      expect(checkImage("png1", bytes, P124).ok, id).toBe(true);
    }
  });

  it("los *.zones.png son PNG con otra imagen que la limpia", () => {
    for (const id of ["hoy", "pendientes", "agenda"]) {
      const marked = readFileSync(join(out, `${id}.zones.png`));
      const plain = readFileSync(join(out, `${id}.png`));
      expect(marked.subarray(1, 4).toString("latin1"), id).toBe("PNG");
      expect(marked.equals(plain), id).toBe(false);
    }
  });

  it("cada *.zones.json pasa validateZones; hoy tiene 13 zonas", () => {
    for (const id of ["hoy", "pendientes", "agenda"]) {
      const v = validateZones(readFileSync(join(out, `${id}.zones.json`), "utf8"), P124);
      expect(v.ok, id).toBe(true);
      if (v.ok && id === "hoy") expect(v.value.zones).toHaveLength(13);
    }
  });
});
