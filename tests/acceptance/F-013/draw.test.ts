/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- JSON de prueba */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  NOW_HOY,
  NOW_NOV2,
  P124,
  V124,
  area,
  blackIn,
  closeEngines,
  dayWeights,
  drawHoy,
  holidays2026,
  launchChromium,
  pixelErrors,
  type Drawn,
  type Loose,
  type Rect,
  type TestChromium,
} from "./helpers.ts";

let cr: TestChromium;
let a: Drawn; // CA6/CA7: hoy, P124, 2026-10-25, con festivos
let b: Drawn; // CA11: igual, sin festivos
let c: Drawn; // CA8: hoy, P124, 2026-11-02
let d: Drawn; // CA9: hoy, V124, 2026-11-02
let mini: Drawn; // CA10

const MINI = (o: Loose): void => {
  o.views.push({
    id: "mini",
    title: "Mini",
    grid: {
      columns: [37, 63],
      rows: [42, 58],
      areas: [
        ["mes", "otro"],
        ["abajo", "otro"],
      ],
    },
    portrait: { columns: [100], rows: [34, 33, 33], areas: [["mes"], ["otro"], ["abajo"]] },
    slots: {
      mes: { block: "month-calendar", source: "calendario" },
      otro: { block: "task-board", source: "tablero" },
      abajo: { block: "task-board", source: "tablero", options: { stages: ["done"] } },
    },
  });
};

beforeAll(async () => {
  cr = await launchChromium();
  const list = holidays2026();
  a = await drawHoy(cr, { panel: P124, now: NOW_HOY, holidays: list });
  b = await drawHoy(cr, { panel: P124, now: NOW_HOY, holidays: [] });
  c = await drawHoy(cr, { panel: P124, now: NOW_NOV2, holidays: list });
  d = await drawHoy(cr, { panel: V124, now: NOW_NOV2, holidays: list });
  mini = await drawHoy(cr, {
    panel: P124,
    now: NOW_HOY,
    holidays: list,
    cfgFn: MINI,
    viewId: "mini",
  });
}, 300_000);
afterAll(async () => {
  await closeEngines();
  await cr.stop();
}, 120_000);

const LABEL: Rect = { x0: 640, x1: 793, y0: 249, y1: 268 };
const MONTH: Rect = { x0: 510, x1: 600, y0: 249, y1: 268 };
// cajas de los domingos (columna x 748–779), una por fila de semana
// F-015 (regla 4): la franja del mes mide 24 y no 22; todas las `y` de los días bajan 2 px
const SUNDAYS: Rect[] = [297, 332, 367, 402].map((y) => ({ x0: 748, x1: 779, y0: y, y1: y + 23 }));
const BOX12: Rect = { x0: 514, x1: 545, y0: 367, y1: 390 };
const BOX13: Rect = { x0: 553, x1: 584, y0: 367, y1: 390 };

describe("CA6 hoy en P124 (2026-10-25)", () => {
  it("hoy invertido en la caja del 25", () => {
    const bad = pixelErrors(
      a.view.raw1,
      P124.w,
      [
        [748, 402],
        [779, 402],
        [748, 425],
        [779, 425],
      ],
      [
        [747, 412],
        [780, 412],
        [760, 401],
        [760, 426],
      ],
    );
    expect(bad).toEqual([]);
  });

  it("raya de 2 px del 6", () => {
    const bad = pixelErrors(
      a.view.raw1,
      P124.w,
      [
        [561, 358],
        [576, 359],
        [568, 358],
      ],
      [
        [560, 358],
        [577, 358],
        [568, 357],
        [568, 360],
      ],
    );
    expect(bad).toEqual([]);
  });

  it("el viaje marca 29, 30 y 31 (no el 28)", () => {
    const bad = pixelErrors(
      a.view.raw1,
      P124.w,
      [
        [646, 463],
        [685, 463],
        [724, 464],
      ],
      [[607, 463]],
    );
    expect(bad).toEqual([]);
  });

  it("etiqueta del próximo festivo junto al mes; hidden.mes = 0", () => {
    expect(blackIn(a.view.raw1, P124.w, LABEL)).toBeGreaterThan(0);
    expect(blackIn(a.view.raw1, P124.w, MONTH)).toBeGreaterThan(0);
    expect(a.view.hidden.mes).toBe(0);
  });
});

