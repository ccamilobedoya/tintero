import { describe, expect, it } from "vitest";
import {
  validateIndex,
  validateZones,
  validateActionsRequest,
  validateActionsResponse,
  validateLogRequest,
  validateErrorBody,
  validateDeviceHeaders,
} from "../../../contract/src/index.ts";
import {
  PANEL,
  indexDoc,
  view,
  zone,
  zonesDoc,
  action,
  logEntry,
  ids,
  j,
  hasCode,
  codes,
} from "./helpers.ts";

describe("CA1 índice de la ficha", () => {
  it("valida", () => {
    const r = validateIndex(j(indexDoc()));
    expect(codes(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("CA2 rechazos del índice", () => {
  it("id de vista repetido → duplicate_id", () => {
    const r = validateIndex(j(indexDoc({ views: [view("todo"), view("todo")] })));
    expect(hasCode(r, "duplicate_id")).toBe(true);
  });
  it("current ausente → unknown_current", () => {
    const r = validateIndex(j(indexDoc({ current: "nada" })));
    expect(hasCode(r, "unknown_current")).toBe(true);
  });
  it("17 vistas → schema", () => {
    const vs = ids("v", 17).map((i) => view(i));
    const r = validateIndex(j(indexDoc({ current: "v000", views: vs })));
    expect(hasCode(r, "schema")).toBe(true);
  });
  it("16 vistas son válidas", () => {
    const vs = ids("v", 16).map((i) => view(i));
    expect(validateIndex(j(indexDoc({ current: "v000", views: vs }))).ok).toBe(true);
  });
  it("id con mayúsculas → schema", () => {
    const r = validateIndex(j(indexDoc({ current: "Todo", views: [view("Todo")] })));
    expect(hasCode(r, "schema")).toBe(true);
  });
  it("next_wake_s = 10 → schema", () => {
    expect(hasCode(validateIndex(j(indexDoc({ next_wake_s: 10 }))), "schema")).toBe(true);
  });
  it("next_wake_s en los extremos 30 y 86400 es válido", () => {
    expect(validateIndex(j(indexDoc({ next_wake_s: 30 }))).ok).toBe(true);
    expect(validateIndex(j(indexDoc({ next_wake_s: 86400 }))).ok).toBe(true);
    expect(hasCode(validateIndex(j(indexDoc({ next_wake_s: 86401 }))), "schema")).toBe(true);
  });
  it("raw1 con bytes 47999 → raw1_size", () => {
    const r = validateIndex(
      j(indexDoc({ current: "todo", views: [view("todo", { bytes: 47999 })] })),
    );
    expect(hasCode(r, "raw1_size")).toBe(true);
  });
  it("texto que no es JSON → invalid_json", () => {
    const r = validateIndex("esto no es json {");
    expect(hasCode(r, "invalid_json")).toBe(true);
  });
  it("devuelve todos los errores detectables", () => {
    const r = validateIndex(
      j(indexDoc({ current: "nada", views: [view("a"), view("a", { bytes: 47999 })] })),
    );
    expect(hasCode(r, "duplicate_id")).toBe(true);
    expect(hasCode(r, "unknown_current")).toBe(true);
    expect(hasCode(r, "raw1_size")).toBe(true);
  });
});

describe("CA3 índice demasiado grande", () => {
  it("> 2048 bytes con forma válida → too_large", () => {
    const doc = indexDoc({ padding_futuro: "a".repeat(2100) });
    expect(j(doc).length).toBeGreaterThan(2048);
    expect(hasCode(validateIndex(j(doc)), "too_large")).toBe(true);
  });
  it("justo 2048 bytes es válido", () => {
    const base = j(indexDoc({ p: "" })).length;
    const doc = indexDoc({ p: "a".repeat(2048 - base) });
    expect(Buffer.byteLength(j(doc))).toBe(2048);
    expect(validateIndex(j(doc)).ok).toBe(true);
  });
});

describe("CA4 zonas", () => {
  it("el ejemplo valida con 800×480", () => {
    const r = validateZones(j(zonesDoc()), PANEL);
    expect(codes(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it("x:700 w:120 → out_of_panel", () => {
    const r = validateZones(j(zonesDoc({ zones: [zone("a", { x: 700, w: 120 })] })), PANEL);
    expect(hasCode(r, "out_of_panel")).toBe(true);
  });
  it("w:4 → schema", () => {
    const r = validateZones(j(zonesDoc({ zones: [zone("a", { w: 4 })] })), PANEL);
    expect(hasCode(r, "schema")).toBe(true);
  });
  it("ids repetidos → duplicate_id", () => {
    const r = validateZones(j(zonesDoc({ zones: [zone("a"), zone("a", { y: 200 })] })), PANEL);
    expect(hasCode(r, "duplicate_id")).toBe(true);
  });
  it("49 zonas → schema; 48 válidas", () => {
    // F-008: las zonas que se arman para aceptar van alineadas al byte (w 104)
    const mk = (n: number) => ids("z", n).map((i) => zone(i, { w: 104 }));
    expect(hasCode(validateZones(j(zonesDoc({ zones: mk(49) })), PANEL), "schema")).toBe(true);
    expect(validateZones(j(zonesDoc({ zones: mk(48) })), PANEL).ok).toBe(true);
  });
  it('act:"delete" → schema', () => {
    const r = validateZones(j(zonesDoc({ zones: [zone("a", { act: "delete" })] })), PANEL);
    expect(hasCode(r, "schema")).toBe(true);
  });
  it("0 zonas es válido", () => {
    expect(validateZones(j(zonesDoc({ zones: [] })), PANEL).ok).toBe(true);
  });
  it("más de 4096 bytes → too_large", () => {
    const r = validateZones(j(zonesDoc({ relleno: "a".repeat(4200) })), PANEL);
    expect(hasCode(r, "too_large")).toBe(true);
  });
  it("JSON ilegible → invalid_json", () => {
    expect(hasCode(validateZones("{", PANEL), "invalid_json")).toBe(true);
  });
});

describe("CA5 acciones", () => {
  const req = (n: number) => ({ actions: ids("a7f3c9e2", n).map((i) => action(i)) });
  it("acepta 1 y 8", () => {
    expect(validateActionsRequest(j(req(1))).ok).toBe(true);
    expect(validateActionsRequest(j(req(8))).ok).toBe(true);
  });
  it("rechaza 0 y 9 (schema)", () => {
    expect(hasCode(validateActionsRequest(j(req(0))), "schema")).toBe(true);
    expect(hasCode(validateActionsRequest(j(req(9))), "schema")).toBe(true);
  });
  it("id de 5 caracteres → schema", () => {
    const r = validateActionsRequest(j({ actions: [action("a7f3c")] }));
    expect(hasCode(r, "schema")).toBe(true);
  });
  it("acepta el ejemplo de respuesta", () => {
    const r = validateActionsResponse(
      j({ results: [{ id: "a7f3c9e2b1", status: "applied" }], index_changed: true }),
    );
    expect(r.ok).toBe(true);
  });
  it("acepta duplicate y stale", () => {
    for (const status of ["duplicate", "stale"]) {
      const r = validateActionsResponse(
        j({ results: [{ id: "a7f3c9e2b1", status }], index_changed: false }),
      );
      expect(r.ok).toBe(true);
    }
  });
  it('rechaza status "ok" (schema)', () => {
    const r = validateActionsResponse(
      j({ results: [{ id: "a7f3c9e2b1", status: "ok" }], index_changed: true }),
    );
    expect(hasCode(r, "schema")).toBe(true);
  });
});

describe("CA6 log", () => {
  it("acepta el ejemplo", () => {
    expect(validateLogRequest(j({ entries: [logEntry()] })).ok).toBe(true);
  });
  it("acepta 10 y rechaza 11 entradas", () => {
    expect(
      validateLogRequest(j({ entries: Array.from({ length: 10 }, () => logEntry()) })).ok,
    ).toBe(true);
    const r = validateLogRequest(j({ entries: Array.from({ length: 11 }, () => logEntry()) }));
    expect(hasCode(r, "schema")).toBe(true);
  });
  it("msg de 200 válido, de 201 → schema", () => {
    expect(validateLogRequest(j({ entries: [logEntry({ msg: "a".repeat(200) })] })).ok).toBe(true);
    const r = validateLogRequest(j({ entries: [logEntry({ msg: "a".repeat(201) })] }));
    expect(hasCode(r, "schema")).toBe(true);
  });
  it("level inválido → schema", () => {
    const r = validateLogRequest(j({ entries: [logEntry({ level: "debug" })] }));
    expect(hasCode(r, "schema")).toBe(true);
  });
});

describe("CA7 errores", () => {
  const codesOk = [
    "invalid_request",
    "unknown_view",
    "stale_view",
    "stale_zone",
    "too_large",
    "too_many",
    "busy",
  ];
  it.each(codesOk)("acepta %s", (code) => {
    expect(validateErrorBody(j({ error: { code, msg: "x" } })).ok).toBe(true);
  });
  it("rechaza teapot (schema)", () => {
    const r = validateErrorBody(j({ error: { code: "teapot", msg: "x" } }));
    expect(hasCode(r, "schema")).toBe(true);
  });
});

describe("CA8 / CA14 / CA18 cabeceras del aparato", () => {
  const base: Record<string, string> = {
    "Tintero-Protocol": "1",
    "Tintero-Firmware": "0.1.0",
    "Tintero-Power": "battery",
    "Tintero-Formats": "raw1",
    "Tintero-Panel": "w=800,h=480,dpi=124,depth=1",
  };
  const without = (k: string) => Object.fromEntries(Object.entries(base).filter(([n]) => n !== k));

  it("acepta nombres con mayúsculas", () => {
    const r = validateDeviceHeaders(base);
    expect(codes(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it("acepta nombres en minúsculas", () => {
    const low = Object.fromEntries(Object.entries(base).map(([k, v]) => [k.toLowerCase(), v]));
    expect(validateDeviceHeaders(low).ok).toBe(true);
  });
  it("acepta opcionales válidos e ignora desconocidas", () => {
    const r = validateDeviceHeaders({
      ...base,
      "Tintero-Battery-mV": "3700",
      "Tintero-RSSI": "-60",
      "X-Futuro": "lo-que-sea",
    });
    expect(r.ok).toBe(true);
  });
  it("sin Tintero-Power → schema", () => {
    expect(hasCode(validateDeviceHeaders(without("Tintero-Power")), "schema")).toBe(true);
  });
  it("Battery-mV 9000 → schema", () => {
    const r = validateDeviceHeaders({ ...base, "Tintero-Battery-mV": "9000" });
    expect(hasCode(r, "schema")).toBe(true);
  });
  it("RSSI fuera de rango → schema", () => {
    expect(hasCode(validateDeviceHeaders({ ...base, "Tintero-RSSI": "5" }), "schema")).toBe(true);
  });
  it("Formats: raw1 y raw1,png1 válidos", () => {
    expect(validateDeviceHeaders({ ...base, "Tintero-Formats": "raw1" }).ok).toBe(true);
    expect(validateDeviceHeaders({ ...base, "Tintero-Formats": "raw1,png1" }).ok).toBe(true);
  });
  it("Formats: falta, vacía, bmp → schema", () => {
    expect(hasCode(validateDeviceHeaders(without("Tintero-Formats")), "schema")).toBe(true);
    expect(hasCode(validateDeviceHeaders({ ...base, "Tintero-Formats": "" }), "schema")).toBe(true);
    expect(hasCode(validateDeviceHeaders({ ...base, "Tintero-Formats": "bmp" }), "schema")).toBe(
      true,
    );
  });
  it("exige Tintero-Panel", () => {
    expect(hasCode(validateDeviceHeaders(without("Tintero-Panel")), "schema")).toBe(true);
  });
  it("exige Tintero-Protocol y Firmware", () => {
    expect(hasCode(validateDeviceHeaders(without("Tintero-Protocol")), "schema")).toBe(true);
    expect(hasCode(validateDeviceHeaders(without("Tintero-Firmware")), "schema")).toBe(true);
  });
});

describe("CA9 compatibilidad hacia adelante", () => {
  const extra = { campo_futuro: "x" };
  type Fn = (raw: string) => { ok: boolean; value?: unknown };
  const cases: [string, Fn, unknown][] = [
    ["index", (r) => validateIndex(r), indexDoc(extra)],
    ["zones", (r) => validateZones(r, PANEL), zonesDoc(extra)],
    [
      "actions req",
      (r) => validateActionsRequest(r),
      { actions: [action("a7f3c9e2b1", extra)], ...extra },
    ],
    [
      "actions res",
      (r) => validateActionsResponse(r),
      {
        results: [{ id: "a7f3c9e2b1", status: "applied", ...extra }],
        index_changed: true,
        ...extra,
      },
    ],
    ["log", (r) => validateLogRequest(r), { entries: [logEntry(extra)], ...extra }],
    [
      "error",
      (r) => validateErrorBody(r),
      { error: { code: "busy", msg: "x", ...extra }, ...extra },
    ],
  ];
  it.each(cases)("%s acepta campos desconocidos y no los expone", (_n, fn, doc) => {
    const r = fn(j(doc));
    expect(r.ok).toBe(true);
    expect(j(r.value)).not.toContain("campo_futuro");
  });
  it("campo desconocido anidado en una vista no se expone", () => {
    const r = validateIndex(j(indexDoc({ views: [view("todo", extra)] })));
    expect(r.ok).toBe(true);
    expect(j(r.ok ? r.value : null)).not.toContain("campo_futuro");
  });
  it('"__proto__" no contamina Object.prototype', () => {
    const inject = (s: string) => s.replace(/^\{/, '{"__proto__":{"polluted":"si"},');
    validateIndex(inject(j(indexDoc())));
    validateZones(inject(j(zonesDoc())), PANEL);
    validateActionsRequest(inject(j({ actions: [action("a7f3c9e2b1")] })));
    validateLogRequest(inject(j({ entries: [logEntry()] })));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});

describe("Presupuesto de rendimiento", () => {
  it("validateIndex de 2048 bytes: < 5 ms promedio en 1000 corridas", () => {
    const base = j(indexDoc({ p: "" })).length;
    const raw = j(indexDoc({ p: "a".repeat(2048 - base) }));
    expect(Buffer.byteLength(raw)).toBe(2048);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) validateIndex(raw);
    expect((performance.now() - t0) / 1000).toBeLessThan(5);
  });
});
