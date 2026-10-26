/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, security/detect-object-injection -- JSON de prueba e índices de listas */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Panel } from "../../../contract/src/index.ts";
import type { Engine, RenderedView } from "../../../server/src/engine/index.ts";
import {
  P124,
  P200,
  V124,
  getViews,
  isBlack,
  launchChromium,
  mkEngine6,
  rect,
  viewOf,
  zid,
  type Loose,
  type TestChromium,
} from "./helpers.ts";

let cr: TestChromium;
beforeAll(async () => {
  cr = await launchChromium();
}, 120_000);
afterAll(async () => {
  await cr.stop();
}, 60_000);

const engines: Engine[] = [];
afterAll(async () => {
  for (const e of engines) {
    try {
      await e.idle();
      await e.close();
    } catch {
      /* closing anyway */
    }
  }
}, 120_000);

/** Draws the views (default both) and returns them plus the full-page draws made. */
async function drawn(
  panel: Panel,
  opts: Parameters<typeof mkEngine6>[1] = {},
): Promise<{ views: RenderedView[]; gray: number[]; overflow: string[][] }> {
  const e = mkEngine6(cr.renderer, opts);
  engines.push(e);
  const full = (): typeof cr.renderer.calls =>
    cr.renderer.calls.filter((c) => c.html.includes("data-fit="));
  const n0 = full().length;
  const { views } = await getViews(e, "local", panel);
  await e.idle();
  const calls = full().slice(n0);
  return { views, gray: calls.map((c) => c.out.gray), overflow: calls.map((c) => c.out.overflow) };
}

describe("CA3 hoy en P124", () => {
  it("sin desborde, zonas, hidden y píxeles", async () => {
    const { views, gray, overflow } = await drawn(P124, { views: ["hoy"] });
    const hoy = viewOf(views, "hoy");
    expect(hoy.overflow).toEqual([]);
    expect(hoy.tooSmall).toEqual([]);
    expect(gray.length).toBeGreaterThan(0);
    for (const g of gray) expect(g).toBe(0);
    for (const o of overflow) expect(o).toEqual([]);

    const todo = ["b-02", "b-04", "b-05", "b-06", "b-07", "b-08", "b-09"];
    // F-015 (D2): `b-03` (sin fecha) mide 66 y cabe una tarea más en Por hacer
    const todoY = [267, 297, 327, 357, 387, 417];
    const todoNew = todo.slice(0, 6);
    const expected = [
      { id: zid("hoy", "b-01"), act: "toggle", x: 8, y: 73, w: 480, h: 86 },
      { id: zid("hoy", "b-03"), act: "toggle", x: 8, y: 162, w: 480, h: 66 },
      ...todoNew.map((id, i) => ({
        id: zid("hoy", id),
        act: "toggle",
        x: 8,
        y: todoY[i],
        w: 480,
        h: 30,
      })),
      { id: zid("hoy", "b-12"), act: "toggle", x: 504, y: 70, w: 288, h: 30 },
      { id: zid("hoy", "b-13"), act: "toggle", x: 504, y: 100, w: 288, h: 30 },
    ];
    expect(hoy.zones).toHaveLength(10);
    expect(hoy.zones.map((z) => ({ id: z.id, act: z.act, ...rect(z) }))).toEqual(expected);
    expect(hoy.zones[7]?.y).toBe(417);
    expect(hoy.hidden).toEqual({ tareas: 3, hechas: 0, mes: 0 });

    const img = hoy.raw1;
    const black = (x: number, y: number): boolean => isBlack(img, 800, x, y);
    for (const [x, y] of [
      [300, 46],
      [300, 69],
      [8, 50],
      [487, 50],
      [200, 265],
      [200, 266],
      [15, 92],
      [516, 84],
    ] as const)
      expect(black(x, y), `negro en (${String(x)}, ${String(y)})`).toBe(true);
    for (const [x, y] of [
      [300, 70],
      [300, 72],
      [7, 50],
      [488, 50],
      [200, 264],
      [200, 267],
      [23, 92],
    ] as const)
      expect(black(x, y), `blanco en (${String(x)}, ${String(y)})`).toBe(false);

    let whites = 0;
    for (let y = 46; y <= 69; y++) for (let x = 8; x <= 487; x++) if (!black(x, y)) whites++;
    expect(whites).toBeGreaterThanOrEqual(50);
  }, 90_000);
});

describe("CA4 vencida", () => {
  it("b-02 invertida; b-06 y b-04 sin invertir", async () => {
    const { views } = await drawn(P124, { views: ["hoy"] });
    const img = viewOf(views, "hoy").raw1;
    // F-015 (D2): etiqueta de 14 px centrada en la fila de b-02 (y = 267); b-04 (297) y b-06 (357) sin ella
    expect(isBlack(img, 800, 481, 276)).toBe(true);
    expect(isBlack(img, 800, 481, 289)).toBe(true);
    expect(isBlack(img, 800, 481, 275)).toBe(false);
    expect(isBlack(img, 800, 481, 290)).toBe(false);
    for (const y of [306, 319, 366, 379])
      expect(isBlack(img, 800, 481, y), `y=${String(y)}`).toBe(false);
  }, 90_000);
});

