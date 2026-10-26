import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  P124,
  V124,
  act6,
  blackIn,
  checkFocusBand,
  closeEngines15,
  draw15,
  drawEngine,
  index8,
  launchChromium,
  mkEngine15,
  pixelErrors,
  rect,
  rowHtml,
  view15,
  view8,
  za,
  zb,
  calendarItems,
  type Drawn15,
  type Rect,
  type TestChromium,
} from "./helpers.ts";

let cr: TestChromium;
let hoy: Drawn15; // CA5 a CA7, CA9: hoy, P124
let tab: Drawn15; // CA9: tablero, P124
let vert: Drawn15; // CA8: hoy, V124

beforeAll(async () => {
  cr = await launchChromium();
  hoy = await draw15(cr, P124, { views: ["hoy"] });
  tab = await draw15(cr, P124, { views: ["tablero"] });
  vert = await draw15(cr, V124, { views: ["hoy"] });
}, 300_000);
afterAll(async () => {
  await closeEngines15();
  await cr.stop();
}, 120_000);

const R = (x0: number, x1: number, y0: number, y1: number): Rect => ({ x0, x1, y0, y1 });
const ink = (d: Drawn15, w: number, r: Rect, view = "hoy"): number =>
  blackIn(view15(d, view).raw1, w, r);

const TODO6 = ["b-02", "b-04", "b-05", "b-06", "b-07", "b-08"];
const hoyZones = (): { id: string; x: number; y: number; w: number; h: number }[] => [
  { id: zb("b-01"), x: 8, y: 73, w: 480, h: 86 },
  { id: zb("b-03"), x: 8, y: 162, w: 480, h: 66 },
  ...TODO6.map((id, i) => ({ id: zb(id), x: 8, y: 267 + 30 * i, w: 480, h: 30 })),
  ...["a1", "a2", "a3", "a4"].map((id, i) => ({
    id: za(id),
    x: 504,
    y: 70 + 30 * i,
    w: 288,
    h: 30,
  })),
];

describe("CA5 hoy en P124: zonas", () => {
  it("los ids de zona son los de la ficha", () => {
    expect(zb("b-01")).toBe("z4ba4457e13");
    expect(zb("b-02")).toBe("z5b74b95d24");
    expect(zb("b-03")).toBe("z3d65c6d137");
    expect(zb("b-04")).toBe("zf8f7e4b81e");
    expect(za("a1")).toBe("zf8faa2bc7d");
    expect(za("a2")).toBe("zef968bcff6");
    expect(za("a3")).toBe("zca171a63fb");
    expect(za("a4")).toBe("z36b3904560");
  });

  it("12 zonas en su sitio, hidden, sin desborde, acciones", () => {
    const v = view15(hoy, "hoy");
    expect(v.zones.map((z) => ({ id: z.id, ...rect(z) }))).toEqual(hoyZones());
    expect(v.zones).toHaveLength(12);
    expect(v.zones[7]?.y).toBe(417);
    expect(v.hidden).toEqual({ tareas: 3, proximos: 8, mes: 0 });
    expect(v.overflow).toEqual([]);
    expect(v.tooSmall).toEqual([]);
    expect(v.bandInk).toEqual([]);
    expect(hoy.gray.length).toBeGreaterThan(0);
    for (const g of hoy.gray) expect(g).toBe(0);
    for (const o of hoy.overflow) expect(o).toEqual([]);
    for (const z of v.zones.slice(0, 8)) expect(z.act, z.id).toBe("toggle");
    for (const z of v.zones.slice(8)) expect(z.act, z.id).toBe("open");
  });

  it("presupuesto: dibujar hoy en P124 + checkFocusBand ≤ 420 ms de mediana (el tope de F-008)", async () => {
    const html = hoy.htmls.at(-1) ?? "";
    expect(html).not.toBe("");
    const zones = view15(hoy, "hoy").zones;
    await cr.renderer.render(html, P124);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const out = await cr.renderer.render(html, P124);
      checkFocusBand(out.raw1, P124, zones, 6);
      times.push(performance.now() - t0);
    }
    const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? Infinity;
    console.log(
      `PRESUPUESTO hoy F-015 ms: ${times.map((t) => t.toFixed(0)).join(",")} mediana ${median.toFixed(0)}`,
    );
    expect(median).toBeLessThan(420);
  }, 120_000);
});

