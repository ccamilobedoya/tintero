import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Action, Panel } from "../../../contract/src/index.ts";
import { loadDataFile, loadViewsConfig, type Task, type ViewsConfig } from "./config.ts";
import { createEngine, type Engine, type EngineOptions } from "./engine.ts";
import { fakeRenderer, type FakeRenderer } from "./testing.ts";
import { zoneId } from "./view.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const baseConfig = loadViewsConfig(join(REPO, "config/views.example.json"));
const baseData = loadDataFile(join(REPO, "config/data.example.json"), baseConfig);
const P124: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const P200: Panel = { w: 800, h: 480, dpi: 200, depth: 1 };

let counter = 0;
const action = (view: string, zone: string, act: Action["act"], id?: string): Action => ({
  id: id ?? `act-${String(++counter).padStart(6, "0")}`,
  view,
  zone,
  act,
  at: 0,
});

function setup(
  options: Partial<EngineOptions> & { renderer?: FakeRenderer; config?: ViewsConfig } = {},
) {
  const renderer = options.renderer ?? fakeRenderer();
  const clock = { now: new Date("2026-10-23T12:00:00Z") };
  const engine = createEngine({
    config: baseConfig,
    data: baseData,
    renderer,
    clock: () => clock.now,
    nextWakeS: 1800,
    ...options,
  });
  return { engine, renderer, clock };
}

async function indexOk(engine: Engine, device = "local", panel = P124) {
  const result = await engine.index(device, panel);
  if (!result.ok) throw new Error(`index failed: ${result.code}`);
  return result.value;
}

describe("index", () => {
  it("draws the 3 views of the device and `current` is the first", async () => {
    const { engine, renderer } = setup();
    const { current, views } = await indexOk(engine);
    expect(current).toBe("hoy");
    expect(views.map((v) => v.id)).toEqual(["hoy", "pendientes", "agenda"]);
    expect(engine.renders()).toBe(3);
    expect(renderer.calls.length).toBeGreaterThanOrEqual(3);
    const hoy = views[0];
    expect(hoy?.zones).toHaveLength(13);
    expect(hoy?.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hoy?.crc32).toMatch(/^[0-9a-f]{8}$/);
    expect(hoy?.hidden).toEqual({ pendientes: 5, eventos: 0, jira: 2, calendario: 0 });
    expect(hoy?.zones[0]).toMatchObject({ act: "toggle", id: zoneId("hoy", "tareas", "t-001") });
    await engine.close();
  });

  it("serves the second index from the cache without drawing", async () => {
    const { engine } = setup();
    await indexOk(engine);
    await indexOk(engine);
    expect(engine.renders()).toBe(3);
    await engine.close();
  });

  it("shares images between devices and draws again for another panel (CA15)", async () => {
    const config: ViewsConfig = {
      ...baseConfig,
      devices: {
        "*": { views: ["hoy", "pendientes", "agenda"] },
        p2: { views: ["agenda"] },
      },
    };
    const { engine } = setup({ config });
    const one = await indexOk(engine, "p1");
    expect(engine.renders()).toBe(3);
    const two = await indexOk(engine, "p2");
    expect(two.views.map((v) => v.id)).toEqual(["agenda"]);
    expect(engine.renders()).toBe(3);
    expect(two.views[0]?.hash).toBe(one.views[2]?.hash);
    const hash = one.views[1]?.hash ?? "";
    expect(engine.view("p2", P124, "pendientes", hash)).toMatchObject({ ok: false, status: 404 });
    await indexOk(engine, "p1", P200);
    expect(engine.renders()).toBe(6);
    await engine.close();
  });

  it("redraws on a new local day (CA16)", async () => {
    const { engine, clock } = setup();
    const before = await indexOk(engine);
    clock.now = new Date("2026-10-24T00:00:01Z");
    const after = await indexOk(engine);
    expect(engine.renders()).toBe(6);
    const ids = after.views[2]?.zones.map((z) => z.id) ?? [];
    for (const gone of ["e-002", "e-003", "e-004"]) {
      expect(ids).not.toContain(zoneId("agenda", "calendario", gone));
    }
    expect(before.views[2]?.zones).toHaveLength(5);
    await engine.close();
  });

  it("answers busy while a draw is slow, then without drawing again (CA17)", async () => {
    const { engine } = setup({ renderer: fakeRenderer({ delayMs: 300 }), renderWaitMs: 100 });
    const started = Date.now();
    const first = await engine.index("local", P124);
    expect(Date.now() - started).toBeLessThan(250);
    expect(first).toEqual({ ok: false, status: 503, code: "busy", retryAfterS: 5 });
    await engine.idle();
    const second = await engine.index("local", P124);
    expect(second.ok).toBe(true);
    expect(engine.renders()).toBe(3);
    await engine.close();
  });

  it("keeps the previous image when a draw fails, and is busy if there never was one", async () => {
    const renderer = fakeRenderer({ failTimes: 1 });
    const { engine } = setup({ renderer });
    expect(await engine.index("local", P124)).toMatchObject({ ok: false, code: "busy" });
    const ok = await indexOk(engine);
    expect(ok.views).toHaveLength(3);
    await engine.close();
  });

  it("serves the earlier image of a view whose redraw fails", async () => {
    const renderer = fakeRenderer();
    const { engine } = setup({ renderer });
    const before = await indexOk(engine);
    renderer.render = () => Promise.reject(new Error("down"));
    engine.setSource("calendario", []);
    await engine.idle();
    const after = await indexOk(engine);
    expect(after.views[2]?.hash).toBe(before.views[2]?.hash);
    await engine.close();
  });

  it("logs one line per draw without content", async () => {
    const lines: Record<string, unknown>[] = [];
    const { engine } = setup({ log: (line) => lines.push(line) });
    await indexOk(engine);
    const draws = lines.filter((line) => "render" in line);
    expect(draws).toHaveLength(3);
    expect(Object.keys(draws[0] ?? {}).sort()).toEqual(["ms", "ok", "render", "ts"]);
    expect(JSON.stringify(lines)).not.toMatch(/Pagar|PROJ|Reunión|Casa/);
    await engine.close();
  });
});