describe("CA7 vacío", () => {
  it("sin tareas doing: primera zona b-02 y franja que manda en negro", async () => {
    const { views } = await drawn(P124, {
      views: ["hoy"],
      dataFn: (o: Loose) => {
        o.sources.tablero.items = (o.sources.tablero.items as Loose[]).filter(
          (t: Loose) => t.stage !== "doing",
        );
      },
    });
    const hoy = viewOf(views, "hoy");
    expect(hoy.zones[0]?.id).toBe(zid("hoy", "b-02"));
    // F-008: columna de foco x = 8, w = 480 y filas de 30 px; la franja que manda sigue en negro
    const first = rect(hoy.zones[0] as never);
    expect({ x: first.x, w: first.w, h: first.h }).toEqual({ x: 8, w: 480, h: 30 });
    expect(isBlack(hoy.raw1, 800, 300, 46)).toBe(true);
    expect(isBlack(hoy.raw1, 800, 8, 50)).toBe(true);
  }, 90_000);
});

describe("CA8 tablero en P124", () => {
  it("zonas en orden, hidden y sin desborde", async () => {
    const { views } = await drawn(P124, { views: ["tablero"] });
    const v = viewOf(views, "tablero");
    expect(v.overflow).toEqual([]);
    expect(v.tooSmall).toEqual([]);
    // F-015 (D2): tarjetas sin fecha ni categoría miden 52 y la fila que manda sin fecha, 66
    const expected = [
      { id: zid("tablero", "b-01"), x: 264, y: 73, w: 288, h: 86 },
      { id: zid("tablero", "b-03"), x: 264, y: 162, w: 288, h: 66 },
      { id: zid("tablero", "b-02"), x: 8, y: 73, w: 240, h: 72 },
      { id: zid("tablero", "b-04"), x: 8, y: 148, w: 240, h: 52 },
      { id: zid("tablero", "b-05"), x: 8, y: 203, w: 240, h: 72 },
      { id: zid("tablero", "b-06"), x: 8, y: 278, w: 240, h: 72 },
      { id: zid("tablero", "b-07"), x: 8, y: 353, w: 240, h: 52 },
      { id: zid("tablero", "b-12"), x: 568, y: 73, w: 224, h: 52 },
      { id: zid("tablero", "b-13"), x: 568, y: 128, w: 224, h: 52 },
    ];
    expect(v.zones.map((z) => ({ id: z.id, ...rect(z) }))).toEqual(expected);
    expect(v.hidden).toEqual({ por_hacer: 4, en_progreso: 0, hechas: 0 });
  }, 90_000);
});

describe("CA9 vertical y otros ppp", () => {
  it("hoy en V124 usa portrait", async () => {
    const { views } = await drawn(V124, { views: ["hoy"] });
    const hoy = viewOf(views, "hoy");
    expect(hoy.overflow).toEqual([]);
    expect(hoy.tooSmall).toEqual([]);
    // F-008: en V124 valen las propiedades de CA3 de F-008 (alineación, lead de 86 px, filas de 30 px)
    const first = rect(hoy.zones[0] as never);
    expect({ x: first.x, h: first.h }).toEqual({ x: 8, h: 86 });
    for (const z of hoy.zones) {
      expect(z.x % 8, z.id).toBe(0);
      expect(z.w % 8, z.id).toBe(0);
      expect([30, 66, 86], z.id).toContain(z.h);
    }
    const hechas = hoy.zones.filter((z) => [zid("hoy", "b-12"), zid("hoy", "b-13")].includes(z.id));
    for (const z of hechas) expect(z.h).toBe(30);
  }, 90_000);

  it("tablero en V124", async () => {
    const { views } = await drawn(V124, { views: ["tablero"] });
    const v = viewOf(views, "tablero");
    expect(v.overflow).toEqual([]);
    expect(v.tooSmall).toEqual([]);
  }, 90_000);

  it("hoy y tablero en P200 sin desborde", async () => {
    const { views, overflow } = await drawn(P200);
    for (const id of ["hoy", "tablero"]) expect(viewOf(views, id).overflow, id).toEqual([]);
    for (const o of overflow) expect(o).toEqual([]);
  }, 90_000);
});

describe("CA11 categorías", () => {
  const three = (o: Loose): void => {
    o.sources.tablero.items = [
      { id: "c-1", title: "Primera", done: false, stage: "todo", category: "Casa" },
      { id: "c-2", title: "Segunda", done: false, stage: "todo" },
      { id: "c-3", title: "Tercera", done: false, stage: "todo", category: "Casa" },
    ];
  };
  const withOptions =
    (options: Loose) =>
    (o: Loose): void => {
      o.views[0].slots.tareas.options = options;
    };

  it("agrupa por categoría: c-1, c-3, c-2", async () => {
    const { views } = await drawn(P124, {
      views: ["hoy"],
      dataFn: three,
      cfgFn: withOptions({ stages: ["todo"] }),
    });
    const hoy = viewOf(views, "hoy");
    expect(hoy.zones.map((z) => z.id)).toEqual(["c-1", "c-3", "c-2"].map((i) => zid("hoy", i)));
  }, 90_000);

  it("group_by none: c-1, c-2, c-3", async () => {
    const { views } = await drawn(P124, {
      views: ["hoy"],
      dataFn: three,
      cfgFn: withOptions({ stages: ["todo"], group_by: "none" }),
    });
    const hoy = viewOf(views, "hoy");
    expect(hoy.zones.map((z) => z.id)).toEqual(["c-1", "c-2", "c-3"].map((i) => zid("hoy", i)));
  }, 90_000);
});
