/* eslint-disable @typescript-eslint/no-unsafe-member-access -- JSON de prueba e índices de listas */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Engine } from "../../../server/src/engine/index.ts";
import {
  AFTER_MIDNIGHT,
  NOW,
  P124,
  act6,
  getViews,
  isBlack,
  launchChromium,
  makeClock,
  mkEngine6,
  rect,
  sameBytes,
  setSourceAt,
  tableroItems,
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
function engine(opts: Parameters<typeof mkEngine6>[1] = {}): Engine {
  const e = mkEngine6(cr.renderer, opts);
  engines.push(e);
  return e;
}
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

describe("CA5 hecho hoy y medianoche", () => {
  it("hechas tiene b-12 y b-13 (no b-14)", async () => {
    const e = engine();
    const { views } = await getViews(e, "local", P124);
    const ids = viewOf(views, "hoy").zones.map((z) => z.id);
    expect(ids).toContain(zid("hoy", "b-12"));
    expect(ids).toContain(zid("hoy", "b-13"));
    expect(ids).not.toContain(zid("hoy", "b-14"));
    const tab = viewOf(views, "tablero").zones.map((z) => z.id);
    expect(tab).not.toContain(zid("tablero", "b-14"));
  }, 90_000);

  it("a las 00:01 del 25 cambia la huella, hechas sin zonas y «Nada hecho hoy.»", async () => {
    const clk = makeClock(NOW);
    const e = engine({ clock: clk.clock });
    const day24 = await getViews(e, "local", P124);
    const h24 = viewOf(day24.views, "hoy").hash;
    const t24 = viewOf(day24.views, "tablero").hash;
    await e.idle();
    const n0 = cr.renderer.calls.length;

    clk.set(AFTER_MIDNIGHT);
    const day25 = await getViews(e, "local", P124);
    await e.idle();
    const hoy = viewOf(day25.views, "hoy");
    expect(hoy.hash).not.toBe(h24);
    expect(viewOf(day25.views, "tablero").hash).not.toBe(t24);
    const ids = hoy.zones.map((z) => z.id);
    expect(ids).not.toContain(zid("hoy", "b-12"));
    expect(ids).not.toContain(zid("hoy", "b-13"));
    expect(hoy.hidden.hechas).toBe(0);
    const html = cr.renderer.calls
      .slice(n0)
      .map((c) => c.html)
      .join("\n");
    expect(html).toContain("Nada hecho hoy.");
  }, 90_000);
});

describe("CA6 marcar y deshacer", () => {
  it("toggle de b-01, segundo toggle desde Hecho, y duplicate", async () => {
    const e = engine();
    const first = await getViews(e, "local", P124);
    const hash0 = viewOf(first.views, "hoy").hash;
    await e.idle();
    const n0 = e.renders();

    const a1 = act6("hoy", zid("hoy", "b-01"), "toggle");
    expect(e.apply("local", a1)).toEqual({ status: "applied", changed: true });
    await e.idle();
    expect(e.renders() - n0).toBe(2);

    const after = await getViews(e, "local", P124);
    const hoy = viewOf(after.views, "hoy");
    // F-008: con filas de 30 px caben menos zonas; los ids visibles son un prefijo del orden anterior
    // y «zonas visibles + hidden» sigue siendo 10 (b-03 y 9 pendientes).
    const todoIds = ["b-02", "b-04", "b-05", "b-06", "b-07", "b-08", "b-09", "b-10", "b-11"];
    const ids = hoy.zones.map((z) => z.id);
    const hechasIds = ["b-01", "b-12", "b-13"].map((i) => zid("hoy", i));
    expect(ids.slice(-3)).toEqual(hechasIds);
    const tareasIds = ids.slice(0, -3);
    const tareasFull = ["b-03", ...todoIds].map((i) => zid("hoy", i));
    expect(tareasIds).toEqual(tareasFull.slice(0, tareasIds.length));
    expect(tareasIds[0]).toBe(zid("hoy", "b-03"));
    expect(tareasIds.length + (hoy.hidden.tareas ?? 0)).toBe(10);
    expect(hoy.hidden.hechas).toBe(0);
    expect(rect(hoy.zones[hoy.zones.length - 3] as never)).toEqual({
      x: 504,
      y: 70,
      w: 288,
      h: 30,
    });

    expect(e.apply("local", a1).status).toBe("duplicate");

    // F-015 (D3): el segundo la lleva a Por hacer (ya no vuelve a En progreso); con un tercero vuelve
    const a2 = act6("hoy", zid("hoy", "b-01"), "toggle");
    expect(e.apply("local", a2)).toEqual({ status: "applied", changed: true });
    await e.idle();
    const second = await getViews(e, "local", P124);
    expect(viewOf(second.views, "hoy").hash).not.toBe(hash0);
    expect(viewOf(second.views, "hoy").zones[0]?.id).not.toBe(zid("hoy", "b-01"));
    const a3 = act6("hoy", zid("hoy", "b-01"), "toggle");
    expect(e.apply("local", a3)).toEqual({ status: "applied", changed: true });
    await e.idle();
    const back = await getViews(e, "local", P124);
    expect(viewOf(back.views, "hoy").hash).toBe(hash0);
    expect(viewOf(back.views, "hoy").zones[0]?.id).toBe(zid("hoy", "b-01"));
  }, 120_000);
});

describe("CA10 sin conexión (motor)", () => {
  const x0 = 10;
  const x1 = 485;
  const y0 = 46;
  const y1 = 69;
  it("readAt reciente no cambia nada; readAt viejo redibuja solo la franja", async () => {
    const e = engine({ views: ["hoy"] });
    const first = await getViews(e, "local", P124);
    await e.idle();
    const before = viewOf(first.views, "hoy");

    const items = tableroItems();
    expect(setSourceAt(e, "tablero", items, new Date("2026-10-24T16:57:00Z"))).toEqual({
      ok: true,
      changed: false,
    });
    await e.idle();
    const recent = await getViews(e, "local", P124);
    expect(viewOf(recent.views, "hoy").hash).toBe(before.hash);

    expect(setSourceAt(e, "tablero", items, new Date("2026-10-24T16:50:00Z"))).toEqual({
      ok: true,
      changed: false,
    });
    await e.idle();
    const stale = await getViews(e, "local", P124);
    const after = viewOf(stale.views, "hoy");
    expect(after.hash).not.toBe(before.hash);
    expect(sameBytes(after.raw1, before.raw1)).toBe(false);
    let diffInside = 0;
    for (let y = 0; y < 480; y++)
      for (let x = 0; x < 800; x++) {
        const differs = isBlack(after.raw1, 800, x, y) !== isBlack(before.raw1, 800, x, y);
        if (!differs) continue;
        const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
        expect(inside, `píxel distinto fuera de la franja en (${String(x)}, ${String(y)})`).toBe(
          true,
        );
        diffInside++;
      }
    expect(diffInside).toBeGreaterThan(0);
  }, 120_000);
});

describe("CA12 solo lectura", () => {
  const readonly = (o: Loose): void => {
    o.sources.tablero.readonly = true;
  };
  it("zonas open, sin casilla; open → hoy-d; toggle → stale", async () => {
    const e = engine({ views: ["hoy"], dataFn: readonly });
    const { views } = await getViews(e, "local", P124);
    const hoy = viewOf(views, "hoy");
    expect(hoy.zones.length).toBeGreaterThan(0);
    for (const z of hoy.zones) expect(z.act).toBe("open");
    // F-008: sin casilla, la columna x = zona.x + 6 no tiene el borde de 15 px de la casilla
    const lead = hoy.zones[0];
    let col = 0;
    for (let y = lead?.y ?? 0; y < (lead?.y ?? 0) + (lead?.h ?? 0); y++)
      if (isBlack(hoy.raw1, 800, (lead?.x ?? 0) + 6, y)) col++;
    expect(col).toBeLessThanOrEqual(12);

    const zone = zid("hoy", "b-01");
    expect(e.apply("local", act6("hoy", zone, "toggle")).status).toBe("stale");
    expect(e.apply("local", act6("hoy", zone, "open"))).toMatchObject({
      status: "applied",
      changed: true,
    });
    const next = await getViews(e, "local", P124);
    expect(next.current).toBe("hoy-d");
  }, 90_000);
});
