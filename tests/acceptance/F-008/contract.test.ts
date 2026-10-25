/* eslint-disable security/detect-non-literal-fs-filename -- JSON de prueba y fixtures del repo */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateDeviceHeaders,
  validateZones,
  type Panel,
  type Zone,
} from "../../../contract/src/index.ts";
import { P124, ROOT, devHeaders, runNpm, checkFocusBand, limit } from "./helpers.ts";

/** Paths of the errors with a given code (the code may not be in the type yet). */
const pathsOf = (errors: { code: string; path: string }[], code: string): string[] =>
  errors.filter((e) => e.code === code).map((e) => e.path);

const fixture = (kind: "valid" | "invalid", name: string): string =>
  readFileSync(join(ROOT, "contract/fixtures/v1", kind, name), "utf8");

describe("CA1 contrato", () => {
  it("LIMITS: zoneAlign 8, maxFocusRing 16, maxFocusPad 32, maxFocusDash 64", () => {
    expect(limit("zoneAlign")).toBe(8);
    expect(limit("maxFocusRing")).toBe(16);
    expect(limit("maxFocusPad")).toBe(32);
    expect(limit("maxFocusDash")).toBe(64);
  });

  it("los ejemplos de F-001 siguen validando igual", () => {
    expect(validateZones(fixture("valid", "zones-basic.json"), P124).ok).toBe(true);
    for (const name of [
      "zones-duplicate_id-t1.json",
      "zones-out_of_panel-wide.json",
      "zones-schema-act.json",
      "zones-schema-narrow.json",
    ]) {
      const r = validateZones(fixture("invalid", name), P124);
      expect(r.ok, name).toBe(false);
      const code = /^zones-([a-z_]+)-/.exec(name)?.[1];
      if (!r.ok)
        expect(
          r.errors.map((e) => e.code),
          name,
        ).toContain(code);
    }
  });

  it("zones-focus.json: ok, dos zonas alineadas y focus { ring: 3, pad: 6, dash: 8 }", () => {
    const r = validateZones(fixture("valid", "zones-focus.json"), P124);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.value.zones).toHaveLength(2);
    for (const z of r.value.zones) {
      expect(z.x % 8).toBe(0);
      expect(z.w % 8).toBe(0);
    }
    expect((r.value as unknown as { focus: unknown }).focus).toEqual({ ring: 3, pad: 6, dash: 8 });
  });

  it("unaligned en x y en w, con ruta /zones/<i>", () => {
    const x = validateZones(fixture("invalid", "zones-unaligned-x.json"), P124);
    expect(x.ok).toBe(false);
    if (!x.ok) {
      expect(pathsOf(x.errors, "unaligned")[0]).toMatch(/^\/zones\/\d+$/);
    }
    const w = validateZones(fixture("invalid", "zones-unaligned-w.json"), P124);
    expect(w.ok).toBe(false);
    if (!w.ok) {
      expect(pathsOf(w.errors, "unaligned")[0]).toMatch(/^\/zones\/\d+$/);
    }
    const raw = JSON.parse(fixture("invalid", "zones-unaligned-x.json")) as {
      zones: { x: number }[];
    };
    expect(raw.zones.some((z) => z.x === 10)).toBe(true);
    const rawW = JSON.parse(fixture("invalid", "zones-unaligned-w.json")) as {
      zones: { w: number }[];
    };
    expect(rawW.zones.some((z) => z.w === 476)).toBe(true);
  });

  it("focus_pad en /focus cuando pad < ring (ring 4, pad 3)", () => {
    const r = validateZones(fixture("invalid", "zones-focus_pad-thin.json"), P124);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(pathsOf(r.errors, "focus_pad")).toEqual(["/focus"]);
    }
    const raw = JSON.parse(fixture("invalid", "zones-focus_pad-thin.json")) as {
      focus: { ring: number; pad: number };
    };
    expect(raw.focus).toMatchObject({ ring: 4, pad: 3 });
  });

  it("focus fuera de rango no pasa (ring 0, ring 17, pad 33, dash 65)", () => {
    const base = JSON.parse(fixture("valid", "zones-focus.json")) as Record<string, unknown>;
    for (const focus of [
      { ring: 0, pad: 6, dash: 8 },
      { ring: 17, pad: 20, dash: 8 },
      { ring: 3, pad: 33, dash: 8 },
      { ring: 3, pad: 6, dash: 65 },
    ])
      expect(
        validateZones(JSON.stringify({ ...base, focus }), P124).ok,
        JSON.stringify(focus),
      ).toBe(false);
    // dash 0 = sólido
    expect(
      validateZones(JSON.stringify({ ...base, focus: { ring: 3, pad: 6, dash: 0 } }), P124).ok,
    ).toBe(true);
  });

  it("npm run contract:check sale con 0", async () => {
    const r = await runNpm("contract:check", [], 120_000);
    expect(r.code, r.out + r.err).toBe(0);
  }, 150_000);
});

