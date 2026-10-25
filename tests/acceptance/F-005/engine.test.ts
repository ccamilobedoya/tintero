/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- JSON de prueba */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Action } from "../../../contract/src/index.ts";
import { zoneId, type Engine } from "../../../server/src/engine/index.ts";
import {
  P124,
  V124,
  isBlack,
  launchChromium,
  makeClock,
  mkEngine,
  getViews,
  viewOf,
  dataFrom,
  cfgFrom,
  dataText,
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

let seq = 0;
const act = (view: string, zone: string, a: "toggle" | "open"): Action => ({
  id: `acc-f005-${String(++seq).padStart(6, "0")}`,
  view,
  zone,
  act: a,
  at: 1_790_000_000,
});

const engines: Engine[] = [];
function engine(parts: Parameters<typeof mkEngine>[1] = {}): Engine {
  const e = mkEngine(cr.renderer, parts);
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

describe("CA13 abrir un detalle", () => {
  it("open sobre e-003 en agenda → agenda-d, current una sola vez", async () => {
    const e = engine();
    await getViews(e, "local", P124);
    const r = e.apply("local", act("agenda", zoneId("agenda", "calendario", "e-003"), "open"));
    expect(r.status).toBe("applied");
    expect(r.changed).toBe(true);

    const first = await getViews(e, "local", P124);
    expect(first.current).toBe("agenda-d");
    const detail = viewOf(first.views, "agenda-d");
    expect(detail.parent).toBe("agenda");
    expect(detail.zones).toEqual([]);

    const second = await getViews(e, "local", P124);
    expect(second.current).toBe("hoy");
    expect(second.views.some((v) => v.id === "agenda-d")).toBe(true);
  }, 90_000);

  it("open sobre j-142 en hoy → hoy-d", async () => {
    const e = engine();
    await getViews(e, "local", P124);
    const r = e.apply("local", act("hoy", zoneId("hoy", "jira", "j-142"), "open"));
    expect(r).toMatchObject({ status: "applied", changed: true });
    const first = await getViews(e, "local", P124);
    expect(first.current).toBe("hoy-d");
    expect(viewOf(first.views, "hoy-d").parent).toBe("hoy");
    expect(viewOf(first.views, "hoy-d").zones).toEqual([]);
    expect((await getViews(e, "local", P124)).current).toBe("hoy");
  }, 90_000);
});

describe("CA14 marcar", () => {
  it("toggle de t-001: dos dibujos, agenda intacta, casilla negra; luego los casos stale", async () => {
    const e = engine();
    const before = await getViews(e, "local", P124);
    const agendaHash = viewOf(before.views, "agenda").hash;
    // F-008: el centro de la casilla (15 px) está en zona.x + focusPad (6) + 7; se mira la columna de la zona
    const box = (views: Awaited<ReturnType<typeof getViews>>["views"]): number => {
      const v = viewOf(views, "pendientes");
      const z = v.zones.find((q) => q.id === zoneId("pendientes", "tareas", "t-001"));
      if (!z) throw new Error("zona de t-001");
      let n = 0;
      for (let y = z.y; y < z.y + z.h; y++) if (isBlack(v.raw1, 800, z.x + 13, y)) n++;
      return n;
    };
    expect(box(before.views)).toBeLessThanOrEqual(8);
    const n0 = e.renders();

    const toggle = act("pendientes", zoneId("pendientes", "tareas", "t-001"), "toggle");
    expect(e.apply("local", toggle)).toEqual({ status: "applied", changed: true });
    await e.idle();
    expect(e.renders() - n0).toBe(2);

    const after = await getViews(e, "local", P124);
    expect(viewOf(after.views, "agenda").hash).toBe(agendaHash);
    expect(box(after.views)).toBeGreaterThanOrEqual(12);
    expect(e.renders() - n0).toBe(2);

    expect(e.apply("local", toggle).status).toBe("duplicate");

    const stale: [string, Action][] = [
      ["toggle sobre jira (readonly)", act("hoy", zoneId("hoy", "jira", "j-142"), "toggle")],
      ["toggle sobre agenda", act("agenda", zoneId("agenda", "calendario", "e-003"), "toggle")],
      ["open sobre pendientes", act("pendientes", zoneId("pendientes", "tareas", "t-001"), "open")],
      ["zona inexistente", act("pendientes", "zffffffffff", "toggle")],
    ];
    for (const [name, a] of stale) expect(e.apply("local", a).status, name).toBe("stale");
  }, 90_000);
});

describe("CA16 cambio de día", () => {
  it("al cambiar la fecha local se redibujan las 3 vistas", async () => {
    const clk = makeClock("2026-10-23T12:00:00Z");
    const e = engine({ clock: clk.clock });
    const day23 = await getViews(e, "local", P124);
    expect(e.renders()).toBe(3);
    const ids23 = viewOf(day23.views, "agenda").zones.map((z) => z.id);
    for (const id of ["e-002", "e-003", "e-004"])
      expect(ids23).toContain(zoneId("agenda", "calendario", id));

    clk.set("2026-10-24T00:00:01Z");
    const day24 = await getViews(e, "local", P124);
    expect(e.renders()).toBe(6);
    const ids24 = viewOf(day24.views, "agenda").zones.map((z) => z.id);
    for (const id of ["e-002", "e-003", "e-004"])
      expect(ids24).not.toContain(zoneId("agenda", "calendario", id));
  }, 90_000);
});

describe("CA23 un servicio avisa", () => {
  const tasks = (): unknown[] => {
    const o: Loose = JSON.parse(dataText());
    return o.sources.tareas.items;
  };

  it("setSource cambia datos, redibuja 2 vistas y es idempotente", async () => {
    const e = engine();
    const before = await getViews(e, "local", P124);
    // F-008: la casilla va en zona.x + focusPad; se toma la primera tarea pendiente visible en hoy
    // y se mira la columna del centro de la casilla (zona.x + 6 + 7) dentro de su zona.
    const hoyZones = viewOf(before.views, "hoy").zones;
    const pick = tasks()
      .map((t) => t as Loose)
      .find((t) => !t.done && hoyZones.some((z) => z.id === zoneId("hoy", "tareas", String(t.id))));
    expect(pick).toBeDefined();
    const pickId = String(pick?.id);
    const box = (views: Awaited<ReturnType<typeof getViews>>["views"]): number => {
      const v = viewOf(views, "hoy");
      const z = v.zones.find((q) => q.id === zoneId("hoy", "tareas", pickId));
      if (!z) throw new Error("zona de la tarea");
      let n = 0;
      for (let y = z.y; y < z.y + z.h; y++) if (isBlack(v.raw1, 800, z.x + 6 + 7, y)) n++;
      return n;
    };
    expect(box(before.views)).toBeLessThanOrEqual(8);
    const n0 = e.renders();

    const items = tasks().map((t) => ({ ...(t as object) })) as Loose[];
    const t5 = items.find((t) => t.id === pickId);
    expect(t5).toBeDefined();
    if (t5) t5.done = true;

    expect(e.setSource("tareas", items)).toEqual({ ok: true, changed: true });
    await e.idle();
    expect(e.renders() - n0).toBe(2);
    const after = await getViews(e, "local", P124);
    expect(box(after.views)).toBeGreaterThanOrEqual(12);

    expect(e.setSource("tareas", items)).toEqual({ ok: true, changed: false });
    await e.idle();
    expect(e.renders() - n0).toBe(2);
  }, 90_000);

  it("fuente inexistente o elementos inválidos → ok:false sin contenido", () => {
    const e = engine({ config: cfgFrom(), data: dataFrom(cfgFrom()) });
    const a = e.setSource("nada", []);
    const b = e.setSource("tareas", [{ id: "x" }]);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    const text = JSON.stringify([a, b]);
    for (const t of ["Pagar la factura", "Café y azúcar", "PROJ-"]) expect(text).not.toContain(t);
  });
});

describe("CA27 la revisión de letras no frena las vistas", () => {
  it("tres motores sobre el mismo Renderer real: el primer index de cada uno no da busy", async () => {
    const a = engine();
    const b = engine();
    const c = engine();
    const first = await Promise.all([
      a.index("local", P124),
      b.index("local", P124),
      c.index("local", P124),
    ]);
    for (const r of first) expect(r.ok, JSON.stringify(r.ok ? "ok" : r)).toBe(true);
    // Right away, without waiting for idle(): a new panel on each engine.
    const more = await Promise.all([
      a.index("local", V124),
      b.index("local", V124),
      c.index("local", V124),
    ]);
    for (const r of more) expect(r.ok, JSON.stringify(r.ok ? "ok" : r)).toBe(true);
  }, 180_000);
});

describe("CA24 preparado antes de despertar", () => {
  it("prewarm dibuja con la fecha de la despertada y el index no dibuja", async () => {
    const clk = makeClock("2026-10-23T23:30:30Z");
    const e = engine({ clock: clk.clock, nextWakeS: 1800 });
    await getViews(e, "local", P124);
    expect(e.renders()).toBe(3);

    clk.set("2026-10-23T23:59:00Z");
    await e.prewarm();
    await e.idle();
    expect(e.renders()).toBe(3);

    clk.set("2026-10-23T23:59:40Z");
    await e.prewarm();
    await e.idle();
    expect(e.renders()).toBe(6);

    clk.set("2026-10-24T00:00:30Z");
    const { views } = await getViews(e, "local", P124);
    expect(e.renders()).toBe(6);
    const ids = viewOf(views, "agenda").zones.map((z) => z.id);
    for (const id of ["e-002", "e-003", "e-004"])
      expect(ids).not.toContain(zoneId("agenda", "calendario", id));
  }, 120_000);
});
