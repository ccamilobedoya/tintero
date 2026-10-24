import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDataFile, loadViewsConfig, type DataFile, type Task } from "../engine/config.ts";
import { staleLabel } from "../engine/dates.ts";
import { createEngine, type Engine } from "../engine/engine.ts";
import { fakeRenderer } from "../engine/testing.ts";
import { zoneId } from "../engine/view.ts";
import { DEFAULT_COLUMNS, type TriliumTasksConfig } from "./config.ts";
import { guardedHttp, type GuardedHttp } from "./http.ts";
import { triliumTasksManifest } from "./manifest.ts";
import { BOARD, startFakeEtapi, TOKEN, type FakeEtapi } from "./testing.ts";
import { createTriliumTasks, markStage, readBoard, type TriliumTasks } from "./trilium-tasks.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const NOW = new Date("2026-10-24T17:00:00Z");
const views = loadViewsConfig(join(REPO, "config/tablero.views.example.json"));
const fullData = loadDataFile(join(REPO, "config/tablero.data.example.json"), views);
const emptyData: DataFile = {
  ...fullData,
  sources: {
    ...fullData.sources,
    tablero: { type: "tasks", readonly: false, items: [] },
  },
};

let fake: FakeEtapi;
beforeEach(async () => {
  fake = await startFakeEtapi();
});
afterEach(async () => {
  await fake.close();
});

const clientFor = (allowWrite = true, log?: (l: Record<string, unknown>) => void): GuardedHttp =>
  guardedHttp(new URL(fake.baseUrl), fake.keyFile, triliumTasksManifest, {
    allowWrite,
    ...(log ? { log } : {}),
  });

const tail = (task: Task) => ({ id: task.id, stage: task.stage });

describe("readBoard", () => {
  it("reads in two calls, in board order, with only the allowed fields", async () => {
    const lines: Record<string, unknown>[] = [];
    const { tasks, statuses } = await readBoard(clientFor(), BOARD, DEFAULT_COLUMNS, NOW, (l) =>
      lines.push(l),
    );
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests.every((r) => r.method === "GET")).toBe(true);
    expect(tasks).toEqual([
      { id: "tarjeta00002", title: "Soldar los pines", done: false, stage: "doing" },
      {
        id: "tarjeta00001",
        title: "Comprar pilas",
        done: false,
        stage: "todo",
        due: "2026-10-26",
      },
      {
        id: "tarjeta00003",
        title: "Pagar el agua",
        done: true,
        stage: "done",
        doneAt: "2026-10-24T16:30:00.000Z",
      },
      { id: "tarjeta00007", title: `${"x".repeat(199)}…`, done: false, stage: "todo" },
    ]);
    expect([...statuses]).toEqual([
      ["tarjeta00002", "En progreso"],
      ["tarjeta00001", "Por hacer"],
      ["tarjeta00003", "Hecho"],
      ["tarjeta00007", "Por hacer"],
    ]);
    const reasons: Record<string, number> = {};
    for (const l of lines) {
      expect(l.event).toBe("skipped");
      reasons[String(l.reason)] = (reasons[String(l.reason)] ?? 0) + 1;
    }
    expect(reasons).toEqual({ "no-status": 2, "unknown-status": 1, "old-done": 1, archived: 1 });
  });

  it("follows the configured columns", async () => {
    const columns = { "Por hacer": "todo", Bloqueada: "doing", Hecho: "done" } as const;
    const { tasks } = await readBoard(clientFor(), BOARD, columns, NOW);
    const ids = tasks.map(tail);
    expect(ids).toContainEqual({ id: "tarjeta00004", stage: "doing" });
    expect(ids.map((t) => t.id)).not.toContain("tarjeta00002");
  });

  it("fails with bad-json when the answer has no expected shape", async () => {
    fake.override = { body: '{"results":1}', length: true };
    await expect(readBoard(clientFor(), BOARD, DEFAULT_COLUMNS, NOW)).rejects.toMatchObject({
      code: "bad-json",
    });
  });
});