describe("CA6 hoy en P124: franjas", () => {
  const W = P124.w;
  const raw = (): Uint8Array => view15(hoy, "hoy").raw1;

  it("franja de eventos", () => {
    expect(
      pixelErrors(
        raw(),
        W,
        [
          [600, 68],
          [600, 69],
          [504, 68],
          [791, 68],
        ],
        [
          [600, 67],
          [600, 70],
          [503, 68],
          [792, 68],
        ],
      ),
    ).toEqual([]);
    expect(ink(hoy, W, R(510, 651, 51, 62))).toBeGreaterThan(0); // la etiqueta
    expect(ink(hoy, W, R(741, 791, 46, 67))).toBeGreaterThan(0); // el 12
  });

  it("el HTML trae la etiqueta PRÓXIMOS EVENTOS y a su derecha 12", () => {
    const html = hoy.htmls.join("\n");
    const at = html.indexOf("PRÓXIMOS EVENTOS");
    expect(at, "etiqueta en mayúsculas").toBeGreaterThan(-1);
    const strip = html.slice(at, html.indexOf("</div>", at));
    expect(strip).toMatch(/>\s*12\s*</);
  });

  it("raya de Por hacer", () => {
    expect(
      pixelErrors(
        raw(),
        W,
        [
          [200, 265],
          [200, 266],
        ],
        [
          [200, 264],
          [200, 267],
        ],
      ),
    ).toEqual([]);
  });

  it("franja del mes: raya y el aire entre el mes y el festivo", () => {
    expect(
      pixelErrors(
        raw(),
        W,
        [
          [600, 270],
          [600, 271],
        ],
        [
          [600, 269],
          [600, 272],
        ],
      ),
    ).toEqual([]);
    expect(ink(hoy, W, R(616, 632, 250, 268))).toBe(0);
    expect(ink(hoy, W, R(633, 783, 250, 268))).toBeGreaterThan(0);
  });
});

describe("CA7 hoy en P124: columna de día", () => {
  const W = P124.w;
  it("el día solo en la primera fila de cada día", () => {
    expect(ink(hoy, W, R(504, 560, 76, 93))).toBeGreaterThan(0); // Hoy
    expect(ink(hoy, W, R(504, 560, 136, 153))).toBeGreaterThan(0); // Mañana
    expect(ink(hoy, W, R(504, 560, 106, 123))).toBe(0);
    expect(ink(hoy, W, R(504, 560, 166, 183))).toBe(0);
  });

  it("pictograma, hora y título empiezan a la misma x en las cuatro filas", () => {
    expect(ink(hoy, W, R(557, 564, 70, 189))).toBe(0);
  });
});

describe("CA8 hoy en V124", () => {
  const W = V124.w;
  it("zonas, hidden y raya de la franja de eventos", () => {
    const v = view15(vert, "hoy");
    expect(v.hidden).toEqual({ tareas: 4, proximos: 10, mes: 0 });
    expect(v.tooSmall).toEqual([]);
    const a1 = v.zones.find((z) => z.id === za("a1"));
    const a2 = v.zones.find((z) => z.id === za("a2"));
    expect(a1 && rect(a1)).toEqual({ x: 8, y: 492, w: 464, h: 30 });
    expect(a2 && rect(a2)).toEqual({ x: 8, y: 522, w: 464, h: 30 });
    expect(
      pixelErrors(
        v.raw1,
        W,
        [
          [200, 490],
          [200, 491],
        ],
        [
          [200, 489],
          [200, 492],
        ],
      ),
    ).toEqual([]);
  });

  it("el día en la fila de a1 y no en la de a2", () => {
    expect(ink(vert, W, R(8, 44, 498, 515))).toBeGreaterThan(0);
    expect(ink(vert, W, R(8, 44, 528, 545))).toBe(0);
  });
});

