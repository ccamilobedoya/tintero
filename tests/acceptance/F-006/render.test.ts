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
});

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

const xs = (y: number, n: number): number[] => Array.from({ length: n }, (_, i) => y + 24 * i);

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
    const expected = [
      { id: zid("hoy", "b-01"), act: "toggle", x: 10, y: 77, w: 476, h: 74 },
      { id: zid("hoy", "b-03"), act: "toggle", x: 10, y: 158, w: 476, h: 74 },
      ...todo.map((id, i) => ({
        id: zid("hoy", id),
        act: "toggle",
        x: 10,
        y: xs(271, 7)[i],
        w: 476,
        h: 24,
      })),
      { id: zid("hoy", "b-12"), act: "toggle", x: 508, y: 70, w: 282, h: 24 },
      { id: zid("hoy", "b-13"), act: "toggle", x: 508, y: 94, w: 282, h: 24 },
    ];
    expect(hoy.zones).toHaveLength(11);
    expect(hoy.zones.map((z) => ({ id: z.id, act: z.act, ...rect(z) }))).toEqual(expected);
    expect(hoy.zones[8]?.y).toBe(415);
    expect(hoy.hidden).toEqual({ tareas: 2, hechas: 0, mes: 0 });

    const img = hoy.raw1;
    const black = (x: number, y: number): boolean => isBlack(img, 800, x, y);
    for (const [x, y] of [
      [11, 47],
      [484, 68],
      [200, 269],
      [200, 270],
      [13, 90],
      [515, 81],
      [600, 68],
      [600, 69],
    ] as const)
      expect(black(x, y), `negro en (${String(x)}, ${String(y)})`).toBe(true);
    for (const [x, y] of [
      [200, 258],
      [200, 268],
      [20, 90],
    ] as const)
      expect(black(x, y), `blanco en (${String(x)}, ${String(y)})`).toBe(false);

    let whites = 0;
    for (let y = 46; y <= 69; y++) for (let x = 10; x <= 485; x++) if (!black(x, y)) whites++;
    expect(whites).toBeGreaterThanOrEqual(50);
  }, 90_000);
});

describe("CA4 vencida", () => {
  it("b-02 invertida; b-06 y b-04 sin invertir", async () => {
    const { views } = await drawn(P124, { views: ["hoy"] });
    const img = viewOf(views, "hoy").raw1;
    expect(isBlack(img, 800, 484, 274)).toBe(true);
    expect(isBlack(img, 800, 484, 291)).toBe(true);
    expect(isBlack(img, 800, 484, 345)).toBe(false);
    expect(isBlack(img, 800, 484, 300)).toBe(false);
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
    expect(rect(hoy.zones[0] as never)).toEqual({ x: 10, y: 133, w: 476, h: 24 });
    expect(isBlack(hoy.raw1, 800, 11, 47)).toBe(true);
  }, 90_000);
});

describe("CA8 tablero en P124", () => {
  it("zonas en orden, hidden y sin desborde", async () => {
    const { views } = await drawn(P124, { views: ["tablero"] });
    const v = viewOf(views, "tablero");
    expect(v.overflow).toEqual([]);
    expect(v.tooSmall).toEqual([]);
    const todo = ["b-02", "b-04", "b-05", "b-06", "b-07"];
    const expected = [
      { id: zid("tablero", "b-01"), x: 268, y: 77, w: 282, h: 74 },
      { id: zid("tablero", "b-03"), x: 268, y: 158, w: 282, h: 74 },
      ...todo.map((id, i) => ({ id: zid("tablero", id), x: 10, y: 77 + 67 * i, w: 236, h: 60 })),
      { id: zid("tablero", "b-12"), x: 572, y: 77, w: 218, h: 60 },
      { id: zid("tablero", "b-13"), x: 572, y: 144, w: 218, h: 60 },
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
    expect(rect(hoy.zones[0] as never)).toEqual({ x: 10, y: 77, w: 460, h: 74 });
    expect(hoy.hidden.tareas).toBe(3);
    const hechas = hoy.zones.filter((z) => z.y >= 492);
    expect(hechas.map(rect).slice(0, 2)).toEqual([
      { x: 10, y: 492, w: 460, h: 24 },
      { x: 10, y: 516, w: 460, h: 24 },
    ]);
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
