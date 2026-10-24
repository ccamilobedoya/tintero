import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Panel } from "../../../contract/src/index.ts";
import { loadDataFile, loadViewsConfig, type Task, type ViewDef } from "./config.ts";
import { buildDetailView, buildView, zoneId } from "./view.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const config = loadViewsConfig(join(REPO, "config/views.example.json"));
const data = loadDataFile(join(REPO, "config/data.example.json"), config);
const AT = new Date("2026-10-23T12:00:00Z");
const P124: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const V124: Panel = { w: 480, h: 800, dpi: 124, depth: 1 };

const def = (id: string): ViewDef => {
  const found = config.views.find((v) => v.id === id);
  if (!found) throw new Error(`no view ${id}`);
  return found;
};
const input = (panel: Panel = P124, sources = data.sources) => ({ panel, config, sources, at: AT });

describe("zoneId", () => {
  it("is z + 10 hex digits, stable and different per item", () => {
    const id = zoneId("hoy", "tareas", "t-001");
    expect(id).toMatch(/^z[0-9a-f]{10}$/);
    expect(zoneId("hoy", "tareas", "t-001")).toBe(id);
    expect(zoneId("hoy", "tareas", "t-002")).not.toBe(id);
    expect(zoneId("pendientes", "tareas", "t-001")).not.toBe(id);
  });
});

describe("buildView", () => {
  it("`hoy` has 13 zones in Tab order and the hidden counts of the owner's case", () => {
    const built = buildView(def("hoy"), input());
    expect(built.zones.map((z) => z.act)).toEqual([
      ...Array<string>(5).fill("toggle"),
      ...Array<string>(5).fill("open"),
      ...Array<string>(3).fill("open"),
    ]);
    expect(built.zones[0]?.id).toBe(zoneId("hoy", "tareas", "t-001"));
    expect(built.zones[5]?.id).toBe(zoneId("hoy", "calendario", "e-002"));
    expect(built.zones[10]?.id).toBe(zoneId("hoy", "jira", "j-142"));
    expect(built.hidden).toEqual({ pendientes: 5, eventos: 0, jira: 2, calendario: 0 });
    expect(built.tooSmall).toEqual([]);
  });

  it("never lets an id or a title into an attribute other than the opaque zone", () => {
    const built = buildView(def("hoy"), input());
    expect(built.html).not.toContain("t-001");
    expect(built.html).not.toContain("PROJ-142</");
    expect(built.html).not.toMatch(/data-[a-z]+="[^"]*(Pagar|PROJ)/);
  });

  it("`pendientes` lists all 10 tasks and `agenda` the 5 events of the window", () => {
    const list = buildView(def("pendientes"), input());
    expect(list.zones).toHaveLength(10);
    expect(list.hidden).toEqual({ lista: 0 });
    const agenda = buildView(def("agenda"), input());
    expect(agenda.zones).toHaveLength(5);
    expect(agenda.zones.every((z) => z.act === "open")).toBe(true);
    expect(agenda.zones.map((z) => z.id)).not.toContain(zoneId("agenda", "calendario", "e-001"));
    expect(agenda.zones.map((z) => z.id)).not.toContain(zoneId("agenda", "calendario", "e-006"));
  });

  it("uses `portrait` in a vertical panel", () => {
    const built = buildView(def("hoy"), input(V124));
    expect(built.tooSmall).toEqual([]);
    expect(built.zones.length).toBeGreaterThan(0);
    expect(built.zones.length).toBeLessThanOrEqual(48);
  });

  it("reports `tooSmall` and gives that area no zones", () => {
    const narrow: ViewDef = {
      id: "n",
      title: "N",
      grid: { columns: [10, 90], rows: [100], areas: [["a", "b"]] },
      slots: {
        a: { block: "task-list", source: "tareas", options: {} },
        b: { block: "month-calendar", source: "calendario", options: {} },
      },
    };
    const built = buildView(narrow, input());
    expect(built.tooSmall).toEqual(["a"]);
    expect(built.html).toContain("No cabe");
    expect(built.zones.every((z) => z.id !== zoneId("n", "tareas", "t-001"))).toBe(true);
    expect(built.zones).toHaveLength(0);
  });

  it("draws dangerous text as text", () => {
    const evil = `<img src="http://example.invalid/x"><script>document.title=1</script></style><style>*{display:none}</style>`;
    const tasks = data.sources.tareas;
    if (tasks?.type !== "tasks") throw new Error("tasks expected");
    const items: Task[] = [{ id: "x", title: evil, done: false }, ...tasks.items];
    const built = buildView(
      def("pendientes"),
      input(P124, { ...data.sources, tareas: { ...tasks, items } }),
    );
    expect(built.html).not.toContain("<img");
    expect(built.html).not.toContain("<script");
    expect(built.html).toContain("&lt;img src=&quot;http://example.invalid/x&quot;&gt;");
    expect(built.zones.map((z) => z.id)).toContain(zoneId("pendientes", "tareas", "x"));
  });

  it("caps the zones at 48 and shows the rest without focus", () => {
    const tasks = data.sources.tareas;
    if (tasks?.type !== "tasks") throw new Error("tasks expected");
    const items = Array.from({ length: 60 }, (_, i): Task => ({
      id: `t${i}`,
      title: "x",
      done: false,
    }));
    const tall: Panel = { w: 800, h: 2000, dpi: 124, depth: 1 };
    const built = buildView(
      def("pendientes"),
      input(tall, { ...data.sources, tareas: { ...tasks, items } }),
    );
    expect(built.zones).toHaveLength(48);
  });

  it("marks a read-only list with `open` and no checkbox", () => {
    const readonly: ViewDef = {
      id: "r",
      title: "R",
      grid: { columns: [100], rows: [100], areas: [["a"]] },
      slots: { a: { block: "task-list", source: "jira", options: { group_by: "none" } } },
    };
    const built = buildView(readonly, input());
    expect(built.zones.every((z) => z.act === "open")).toBe(true);
    expect(built.html).not.toContain("border:2px solid #000");
  });
});

describe("buildDetailView", () => {
  const detail = (sourceId: string, itemId: string) =>
    buildDetailView({ ...input(), sourceId, itemId });

  it("shows an event and a task without zones", () => {
    const event = detail("calendario", "e-003");
    expect(event.zones).toEqual([]);
    expect(event.html).toContain("Reunión de equipo");
    expect(event.html).toContain("vie 23 oct · 14:00–14:30");
    expect(event.html).toContain("Sala 2");
    const task = detail("jira", "j-142");
    expect(task.html).toContain("PROJ-142 · En curso");
    expect(task.html).toContain("Mover los consumidores");
  });

  it("says so when the item is gone", () => {
    expect(detail("jira", "nope").html).toContain("No disponible");
    expect(detail("nope", "x").html).toContain("No disponible");
  });
});
