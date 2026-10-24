/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- JSON de prueba */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Panel } from "../../../contract/src/index.ts";
import { checkThemeGlyphs, zoneId } from "../../../server/src/engine/index.ts";
import {
  P124,
  P200,
  V124,
  anyBlack,
  cfgFrom,
  dataFrom,
  getViews,
  launchChromium,
  makeClock,
  mkEngine,
  only,
  viewOf,
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

describe("CA11 desbordes y espacio insuficiente", () => {
  it("el Renderer devuelve el área que se desborda", async () => {
    const html =
      '<!doctype html><html><body style="margin:0"><div data-fit="x" style="width:50px;height:20px;overflow:hidden;white-space:nowrap">texto que no cabe en cincuenta píxeles</div></body></html>';
    const out = await cr.renderer.render(html, P124);
    expect(out.overflow).toEqual(["x"]);
  }, 60_000);

  it("task-list en 80 px → tooSmall, sin desborde y sin zonas", async () => {
    const config = cfgFrom((o: Loose) => {
      o.views.push({
        id: "chica",
        title: "Chica",
        grid: { columns: [10, 90], rows: [100], areas: [["lista", "resto"]] },
        slots: {
          lista: { block: "task-list", source: "tareas" },
          resto: { block: "month-calendar", source: "calendario" },
        },
      });
      o.devices["*"].views = ["chica"];
    });
    const engine = mkEngine(cr.renderer, { config, data: dataFrom(config) });
    try {
      const { views } = await getViews(engine, "local", P124);
      const v = viewOf(views, "chica");
      expect(v.tooSmall).toEqual(["lista"]);
      expect(v.overflow).toEqual([]);
      expect(v.zones).toEqual([]);
    } finally {
      await engine.idle();
      await engine.close();
    }
  }, 60_000);

  const panels: [string, Panel][] = [
    ["P124", P124],
    ["P200", P200],
    ["V124", V124],
  ];
  for (const [name, panel] of panels) {
    it(`todas las vistas de los ejemplos en ${name} sin desborde`, async () => {
      const config = cfgFrom();
      const engine = mkEngine(cr.renderer, { config, data: dataFrom(config) });
      try {
        const { views } = await getViews(engine, "local", panel);
        expect(views.map((v) => v.id)).toEqual(["hoy", "pendientes", "agenda"]);
        for (const v of views) {
          expect(v.overflow, v.id).toEqual([]);
          expect(v.tooSmall, v.id).toEqual([]);
        }
      } finally {
        await engine.idle();
        await engine.close();
      }
    }, 60_000);
  }
});

describe("CA12 agenda", () => {
  it("5 zonas open en y = 68, 92, 116, 162, 208; e-001 y e-006 sin zona", async () => {
    const config = cfgFrom(only(["agenda"]));
    const engine = mkEngine(cr.renderer, { config, data: dataFrom(config) });
    try {
      const { views } = await getViews(engine, "local", P124);
      const v = viewOf(views, "agenda");
      const ids = ["e-002", "e-003", "e-004", "e-005", "e-007"];
      expect(v.zones.map((z) => z.id)).toEqual(ids.map((i) => zoneId("agenda", "calendario", i)));
      expect(v.zones.map((z) => z.y)).toEqual([68, 92, 116, 162, 208]);
      expect(v.zones.every((z) => z.act === "open")).toBe(true);
      for (const gone of ["e-001", "e-006"])
        expect(v.zones.some((z) => z.id === zoneId("agenda", "calendario", gone))).toBe(false);
    } finally {
      await engine.idle();
      await engine.close();
    }
  }, 60_000);

  it("America/Lima: un evento de las 21:00 del 23 sale bajo el día 23", async () => {
    // A (2026-10-24T02:00Z = 21:00 del 23 en Lima) y B (10:00 del 24 en Lima).
    // Si A estuviera bajo el 24, B compartiría su encabezado (y = 92); bajo el 23, B va tras un segundo encabezado (y = 114).
    const config = cfgFrom((o: Loose) => {
      o.timezone = "America/Lima";
      o.devices["*"].views = ["agenda"];
    });
    const data = dataFrom(config, (o: Loose) => {
      o.sources.calendario.items = [
        { id: "e-a", title: "Evento A", start: "2026-10-24T02:00:00Z" },
        { id: "e-b", title: "Evento B", start: "2026-10-24T15:00:00Z" },
      ];
    });
    const clk = makeClock("2026-10-24T03:00:00Z");
    const engine = mkEngine(cr.renderer, { config, data, clock: clk.clock });
    try {
      const { views } = await getViews(engine, "local", P124);
      const v = viewOf(views, "agenda");
      expect(v.zones.map((z) => z.id)).toEqual([
        zoneId("agenda", "calendario", "e-a"),
        zoneId("agenda", "calendario", "e-b"),
      ]);
      expect(v.zones.map((z) => z.y)).toEqual([68, 114]);
    } finally {
      await engine.idle();
      await engine.close();
    }
  }, 60_000);
});

describe("CA19 texto peligroso", () => {
  const evil =
    '<img src="http://example.invalid/x"><script>document.title=1</script></style><style>*{display:none}</style>';

  it("el título se dibuja como texto: zona, gray 0, sin desborde y sin peticiones", async () => {
    const config = cfgFrom(only(["pendientes"]));
    const data = dataFrom(config, (o: Loose) => {
      o.sources.tareas.items = [
        { id: "t-evil", title: evil, done: false, category: "Casa" },
        ...o.sources.tareas.items.slice(0, 3),
      ];
    });
    const engine = mkEngine(cr.renderer, { config, data });
    const calls0 = cr.renderer.calls.length;
    const blocked0 = cr.renderer.blockedRequests();
    try {
      const { views } = await getViews(engine, "local", P124);
      const v = viewOf(views, "pendientes");
      expect(v.zones.some((z) => z.id === zoneId("pendientes", "tareas", "t-evil"))).toBe(true);
      expect(v.overflow).toEqual([]);
      const mine = cr.renderer.calls.slice(calls0);
      expect(mine.length).toBeGreaterThan(0);
      for (const c of mine) {
        expect(c.out.gray).toBe(0);
        expect(c.out.overflow).toEqual([]);
      }
      expect(cr.renderer.blockedRequests()).toBe(blocked0);
    } finally {
      await engine.idle();
      await engine.close();
    }
  }, 60_000);

  it("un <img> escrito a mano sí intenta salir y se bloquea (y se cuenta)", async () => {
    const before = cr.renderer.blockedRequests();
    const html =
      '<!doctype html><html><body style="margin:0"><img src="http://example.invalid/x"></body></html>';
    const out = await cr.renderer.render(html, P124);
    expect(out.raw1.length).toBe(48_000);
    const end = Date.now() + 3000;
    while (cr.renderer.blockedRequests() <= before && Date.now() < end)
      await new Promise((r) => setTimeout(r, 50));
    expect(cr.renderer.blockedRequests()).toBeGreaterThan(before);
  }, 60_000);
});

describe("CA25 letras del tema", () => {
  it("checkThemeGlyphs en P124 y P200 devuelve []", async () => {
    expect(await checkThemeGlyphs(cr.renderer, P124)).toEqual([]);
    expect(await checkThemeGlyphs(cr.renderer, P200)).toEqual([]);
  }, 120_000);

  it("una letra de mapa de bits en una talla que no trae sale en blanco", async () => {
    const html =
      '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff;color:#000"><div style="font-family:Terminus;font-size:17px">ñ</div></body></html>';
    const out = await cr.renderer.render(html, P124);
    expect(out.raw1.length).toBe(48_000);
    expect(anyBlack(out.raw1)).toBe(false);
  }, 60_000);

  it("control: la misma letra en una talla que sí trae (16 px) deja píxeles negros", async () => {
    const html =
      '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff;color:#000"><div style="font-family:Terminus;font-size:16px">ñ</div></body></html>';
    const out = await cr.renderer.render(html, P124);
    expect(anyBlack(out.raw1)).toBe(true);
  }, 60_000);
});