describe("view", () => {
  it("checks the view, the panel and the hash (CA18)", async () => {
    const { engine } = setup();
    const { views } = await indexOk(engine);
    const hoy = views[0];
    const ok = engine.view("local", P124, "hoy", hoy?.hash ?? "");
    expect(ok).toMatchObject({ ok: true, value: { id: "hoy" } });
    expect(engine.view("local", P124, "hoy", "0123456789abcdef")).toMatchObject({
      ok: false,
      status: 409,
      code: "stale_view",
    });
    expect(engine.view("local", P124, "nada", "0123456789abcdef")).toMatchObject({
      ok: false,
      status: 404,
      code: "unknown_view",
    });
    expect(engine.view("local", P200, "hoy", hoy?.hash ?? "")).toMatchObject({ status: 409 });
    await engine.close();
  });
});

describe("apply", () => {
  const zoneOf = (view: string, source: string, item: string): string => zoneId(view, source, item);

  it("opens a detail: the next index shows it, the following goes back (CA13)", async () => {
    const { engine } = setup();
    await indexOk(engine);
    const result = engine.apply(
      "local",
      action("agenda", zoneOf("agenda", "calendario", "e-003"), "open"),
    );
    expect(result).toEqual({ status: "applied", changed: true });
    const first = await indexOk(engine);
    expect(first.current).toBe("agenda-d");
    const detail = first.views.find((v) => v.id === "agenda-d");
    expect(detail).toMatchObject({ parent: "agenda", zones: [] });
    const second = await indexOk(engine);
    expect(second.current).toBe("hoy");
    expect(second.views.map((v) => v.id)).toContain("agenda-d");
    engine.apply("local", action("hoy", zoneOf("hoy", "jira", "j-142"), "open"));
    const third = await indexOk(engine);
    expect(third.current).toBe("hoy-d");
    expect(third.views.map((v) => v.id)).not.toContain("agenda-d");
    await engine.close();
  });

  it("toggles a task in memory and redraws only the views that use it (CA14)", async () => {
    const { engine } = setup();
    const before = await indexOk(engine);
    const t1 = zoneOf("pendientes", "tareas", "t-001");
    const toggle = action("pendientes", t1, "toggle");
    expect(engine.apply("local", toggle)).toEqual({ status: "applied", changed: true });
    await engine.idle();
    expect(engine.renders()).toBe(5);
    const after = await indexOk(engine);
    expect(after.views[2]?.hash).toBe(before.views[2]?.hash);
    expect(after.views[1]?.hash).not.toBe(before.views[1]?.hash);
    expect(engine.apply("local", toggle)).toEqual({ status: "duplicate", changed: false });
    // toggling again restores the first state
    engine.apply("local", action("pendientes", t1, "toggle"));
    await engine.idle();
    expect((await indexOk(engine)).views[1]?.hash).toBe(before.views[1]?.hash);
    await engine.close();
  });

  it("answers stale for every other combination", async () => {
    const { engine } = setup();
    await indexOk(engine);
    const stale = { status: "stale", changed: false };
    expect(engine.apply("local", action("hoy", zoneOf("hoy", "jira", "j-142"), "toggle"))).toEqual(
      stale,
    );
    expect(
      engine.apply("local", action("hoy", zoneOf("hoy", "calendario", "e-003"), "toggle")),
    ).toEqual(stale);
    expect(
      engine.apply("local", action("pendientes", zoneOf("pendientes", "tareas", "t-001"), "open")),
    ).toEqual(stale);
    expect(engine.apply("local", action("hoy", "zffffffffff", "toggle"))).toEqual(stale);
    expect(engine.apply("local", action("nada", "zffffffffff", "open"))).toEqual(stale);
    await engine.close();
  });

  it("resolves hidden items too (a task past the visible rows)", async () => {
    const { engine } = setup();
    const { views } = await indexOk(engine);
    const hidden = zoneId("hoy", "tareas", "t-010");
    expect(views[0]?.zones.map((z) => z.id)).not.toContain(hidden);
    expect(engine.apply("local", action("hoy", hidden, "toggle"))).toMatchObject({
      status: "applied",
    });
    await engine.close();
  });

  it("remembers the last 1000 ids", async () => {
    const { engine } = setup();
    await indexOk(engine);
    const zone = zoneOf("hoy", "tareas", "t-001");
    const first = action("hoy", zone, "toggle", "first-id-0001");
    engine.apply("local", first);
    for (let i = 0; i < 1000; i++) engine.apply("local", action("hoy", "zffffffffff", "toggle"));
    expect(engine.apply("local", first).status).toBe("applied");
    await engine.close();
  });
});