describe("CA7 negritas", () => {
  it("el HTML declara 700 en domingos y festivo, 400 en los demás", () => {
    for (const day of [4, 11, 18, 25, 12]) {
      const found = dayWeights(a.html, day);
      expect(
        found.some((w) => w.includes("700")),
        `día ${String(day)} en negrita (candidatos: ${JSON.stringify(found)})`,
      ).toBe(true);
    }
    for (const day of [13, 19, 26]) {
      const found = dayWeights(a.html, day);
      expect(
        found.some((w) => w.includes("400")),
        `día ${String(day)} en 400 (candidatos: ${JSON.stringify(found)})`,
      ).toBe(true);
      expect(
        found.some((w) => w.includes("700")),
        `día ${String(day)} no debe estar en negrita`,
      ).toBe(false);
    }
  });

  it("la caja del 12 tiene ≥ 1,5 veces el negro que sin festivos; la del 13 igual", () => {
    const with12 = blackIn(a.view.raw1, P124.w, BOX12);
    const without12 = blackIn(b.view.raw1, P124.w, BOX12);
    expect(without12).toBeGreaterThan(0);
    expect(with12).toBeGreaterThanOrEqual(1.5 * without12);
    expect(blackIn(a.view.raw1, P124.w, BOX13)).toBe(blackIn(b.view.raw1, P124.w, BOX13));
  });
});

describe("CA8 mes de 6 semanas (2026-11-02, festivo y hoy)", () => {
  it("hoy invertido, raya del 2 y etiqueta HOY FESTIVO", () => {
    const w = P124.w;
    const bad = [
      ...pixelErrors(
        c.view.raw1,
        w,
        [
          [514, 324],
          [545, 324],
          [514, 345],
          [545, 345],
          [522, 348],
          [537, 349],
        ],
        [
          [513, 332],
          [546, 332],
          ...[346, 347, 350, 351, 352].map((y): [number, number] => [529, y]),
        ],
      ),
    ];
    expect(bad).toEqual([]);
    expect(blackIn(c.view.raw1, w, { x0: 690, x1: 793, y0: 249, y1: 268 })).toBeGreaterThan(0);
    expect(c.view.hidden.mes).toBe(0);
  });
});

describe("CA9 vertical (V124, 2026-11-02)", () => {
  it("hoy invertido y puntos de eventos al lado, sin raya", () => {
    const w = V124.w;
    expect(
      pixelErrors(
        d.view.raw1,
        w,
        [
          [32, 687],
          [63, 687],
          [32, 706],
          [63, 706],
        ],
        [],
      ),
    ).toEqual([]);
    expect(blackIn(d.view.raw1, w, { x0: 66, x1: 70, y0: 694, y1: 698 })).toBe(25);
    expect(
      pixelErrors(
        d.view.raw1,
        w,
        [],
        [
          [65, 696],
          [71, 696],
          [68, 693],
          [68, 699],
        ],
      ),
    ).toEqual([]);
    expect(blackIn(d.view.raw1, w, { x0: 258, x1: 262, y0: 694, y1: 698 })).toBe(25);
    const noStripe: Rect = { x0: 40, x1: 55, y0: 707, y1: 709 };
    expect(blackIn(d.view.raw1, w, noStripe)).toBe(0);
    expect(area(noStripe)).toBe(48);
  });
});

describe("CA10 sin lugar para la marca", () => {
  it("vista mini: hidden.mes = 7", () => {
    expect(mini.view.id).toBe("mini");
    expect(mini.view.hidden.mes).toBe(7);
  });
});

describe("CA11 sin festivos", () => {
  it("no hay etiqueta y las cajas de los domingos no cambian", () => {
    expect(blackIn(b.view.raw1, P124.w, LABEL)).toBe(0);
    for (const r of SUNDAYS) {
      expect(blackIn(b.view.raw1, P124.w, r), JSON.stringify(r)).toBe(
        blackIn(a.view.raw1, P124.w, r),
      );
    }
  });
});