describe("markStage", () => {
  it("writes only when the status is the expected one", async () => {
    expect(await markStage(clientFor(), "tarjeta00001", "Por hacer", "Hecho")).toBe("written");
    expect(fake.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "GET /etapi/notes/tarjeta00001",
      "PATCH /etapi/attributes/atrstatus001",
    ]);
    expect(fake.patches()[0]?.body).toBe('{"value":"Hecho"}');
  });

  it("gives way to Trilium: changed, inherited-only or missing cards get no PATCH", async () => {
    fake.setLabel("tarjeta00001", "status", "En progreso");
    expect(await markStage(clientFor(), "tarjeta00001", "Por hacer", "Hecho")).toBe("conflict");
    expect(await markStage(clientFor(), "tarjeta00006", "Por hacer", "Hecho")).toBe("conflict");
    expect(await markStage(clientFor(), "tarjeta99999", "Por hacer", "Hecho")).toBe("conflict");
    expect(fake.patches()).toHaveLength(0);
  });
});

// ---- the integration with a real engine ----

interface Rig {
  engine: Engine;
  tasks: TriliumTasks;
  calls: { items: Task[]; readAt: Date | undefined }[];
  lines: Record<string, unknown>[];
  clock: { now: Date };
  toggle(id: string, taskId?: string): string;
}

let counter = 0;
function rig(config: Partial<TriliumTasksConfig> = {}, http = clientFor()): Rig {
  const clock = { now: NOW };
  const lines: Record<string, unknown>[] = [];
  const calls: Rig["calls"] = [];
  // eslint-disable-next-line prefer-const -- the engine callback needs it before it is created
  let tasks: TriliumTasks | undefined;
  const engine = createEngine({
    config: views,
    data: emptyData,
    renderer: fakeRenderer(),
    clock: () => clock.now,
    nextWakeS: 1800,
    onToggle: (change) => tasks?.onToggle(change),
  });
  const spy: Pick<Engine, "setSource"> = {
    setSource(id, items, meta) {
      calls.push({ items: items as Task[], readAt: meta?.readAt });
      return engine.setSource(id, items, meta);
    },
  };
  tasks = createTriliumTasks({
    http,
    config: {
      source: "tablero",
      baseUrl: fake.baseUrl,
      keyFile: fake.keyFile,
      boardNoteId: BOARD,
      allowWrite: true,
      columns: DEFAULT_COLUMNS,
      ...config,
    },
    manifest: triliumTasksManifest,
    engine: spy,
    clock: () => clock.now,
    log: (l) => lines.push(l),
  });
  const made = tasks;
  return {
    engine,
    tasks: made,
    calls,
    lines,
    clock,
    toggle: (_id, taskId = "") => {
      const result = engine.apply("local", {
        id: `act-${String(++counter).padStart(6, "0")}`,
        view: "hoy",
        zone: zoneId("hoy", "tablero", taskId),
        act: "toggle",
        at: 0,
      });
      return result.status;
    },
  };
}

