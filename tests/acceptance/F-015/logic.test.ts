/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- JSON de prueba */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Action } from "../../../contract/src/index.ts";
import {
  ConfigError,
  parseDataFile,
  parseViewsConfig,
  zoneId,
} from "../../../server/src/engine/index.ts";
import * as datesModule from "../../../server/src/engine/dates.ts";
import type { DayParts } from "../../../server/src/engine/dates.ts";

/** `dayLabel(day, today)` de F-015 (aún no existe al escribir las pruebas: se lee del módulo por nombre). */
function dayLabel(day: DayParts, today: DayParts): string {
  const fn = (datesModule as unknown as Record<string, unknown>).dayLabel;
  if (typeof fn !== "function") throw new Error("dayLabel no está exportada por engine/dates.ts");
  return (fn as (d: DayParts, t: DayParts) => string)(day, today);
}
import {
  NOW15,
  P124,
  act6,
  cfg15,
  closeEngines15,
  hoyDataText,
  hoyViewsText,
  index8,
  isBlack,
  launchChromium,
  makeClock,
  mkEngine,
  mkEngine15,
  view8,
  zb,
  type Change,
  type Loose,
  type TestChromium,
} from "./helpers.ts";

function message(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return (e as ConfigError).message;
  }
  throw new Error("no lanzó ConfigError");
}

let cr: TestChromium;
beforeAll(async () => {
  cr = await launchChromium();
}, 120_000);
afterAll(async () => {
  await closeEngines15();
  await cr.stop();
}, 120_000);

describe("CA1 configuración", () => {
  it("los ejemplos de hoy cargan y dicen lo que la ficha describe", () => {
    const config = parseViewsConfig(hoyViewsText());
    expect(() => parseDataFile(hoyDataText(), config)).not.toThrow();
    const raw: Loose = JSON.parse(hoyViewsText());
    expect(raw.timezone).toBe("America/Lima");
    expect(raw.holidays).toEqual({ country: "CO" });
    expect(raw.devices["*"].views).toEqual(["hoy", "tablero"]);
    const hoy = raw.views[0];
    expect(hoy.id).toBe("hoy");
    expect(hoy.grid).toEqual({
      columns: [62, 38],
      rows: [45, 55],
      areas: [
        ["tareas", "proximos"],
        ["tareas", "mes"],
      ],
    });
    expect(hoy.portrait).toEqual({
      columns: [100],
      rows: [55, 20, 25],
      areas: [["tareas"], ["proximos"], ["mes"]],
    });
    expect(hoy.slots.tareas).toEqual({
      block: "task-board",
      source: "tablero",
      options: { stages: ["doing", "todo"], lead: true },
    });
    expect(hoy.slots.proximos).toEqual({
      block: "agenda",
      source: "calendario",
      title: "Próximos eventos",
      options: { days: 7, layout: "column" },
    });
    expect(hoy.slots.mes).toEqual({ block: "month-calendar", source: "calendario" });
    // la vista `tablero` es la de config/tablero.views.example.json
    expect(raw.views[1].id).toBe("tablero");
  });

  it('layout: "lista" en proximos → ConfigError en /views/0/slots/proximos/options/layout', () => {
    const msg = message(() =>
      cfg15((o: Loose) => {
        o.views[0].slots.proximos.options.layout = "lista";
      }),
    );
    expect(msg).toContain("/views/0/slots/proximos/options/layout");
    expect(msg).toContain("must be days or column");
  });

  it('layout: "days" y "column" cargan en proximos', () => {
    for (const layout of ["days", "column"])
      expect(() =>
        cfg15((o: Loose) => {
          o.views[0].slots.proximos.options.layout = layout;
        }),
      ).not.toThrow();
  });

  it('layout: "column" en tareas (task-board) → campo desconocido en /views/0/slots/tareas/options/layout', () => {
    const msg = message(() =>
      cfg15((o: Loose) => {
        o.views[0].slots.tareas.options.layout = "column";
      }),
    );
    expect(msg).toContain("/views/0/slots/tareas/options/layout");
    expect(msg).toContain("unknown field");
    expect(msg).not.toContain("must be days or column");
  });
});

describe("CA2 dayLabel", () => {
  const today = { y: 2026, m: 10, d: 26 };
  it("con hoy 2026-10-26", () => {
    expect(dayLabel({ y: 2026, m: 10, d: 26 }, today)).toBe("Hoy");
    expect(dayLabel({ y: 2026, m: 10, d: 27 }, today)).toBe("Mañana");
    expect(dayLabel({ y: 2026, m: 10, d: 28 }, today)).toBe("Mié 28");
    expect(dayLabel({ y: 2026, m: 11, d: 1 }, today)).toBe("Dom 1");
    expect(dayLabel({ y: 2026, m: 10, d: 25 }, today)).toBe("Dom 25");
  });

  it("con hoy 2026-12-31, el 2027-01-01 es Mañana", () => {
    expect(dayLabel({ y: 2027, m: 1, d: 1 }, { y: 2026, m: 12, d: 31 })).toBe("Mañana");
  });

  it("los siete días de la semana", () => {
    const names = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    // 2026-11-02 es lunes; hoy es otro día lejano
    names.forEach((name, i) => {
      expect(dayLabel({ y: 2026, m: 11, d: 2 + i }, { y: 2026, m: 10, d: 1 })).toBe(
        `${name} ${String(2 + i)}`,
      );
    });
  });
});

