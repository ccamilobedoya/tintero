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
const SUNDAYS: Rect[] = [295, 330, 365, 400].map((y) => ({ x0: 748, x1: 779, y0: y, y1: y + 23 }));
const BOX12: Rect = { x0: 514, x1: 545, y0: 365, y1: 388 };
const BOX13: Rect = { x0: 553, x1: 584, y0: 365, y1: 388 };

describe("CA6 hoy en P124 (2026-10-25)", () => {
  it("hoy invertido en la caja del 25", () => {
    const bad = pixelErrors(
      a.view.raw1,
      P124.w,
      [
        [748, 400],
        [779, 400],
        [748, 423],
        [779, 423],
      ],
      [
        [747, 410],
        [780, 410],
        [760, 399],
        [760, 424],
      ],
    );
    expect(bad).toEqual([]);
  });

  it("raya de 2 px del 6", () => {
    const bad = pixelErrors(
      a.view.raw1,
      P124.w,
      [
        [561, 356],
        [576, 357],
        [568, 356],
      ],
      [
        [560, 356],
        [577, 356],
        [568, 355],
        [568, 358],
      ],
    );
    expect(bad).toEqual([]);
  });

  it("el viaje marca 29, 30 y 31 (no el 28)", () => {
    const bad = pixelErrors(
      a.view.raw1,
      P124.w,
      [
        [646, 461],
        [685, 461],
        [724, 462],
      ],
      [[607, 461]],
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
          [514, 322],
          [545, 322],
          [514, 343],
          [545, 343],
          [522, 346],
          [537, 347],
        ],
        [
          [513, 330],
          [546, 330],
          ...[344, 345, 348, 349, 350].map((y): [number, number] => [529, y]),
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
          [32, 685],
          [63, 685],
          [32, 704],
          [63, 704],
        ],
        [],
      ),
    ).toEqual([]);
    expect(blackIn(d.view.raw1, w, { x0: 66, x1: 70, y0: 692, y1: 696 })).toBe(25);
    expect(
      pixelErrors(
        d.view.raw1,
        w,
        [],
        [
          [65, 694],
          [71, 694],
          [68, 691],
          [68, 697],
        ],
      ),
    ).toEqual([]);
    expect(blackIn(d.view.raw1, w, { x0: 258, x1: 262, y0: 692, y1: 696 })).toBe(25);
    const noStripe: Rect = { x0: 40, x1: 55, y0: 705, y1: 707 };
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