describe("createTriliumTasks", () => {
  it("starts empty with the start time, then delivers the board", async () => {
    const r = rig();
    await r.tasks.cycle();
    expect(r.calls).toHaveLength(2);
    expect(r.calls[0]).toEqual({ items: [], readAt: NOW });
    expect(r.calls[1]?.items.map((t) => t.id)).toEqual([
      "tarjeta00002",
      "tarjeta00001",
      "tarjeta00003",
      "tarjeta00007",
    ]);
  });

  it("marks done and undoes, end to end", async () => {
    const r = rig();
    await r.tasks.cycle();
    expect(r.toggle("a", "tarjeta00001")).toBe("applied");
    await r.tasks.idle();
    expect(fake.patches().map((p) => p.url + p.body)).toEqual([
      '/etapi/attributes/atrstatus001{"value":"Hecho"}',
    ]);
    expect(r.toggle("b", "tarjeta00001")).toBe("applied");
    await r.tasks.idle();
    expect(fake.patches().at(-1)?.body).toBe('{"value":"Por hacer"}');
    expect(fake.label("tarjeta00001", "status")).toBe("Por hacer");
  });

  it("a quick mark and undo write at most twice and end where they began", async () => {
    const r = rig();
    await r.tasks.cycle();
    fake.delayMs = 300;
    r.toggle("a", "tarjeta00001");
    r.toggle("b", "tarjeta00001");
    await r.tasks.idle();
    expect(fake.patches().length).toBeLessThanOrEqual(2);
    expect(fake.label("tarjeta00001", "status")).toBe("Por hacer");
    fake.delayMs = 0;
    await r.tasks.cycle();
    expect(r.calls.at(-1)?.items.find((t) => t.id === "tarjeta00001")?.stage).toBe("todo");
  });

  it("lets Trilium win when the card changed meanwhile", async () => {
    const r = rig();
    await r.tasks.cycle();
    fake.setLabel("tarjeta00001", "status", "En progreso");
    r.toggle("a", "tarjeta00001");
    await r.tasks.idle();
    expect(fake.patches()).toHaveLength(0);
    expect(r.lines).toContainEqual(expect.objectContaining({ event: "write", result: "conflict" }));
    await r.tasks.cycle();
    expect(r.calls.at(-1)?.items.find((t) => t.id === "tarjeta00001")?.stage).toBe("doing");
  });

  it("keeps a pending mark offline and writes it before the next read", async () => {
    const r = rig();
    await r.tasks.cycle();
    fake.offline = true;
    r.clock.now = new Date("2026-10-24T17:01:00Z");
    expect(r.toggle("a", "tarjeta00001")).toBe("applied");
    await r.tasks.idle();
    expect(r.lines).toContainEqual(expect.objectContaining({ result: "pending" }));

    const before = r.calls.length;
    r.clock.now = new Date("2026-10-24T17:02:00Z");
    await r.tasks.cycle();
    expect(r.calls).toHaveLength(before);

    fake.offline = false;
    fake.requests.length = 0;
    r.clock.now = new Date("2026-10-24T17:03:00Z");
    await r.tasks.cycle();
    expect(fake.requests.map((q) => q.method)).toEqual(["GET", "PATCH", "GET", "GET"]);
    expect(r.lines).toContainEqual(expect.objectContaining({ result: "written" }));
    expect(r.calls.at(-1)?.items.find((t) => t.id === "tarjeta00001")?.stage).toBe("done");
    expect(r.calls.at(-1)?.readAt).toEqual(r.clock.now);
  });

  it("drops a pending mark after 24 h", async () => {
    const r = rig();
    await r.tasks.cycle();
    fake.offline = true;
    r.clock.now = new Date("2026-10-24T17:01:00Z");
    r.toggle("a", "tarjeta00001");
    await r.tasks.idle();
    fake.offline = false;
    fake.requests.length = 0;
    r.clock.now = new Date("2026-10-25T17:01:01Z");
    await r.tasks.cycle();
    expect(r.lines).toContainEqual(expect.objectContaining({ result: "expired" }));
    expect(fake.patches()).toHaveLength(0);
    expect(r.calls.at(-1)?.items.find((t) => t.id === "tarjeta00001")?.stage).toBe("todo");
  });

  it("offline from the start: only the empty delivery, and the notice appears", async () => {
    fake.offline = true;
    const r = rig();
    await r.tasks.cycle();
    expect(r.calls).toEqual([{ items: [], readAt: NOW }]);
    expect(r.lines).toContainEqual(expect.objectContaining({ event: "read", ok: false }));
    expect(staleLabel(NOW, new Date("2026-10-24T17:06:00Z"), "America/Lima")).toBe(
      "sin datos desde 12:00",
    );
  });

  it("ignores other sources and unknown tasks", async () => {
    const r = rig();
    await r.tasks.cycle();
    r.tasks.onToggle({ sourceId: "otra", taskId: "tarjeta00001", stage: "done", previous: "todo" });
    r.tasks.onToggle({ sourceId: "tablero", taskId: "nada", stage: "done", previous: "todo" });
    await r.tasks.idle();
    expect(fake.patches()).toHaveLength(0);
    expect(r.lines).toContainEqual(expect.objectContaining({ result: "unknown-task" }));
  });

  it("logs no content, ids or token", async () => {
    const httpLines: Record<string, unknown>[] = [];
    const r = rig(
      {},
      clientFor(true, (l) => httpLines.push(l)),
    );
    await r.tasks.cycle();
    r.toggle("a", "tarjeta00001");
    await r.tasks.idle();
    r.lines.push(...httpLines);
    const all = JSON.stringify(r.lines);
    for (const secret of ["Comprar pilas", "tarjeta0", "atrstatus", BOARD, TOKEN]) {
      expect(all).not.toContain(secret);
    }
    const calls = r.lines.filter((l) => "method" in l);
    expect(calls.length).toBeGreaterThan(0);
    for (const l of calls) {
      expect(Object.keys(l).sort()).toEqual([
        "host",
        "integration",
        "method",
        "ms",
        "status",
        "ts",
      ]);
    }
  });

  it("stop() waits for the queue and stops the timer", async () => {
    const r = rig();
    r.tasks.start();
    await r.tasks.stop();
    const seen = fake.requests.length;
    expect(seen).toBeGreaterThanOrEqual(2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.requests).toHaveLength(seen);
  });
});
