import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Action, Panel } from "../../../../contract/src/index.ts";
import {
  ConfigError,
  loadDataFile,
  loadViewsConfig,
  parseDataFile,
  parseViewsConfig,
  stageOf,
  type Task,
} from "../config.ts";
import { staleLabel } from "../dates.ts";
import { createEngine } from "../engine.ts";
import { fakeRenderer } from "../testing.ts";
import { buildView, zoneId } from "../view.ts";

const REPO = resolve(import.meta.dirname, "../../../..");
const config = loadViewsConfig(join(REPO, "config/tablero.views.example.json"));
const data = loadDataFile(join(REPO, "config/tablero.data.example.json"), config);
const AT = new Date("2026-10-24T17:00:00Z");
const P124: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const V124: Panel = { w: 480, h: 800, dpi: 124, depth: 1 };

const def = (id: string) => {
  const found = config.views.find((v) => v.id === id);
  if (!found) throw new Error(`no view ${id}`);
  return found;
};
const ids = (view: string, built: { zones: { id: string }[] }) =>
  built.zones
    .map((z) => z.id)
    .map((id) => {
      const all = (data.sources.tablero?.items ?? []) as Task[];
      return all.find((t) => zoneId(view, "tablero", t.id) === id)?.id;
    });

describe("task-board layout", () => {
  it("`hoy` shows the lead stage, 7 todo rows and 2 hidden", () => {
    const built = buildView(def("hoy"), { panel: P124, config, sources: data.sources, at: AT });
    expect(ids("hoy", built)).toEqual([
      "b-01",
      "b-03",
      "b-02",
      "b-04",
      "b-05",
      "b-06",
      "b-07",
      "b-08",
      "b-09",
      "b-12",
      "b-13",
    ]);
    expect(built.hidden).toEqual({ tareas: 2, hechas: 0, mes: 0 });
    expect(built.tooSmall).toEqual([]);
    expect(built.html).toContain("EN PROGRESO");
    expect(built.html).toContain("HECHO HOY");
    expect(built.html).not.toContain("Sacar el reciclaje");
  });

  it("`tablero` has 4 hidden in `por_hacer` and Tab starts at `en_progreso`", () => {
    const built = buildView(def("tablero"), { panel: P124, config, sources: data.sources, at: AT });
    expect(built.hidden).toEqual({ por_hacer: 4, en_progreso: 0, hechas: 0 });
    expect(ids("tablero", built).slice(0, 2)).toEqual(["b-01", "b-03"]);
  });

  it("only today's done tasks are shown, and the empty text appears after midnight", () => {
    const later = new Date("2026-10-25T05:01:00Z");
    const built = buildView(def("hoy"), { panel: P124, config, sources: data.sources, at: later });
    expect(built.html).toContain("Nada hecho hoy.");
    expect(ids("hoy", built)).not.toContain("b-12");
  });

  it("uses `portrait` in a vertical panel without `tooSmall`", () => {
    const built = buildView(def("hoy"), { panel: V124, config, sources: data.sources, at: AT });
    expect(built.tooSmall).toEqual([]);
    expect(built.hidden.tareas).toBe(3);
  });

  it("an empty lead stage keeps its strip and the empty row", () => {
    const items = (data.sources.tablero?.items as Task[]).filter((t) => stageOf(t) !== "doing");
    const sources = {
      ...data.sources,
      tablero: { type: "tasks" as const, readonly: false, items },
    };
    const built = buildView(def("hoy"), { panel: P124, config, sources, at: AT });
    expect(built.html).toContain("Nada en progreso.");
    expect(ids("hoy", built)[0]).toBe("b-02");
  });

  it("shows the stale notice in the lead strip instead of the total", () => {
    const stale = { tablero: "sin datos desde 11:50" };
    const built = buildView(def("hoy"), {
      panel: P124,
      config,
      sources: data.sources,
      at: AT,
      stale,
    });
    expect(built.html).toContain("sin datos desde 11:50");
  });

  it("groups by category only when some task has one", () => {
    const view = parseViewsConfig(
      JSON.stringify({
        version: 1,
        timezone: "America/Lima",
        theme: "base",
        devices: { "*": { views: ["v"] } },
        views: [
          {
            id: "v",
            title: "V",
            grid: { columns: [100], rows: [100], areas: [["a"]] },
            slots: { a: { block: "task-board", source: "s", options: { stages: ["todo"] } } },
          },
        ],
      }),
    );
    const task = (id: string, category?: string): Task => ({
      id,
      title: id,
      done: false,
      ...(category === undefined ? {} : { category }),
    });
    const make = (items: Task[]) => ({ s: { type: "tasks" as const, readonly: false, items } });
    const order = (items: Task[]) => {
      const built = buildView(view.views[0] as never, {
        panel: P124,
        config: view,
        sources: make(items),
        at: AT,
      });
      return built.zones.map((z) => items.find((t) => zoneId("v", "s", t.id) === z.id)?.id);
    };
    expect(order([task("c-1", "Casa"), task("c-2"), task("c-3", "Casa")])).toEqual([
      "c-1",
      "c-3",
      "c-2",
    ]);
    expect(order([task("c-1"), task("c-2")])).toEqual(["c-1", "c-2"]);
  });
});