describe("CA2 checkFocusBand", () => {
  // Negro = bit 1 en raw1 (como en F-001; aclarado en la ficha).
  const panel: Panel = { w: 16, h: 16, dpi: 124, depth: 1 };
  const zones: Zone[] = [{ id: "z", x: 0, y: 0, w: 16, h: 16, act: "toggle" }];
  const withBlack = (points: [number, number][]): Uint8Array => {
    const img = new Uint8Array(2 * 16);
    for (const [x, y] of points)
      img[y * 2 + (x >> 3)] = (img[y * 2 + (x >> 3)] ?? 0) | (0x80 >> (x & 7));
    return img;
  };

  it("todo blanco → []", () => {
    expect(checkFocusBand(withBlack([]), panel, zones, 3)).toEqual([]);
  });
  it("negro solo en (2, 8) → [z]", () => {
    expect(checkFocusBand(withBlack([[2, 8]]), panel, zones, 3)).toEqual(["z"]);
  });
  it("negro solo en (3, 8) → []", () => {
    expect(checkFocusBand(withBlack([[3, 8]]), panel, zones, 3)).toEqual([]);
  });
  it("negro solo en (13, 8) → [z]", () => {
    expect(checkFocusBand(withBlack([[13, 8]]), panel, zones, 3)).toEqual(["z"]);
  });
  it("negro solo en (12, 12) → []", () => {
    expect(checkFocusBand(withBlack([[12, 12]]), panel, zones, 3)).toEqual([]);
  });
  it("negro fuera de la zona no cuenta; la zona se mira por su caja", () => {
    const two: Zone[] = [
      { id: "a", x: 0, y: 0, w: 8, h: 16, act: "toggle" },
      { id: "b", x: 8, y: 0, w: 8, h: 16, act: "toggle" },
    ];
    // (9, 8) está a 1 px del borde izquierdo de b y a 6 px del borde derecho de a
    expect(checkFocusBand(withBlack([[9, 8]]), panel, two, 3)).toEqual(["b"]);
  });

  it("presupuesto: 48 zonas en P124 en menos de 5 ms (media de 20 pasadas)", () => {
    const big: Panel = P124;
    const img = new Uint8Array(100 * 480);
    const many: Zone[] = Array.from({ length: 48 }, (_, i) => ({
      id: `z${String(i)}`,
      x: 8 + (i % 2) * 392,
      y: 10 + Math.floor(i / 2) * 19,
      w: 384,
      h: 18,
      act: "toggle" as const,
    }));
    checkFocusBand(img, big, many, 6);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) expect(checkFocusBand(img, big, many, 6)).toEqual([]);
    const avg = (performance.now() - t0) / 20;
    console.log(`checkFocusBand 48 zonas: ${avg.toFixed(2)} ms`);
    expect(avg).toBeLessThan(5);
  });
});

describe("Tintero-View en las cabeceras del contrato", () => {
  it("un id válido se lee como `view`; uno inválido es error", () => {
    const ok = validateDeviceHeaders({ ...devHeaders(), "Tintero-View": "tablero" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((ok.value as unknown as { view?: string }).view).toBe("tablero");
    expect(validateDeviceHeaders({ ...devHeaders(), "Tintero-View": "Tablero!" }).ok).toBe(false);
    expect(validateDeviceHeaders({ ...devHeaders(), "Tintero-View": "a".repeat(17) }).ok).toBe(
      false,
    );
    expect(validateDeviceHeaders(devHeaders()).ok).toBe(true);
  });
});