describe("setSource", () => {
  const tasks = (): Task[] => {
    const source = baseData.sources.tareas;
    if (source?.type !== "tasks") throw new Error("tasks expected");
    return source.items.map((task) => ({ ...task }));
  };

  it("takes new data and redraws the affected views (CA23)", async () => {
    const { engine } = setup();
    await indexOk(engine);
    const items = tasks().map((t) => (t.id === "t-005" ? { ...t, done: true } : t));
    expect(engine.setSource("tareas", items)).toEqual({ ok: true, changed: true });
    await engine.idle();
    expect(engine.renders()).toBe(5);
    expect(engine.setSource("tareas", items)).toEqual({ ok: true, changed: false });
    await engine.idle();
    expect(engine.renders()).toBe(5);
    await engine.close();
  });

  it("refuses unknown sources and invalid items without echoing content", async () => {
    const { engine } = setup();
    expect(engine.setSource("nada", [])).toMatchObject({ ok: false });
    const bad = engine.setSource("tareas", [{ id: "x", title: "Secreto" }]);
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain("Secreto");
    expect(engine.setSource("tareas", "no")).toMatchObject({ ok: false });
    expect(
      engine.setSource("tareas", [{ id: "x", title: "T", done: false, extra: 1 }]),
    ).toMatchObject({
      ok: false,
    });
    await engine.close();
  });
});

describe("prewarm (CA24)", () => {
  it("prepares the next day before the screen wakes up", async () => {
    const { engine, clock } = setup();
    clock.now = new Date("2026-10-23T23:30:30Z");
    await indexOk(engine);
    expect(engine.renders()).toBe(3);
    clock.now = new Date("2026-10-23T23:59:00Z");
    await engine.prewarm();
    await engine.idle();
    expect(engine.renders()).toBe(3);
    clock.now = new Date("2026-10-23T23:59:40Z");
    await engine.prewarm();
    await engine.idle();
    expect(engine.renders()).toBe(6);
    clock.now = new Date("2026-10-24T00:00:30Z");
    const { views } = await indexOk(engine);
    expect(engine.renders()).toBe(6);
    const ids = views[2]?.zones.map((z) => z.id) ?? [];
    for (const gone of ["e-002", "e-003", "e-004"]) {
      expect(ids).not.toContain(zoneId("agenda", "calendario", gone));
    }
    await engine.close();
  });

  it("does nothing for devices that were never seen", async () => {
    const { engine } = setup();
    await engine.prewarm();
    expect(engine.renders()).toBe(0);
    await engine.close();
  });
});

describe("close", () => {
  it("stops queued work and closes the renderer", async () => {
    const renderer = fakeRenderer({ delayMs: 50 });
    let closed = false;
    renderer.close = () => {
      closed = true;
      return Promise.resolve();
    };
    const { engine } = setup({ renderer, renderWaitMs: 5 });
    await engine.index("local", P124);
    await engine.close();
    expect(closed).toBe(true);
    expect(engine.renders()).toBeLessThanOrEqual(3);
  });
});