describe("validation", () => {
  const dataWith = (task: Record<string, unknown>) =>
    JSON.stringify({
      version: 1,
      sources: {
        calendario: { type: "events", items: [] },
        tablero: { type: "tasks", items: [{ id: "x", title: "Secreto", ...task }] },
      },
    });
  const bad = (task: Record<string, unknown>, pointer: string) => {
    try {
      parseDataFile(dataWith(task), config);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain(pointer);
      expect((error as Error).message).not.toContain("Secreto");
      return;
    }
    throw new Error("did not throw");
  };

  it("rejects inconsistent stage, done and doneAt", () => {
    bad({ done: false, stage: "done" }, "/sources/tablero/items/0/stage");
    bad({ done: false, stage: "todo", doneAt: "2026-10-24T09:00:00-05:00" }, "/doneAt");
    bad({ done: true, stage: "done", doneAt: "2026-10-24 09:00" }, "/doneAt");
    bad({ done: false, stage: "blocked" }, "/stage");
  });

  it("accepts a valid done task and F-005 tasks without stage", () => {
    expect(() =>
      parseDataFile(
        dataWith({ done: true, stage: "done", doneAt: "2026-10-24T09:00:00-05:00" }),
        config,
      ),
    ).not.toThrow();
    expect(stageOf({ id: "a", title: "a", done: true })).toBe("done");
    expect(stageOf({ id: "a", title: "a", done: false })).toBe("todo");
  });

  const slot = (options: unknown) =>
    JSON.stringify({
      version: 1,
      timezone: "America/Lima",
      theme: "base",
      devices: { "*": { views: ["v"] } },
      views: [
        {
          id: "v",
          title: "V",
          grid: { columns: [100], rows: [100], areas: [["a"]] },
          slots: { a: { block: "task-board", source: "s", options } },
        },
      ],
    });

  it("rejects bad task-board options", () => {
    for (const options of [
      { stages: [] },
      { stages: ["todo", "todo"] },
      { stages: ["later"] },
      { density: "grid" },
      { lead: "yes" },
      { colour: "red" },
    ]) {
      expect(() => parseViewsConfig(slot(options))).toThrow(ConfigError);
    }
    expect(() => parseViewsConfig(slot({ stages: ["doing", "done"], lead: true }))).not.toThrow();
  });
});

describe("staleLabel", () => {
  const now = new Date("2026-10-24T17:00:00Z");
  it("labels over 5 minutes in local time, otherwise nothing", () => {
    expect(staleLabel(new Date("2026-10-24T16:50:00Z"), now, "America/Lima")).toBe(
      "sin datos desde 11:50",
    );
    expect(staleLabel(new Date("2026-10-24T16:55:00Z"), now, "America/Lima")).toBeUndefined();
    expect(staleLabel(undefined, now, "America/Lima")).toBeUndefined();
  });

  it("adds the day when the last read was not today", () => {
    const later = new Date("2026-10-24T17:06:00Z");
    expect(staleLabel(new Date("2026-10-23T23:30:00Z"), later, "America/Lima")).toBe(
      "sin datos desde 23/10 18:30",
    );
  });
});

describe("engine", () => {
  let n = 0;
  const act = (view: string, zone: string): Action => ({
    id: `act-${String(++n).padStart(6, "0")}`,
    view,
    zone,
    act: "toggle",
    at: 0,
  });
  const setup = () => {
    const engine = createEngine({
      config,
      data,
      renderer: fakeRenderer(),
      clock: () => AT,
      nextWakeS: 1800,
    });
    return engine;
  };

  it("marks a task done and brings it back to its previous stage", async () => {
    const engine = setup();
    await engine.index("local", P124);
    const before = await engine.index("local", P124);
    const hoy = before.ok ? before.value.views[0] : undefined;
    const first = hoy?.zones[0];
    expect(first?.id).toBe(zoneId("hoy", "tablero", "b-01"));
    expect(engine.apply("local", act("hoy", first?.id ?? ""))).toEqual({
      status: "applied",
      changed: true,
    });
    await engine.idle();
    const after = await engine.index("local", P124);
    const view = after.ok ? after.value.views[0] : undefined;
    expect(view?.zones).toHaveLength(13);
    expect(view?.zones.at(-3)?.id).toBe(zoneId("hoy", "tablero", "b-01"));
    const again = view?.zones.find((z) => z.id === zoneId("hoy", "tablero", "b-01"));
    expect(engine.apply("local", act("hoy", again?.id ?? "")).status).toBe("applied");
    await engine.idle();
    const last = await engine.index("local", P124);
    expect(last.ok && last.value.views[0]?.hash).toBe(hoy?.hash);
    await engine.close();
  });

  it("redraws when the notice appears, even if the data did not change", async () => {
    const engine = setup();
    const first = await engine.index("local", P124);
    const hash = first.ok ? first.value.views[0]?.hash : "";
    const items = data.sources.tablero?.items;
    expect(
      engine.setSource("tablero", items, { readAt: new Date("2026-10-24T16:57:00Z") }),
    ).toEqual({
      ok: true,
      changed: false,
    });
    await engine.idle();
    const same = await engine.index("local", P124);
    expect(same.ok && same.value.views[0]?.hash).toBe(hash);
    expect(
      engine.setSource("tablero", items, { readAt: new Date("2026-10-24T16:50:00Z") }),
    ).toEqual({
      ok: true,
      changed: false,
    });
    await engine.idle();
    const stale = await engine.index("local", P124);
    expect(stale.ok && stale.value.views[0]?.hash).not.toBe(hash);
    await engine.close();
  });
});