describe("CA3 ciclo de Aceptar", () => {
  it("tres toggle sobre b-02: doing, done, todo; duplicate no llama a onToggle", async () => {
    const clock = makeClock(NOW15);
    const calls: Change[] = [];
    const e = mkEngine15(cr.renderer, { clock: clock.clock, onToggle: (c) => calls.push(c) });
    const refresh = async (): Promise<Awaited<ReturnType<typeof index8>>> => {
      await e.idle();
      const r = await index8(e, "local", P124);
      await e.idle();
      return r;
    };
    await refresh();
    const id = zb("b-02");
    expect(id).toBe("z5b74b95d24");
    const inHoy = (r: Awaited<ReturnType<typeof index8>>): number | undefined =>
      view8(r.views, "hoy").zones.find((z) => z.id === id)?.h;
    const hechas = (r: Awaited<ReturnType<typeof index8>>): number | undefined =>
      view8(r.views, "tablero").zones.find((z) => z.id === zb("b-02", "tablero"))?.x;

    const first = act6("hoy", id, "toggle");
    expect(e.apply("local", first)).toEqual({ status: "applied", changed: true });
    // en progreso: fila que manda (86) en `hoy`
    let r = await refresh();
    expect(inHoy(r)).toBe(86);
    expect(hechas(r)).not.toBe(568);

    expect(e.apply("local", act6("hoy", id, "toggle"))).toEqual({
      status: "applied",
      changed: true,
    });
    // hecha hoy: sale de `hoy` y entra en «Hecho hoy» de `tablero` (columna de x = 568)
    r = await refresh();
    expect(inHoy(r)).toBeUndefined();
    expect(hechas(r)).toBe(568);

    // doneAt = la hora del reloj (08:00 del 26 en Lima): sigue siendo «hoy» a las 18:00 y ya no al día siguiente
    clock.set("2026-10-26T23:00:00Z");
    r = await refresh();
    expect(hechas(r)).toBe(568);
    clock.set("2026-10-27T13:00:00Z");
    r = await refresh();
    expect(hechas(r)).not.toBe(568);
    clock.set(NOW15);
    await refresh();

    expect(e.apply("local", act6("hoy", id, "toggle"))).toEqual({
      status: "applied",
      changed: true,
    });
    r = await refresh();
    const back = view8(r.views, "hoy").zones.find((z) => z.id === id);
    expect(back?.h).toBe(30); // otra vez en Por hacer
    expect(hechas(r)).not.toBe(568);

    expect(calls).toEqual([
      { sourceId: "tablero", taskId: "b-02", stage: "doing", previous: "todo" },
      { sourceId: "tablero", taskId: "b-02", stage: "done", previous: "doing" },
      { sourceId: "tablero", taskId: "b-02", stage: "todo", previous: "done" },
    ]);

    // repetir el id de la primera acción
    expect(e.apply("local", first).status).toBe("duplicate");
    await e.idle();
    expect(calls).toHaveLength(3);
  }, 180_000);

  it("un toggle sobre b-01 (doing) da {stage: done, previous: doing}", async () => {
    const calls: Change[] = [];
    const e = mkEngine15(cr.renderer, { onToggle: (c) => calls.push(c) });
    await index8(e, "local", P124);
    await e.idle();
    const a: Action = act6("hoy", zb("b-01"), "toggle");
    expect(e.apply("local", a)).toEqual({ status: "applied", changed: true });
    await e.idle();
    expect(calls).toEqual([
      { sourceId: "tablero", taskId: "b-01", stage: "done", previous: "doing" },
    ]);
  }, 120_000);
});

describe("CA4 tareas sin etapa (F-005)", () => {
  it("toggle sobre t-001 alterna done y no llama a onToggle", async () => {
    const calls: Change[] = [];
    const e = mkEngine(cr.renderer, { onToggle: (c: Change) => calls.push(c) });
    const { views } = await index8(e, "local", P124);
    await e.idle();
    const zone = zoneId("pendientes", "tareas", "t-001");
    const box = (vs: typeof views): number => {
      const v = view8(vs, "pendientes");
      const z = v.zones.find((q) => q.id === zone);
      if (!z) throw new Error("zona de t-001");
      let n = 0;
      for (let y = z.y; y < z.y + z.h; y++) if (isBlack(v.raw1, 800, z.x + 13, y)) n++;
      return n;
    };
    expect(box(views)).toBeLessThanOrEqual(8);
    expect(e.apply("local", act6("pendientes", zone, "toggle"))).toEqual({
      status: "applied",
      changed: true,
    });
    await e.idle();
    const after = await index8(e, "local", P124);
    expect(box(after.views)).toBeGreaterThanOrEqual(12);
    expect(e.apply("local", act6("pendientes", zone, "toggle"))).toEqual({
      status: "applied",
      changed: true,
    });
    await e.idle();
    const again = await index8(e, "local", P124);
    expect(box(again.views)).toBeLessThanOrEqual(8);
    expect(calls).toEqual([]);
    await e.close();
  }, 120_000);

  it("una tarea sin etapa en task-board sigue el ciclo (stageOf)", async () => {
    const calls: Change[] = [];
    const e = mkEngine15(cr.renderer, {
      onToggle: (c) => calls.push(c),
      dataFn: (o: Loose) => {
        o.sources.tablero.items = [
          { id: "n-1", title: "Sin etapa", done: false },
          { id: "n-2", title: "Hecha sin etapa", done: true },
        ];
      },
    });
    await index8(e, "local", P124);
    await e.idle();
    expect(e.apply("local", act6("hoy", zb("n-1"), "toggle")).status).toBe("applied");
    await e.idle();
    expect(calls).toEqual([
      { sourceId: "tablero", taskId: "n-1", stage: "doing", previous: "todo" },
    ]);
  }, 120_000);
});