describe("CA9 D2: filas sin fecha ni categoría", () => {
  it("en hoy: b-03 mide 66 y b-01 (con due) 86", () => {
    const v = view15(hoy, "hoy");
    expect(v.zones.find((z) => z.id === zb("b-03"))?.h).toBe(66);
    expect(v.zones.find((z) => z.id === zb("b-01"))?.h).toBe(86);
  });

  it("en tablero: b-03 66; b-04 52 y b-02 72", () => {
    const v = view15(tab, "tablero");
    const h = (id: string): number | undefined =>
      v.zones.find((z) => z.id === zb(id, "tablero"))?.h;
    expect(h("b-03")).toBe(66);
    expect(h("b-04")).toBe(52);
    expect(h("b-02")).toBe(72);
    expect(h("b-01")).toBe(86);
  });

  it("en el HTML de la fila de b-03 no hay línea de detalle (letra Terminus); en la de b-01 sí", () => {
    const html = hoy.htmls.find((h) => h.includes(zb("b-03"))) ?? "";
    expect(html).not.toBe("");
    const b3 = rowHtml(html, zb("b-03"));
    expect(b3).toContain("Escribir la ficha");
    expect(b3).not.toContain("Terminus");
    const b1 = rowHtml(html, zb("b-01"));
    expect(b1).toContain("Terminus");
  });
});

describe("CA10 Aceptar se ve", () => {
  it("tras un toggle sobre b-02: En progreso entre b-01 y b-03; tras el tercero, como al principio", async () => {
    const e = mkEngine15(cr.renderer, { views: ["hoy"] });
    await index8(e, "local", P124);
    await e.idle();
    const id = zb("b-02");
    const again = async (): Promise<ReturnType<typeof view8>> => {
      await e.idle();
      const r = await index8(e, "local", P124);
      await e.idle();
      return view8(r.views, "hoy");
    };

    expect(e.apply("local", act6("hoy", id, "toggle")).status).toBe("applied");
    const one = await again();
    const first6 = one.zones.slice(0, 6).map((z) => ({ id: z.id, ...rect(z) }));
    expect(first6).toEqual([
      { id: zb("b-01"), x: 8, y: 73, w: 480, h: 86 },
      { id, x: 8, y: 162, w: 480, h: 86 },
      { id: zb("b-03"), x: 8, y: 251, w: 480, h: 66 },
      { id: zb("b-04"), x: 8, y: 356, w: 480, h: 30 },
      { id: zb("b-05"), x: 8, y: 386, w: 480, h: 30 },
      { id: zb("b-06"), x: 8, y: 416, w: 480, h: 30 },
    ]);
    expect(one.hidden.tareas).toBe(5);
    expect(
      pixelErrors(one.raw1, P124.w, [[15, 181]], [[23, 181]]), // casilla a medias
    ).toEqual([]);

    expect(e.apply("local", act6("hoy", id, "toggle")).status).toBe("applied");
    await again();
    expect(e.apply("local", act6("hoy", id, "toggle")).status).toBe("applied");
    const three = await again();
    expect(three.zones.map((z) => ({ id: z.id, ...rect(z) }))).toEqual(hoyZones());
    expect(three.hash).toBe(view15(hoy, "hoy").hash);
  }, 180_000);
});

describe("CA11 el aviso va en la franja", () => {
  const stripOf = (htmls: string[]): string => {
    const html = htmls.join("\n");
    const at = html.indexOf("PRÓXIMOS EVENTOS");
    expect(at, "etiqueta").toBeGreaterThan(-1);
    return html.slice(at, html.indexOf("</div>", at));
  };

  it("readAt de las 12:50Z con el reloj a las 13:00Z → «sin datos desde 07:50» y no 12", async () => {
    const e = mkEngine15(cr.renderer, { views: ["hoy"] });
    expect(
      e.setSource("calendario", calendarItems(), { readAt: new Date("2026-10-26T12:50:00Z") }),
    ).toMatchObject({ ok: true });
    const d = await drawEngine(cr, e, P124);
    const strip = stripOf(d.htmls);
    expect(strip).toContain("sin datos desde 07:50");
    expect(strip).not.toMatch(/>\s*12\s*</);
  }, 120_000);

  it("readAt de las 12:58Z → 12", async () => {
    const e = mkEngine15(cr.renderer, { views: ["hoy"] });
    expect(
      e.setSource("calendario", calendarItems(), { readAt: new Date("2026-10-26T12:58:00Z") }),
    ).toMatchObject({ ok: true });
    const d = await drawEngine(cr, e, P124);
    const strip = stripOf(d.htmls);
    expect(strip).not.toContain("sin datos desde");
    expect(strip).toMatch(/>\s*12\s*</);
  }, 120_000);
});
