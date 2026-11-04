/* eslint-disable security/detect-non-literal-fs-filename -- archivos del contrato del repo */
// R8: el contrato acepta pb1 y Tintero-Formats ignora los nombres desconocidos (base de CA13).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDeviceHeaders, validateIndex } from "../../../contract/src/index.ts";
import { ROOT } from "./helpers.ts";

const base = (formats: string): Record<string, string> => ({
  "Tintero-Protocol": "1",
  "Tintero-Firmware": "esp32-0.2",
  "Tintero-Power": "usb",
  "Tintero-Formats": formats,
  "Tintero-Panel": "w=800,h=480,dpi=124,depth=1",
});

const indexWith = (view: Record<string, unknown>): string =>
  JSON.stringify({
    protocol: 1,
    server_time: 1761096000,
    next_wake_s: 1800,
    full_refresh: false,
    panel: { w: 800, h: 480, dpi: 124, depth: 1 },
    current: "todo",
    views: [{ id: "todo", hash: "9f2c1a7b", crc32: "3a1f09c4", ...view }],
  });

describe("R8 contrato de pb1", () => {
  it("Tintero-Formats: pb1 es válido; los nombres desconocidos se ignoran si queda uno conocido", () => {
    for (const formats of ["pb1,raw1", "pb1", "raw1", "bmp,raw1", "future,pb1", "raw1,future"]) {
      expect(validateDeviceHeaders(base(formats)).ok, formats).toBe(true);
    }
  });

  it("Tintero-Formats: bmp solo, o nada conocido, sigue siendo inválido", () => {
    for (const formats of ["bmp", "bmp,future", "future"]) {
      expect(validateDeviceHeaders(base(formats)).ok, formats).toBe(false);
    }
  });

  it("el índice acepta una vista pb1 con bytes menores que raw1, y raw1 sigue exigiendo 48 000", () => {
    expect(validateIndex(indexWith({ format: "pb1", bytes: 11_000 })).ok).toBe(true);
    expect(validateIndex(indexWith({ format: "raw1", bytes: 48_000 })).ok).toBe(true);
    expect(validateIndex(indexWith({ format: "raw1", bytes: 11_000 })).ok).toBe(false);
  });

  it("existe el ejemplo contract/fixtures/v1/valid/index-pb1.json y valida con una vista pb1", () => {
    const text = readFileSync(join(ROOT, "contract/fixtures/v1/valid/index-pb1.json"), "utf8");
    const result = validateIndex(text);
    expect(result.ok).toBe(true);
    expect(text).toContain('"pb1"');
  });

  it("los JSON Schema y el OpenAPI regenerados mencionan pb1", () => {
    for (const file of ["contract/schema/v1/index.schema.json", "contract/openapi/v1.json"]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toContain("pb1");
    }
  });
});
