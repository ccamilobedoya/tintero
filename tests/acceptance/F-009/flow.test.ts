import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  EXPECTED_TASKS,
  NOW,
  expectCleanLogs,
  scenario,
  staleLabel,
  tmp,
  type Line,
  type Scenario,
  type Tmp,
} from "./helpers.ts";

let t: Tmp;
let s: Scenario | undefined;
const allLogs: Line[] = [];

beforeAll(() => {
  t = tmp();
});
afterEach(async () => {
  if (s) {
    allLogs.push(...s.logs.lines);
    await s.close();
    s = undefined;
  }
});
afterAll(() => {
  t.cleanup();
});

const at = (iso: string): Date => new Date(iso);
interface TaskLike {
  id: string;
  stage: string;
  done: boolean;
  doneAt?: string;
}
const lastTask = (sc: Scenario, id: string): TaskLike | undefined =>
  (sc.calls.at(-1)?.items as TaskLike[]).find((x) => x.id === id);
const writeLines = (sc: Scenario, result: string): Line[] =>
  sc.logs.lines.filter((l) => l.event === "write" && l.result === result);

async function start(opts: Parameters<typeof scenario>[1] = {}): Promise<Scenario> {
  s = await scenario(t, opts);
  return s;
}

describe("CA7 marcar y deshacer de punta a punta", () => {
  it("primero [] con readAt, luego las 4 tareas; toggle → Hecho; otro toggle → Por hacer", async () => {
    const sc = await start();
    expect(sc.calls).toHaveLength(1);
    expect(sc.calls[0]).toEqual({ id: "tablero", items: [], readAt: at(NOW) });
    await sc.tt.cycle();
    expect(sc.calls).toHaveLength(2);
    expect(sc.calls[1]?.id).toBe("tablero");
    expect(sc.calls[1]?.items).toStrictEqual(EXPECTED_TASKS);
    expect(sc.calls[1]?.readAt).toEqual(at(NOW));

    await sc.refresh();
    expect(sc.toggle("tarjeta00001")).toEqual({ status: "applied", changed: true });
    await sc.tt.idle();
    // F-015 (D3): el ciclo es Por hacer → En progreso → Hecho → Por hacer
    expect(sc.patches()).toEqual([
      { path: "/etapi/attributes/atrstatus001", body: '{"value":"En progreso"}' },
    ]);
    expect(sc.fake.statusOf("tarjeta00001")).toBe("En progreso");

    await sc.refresh();
    expect(sc.toggle("tarjeta00001")).toEqual({ status: "applied", changed: true });
    await sc.tt.idle();
    expect(sc.patches()).toHaveLength(2);
    expect(sc.patches()[1]).toEqual({
      path: "/etapi/attributes/atrstatus001",
      body: '{"value":"Hecho"}',
    });
    expect(sc.fake.statusOf("tarjeta00001")).toBe("Hecho");

    await sc.refresh();
    expect(sc.toggle("tarjeta00001")).toEqual({ status: "applied", changed: true });
    await sc.tt.idle();
    expect(sc.patches()).toHaveLength(3);
    expect(sc.patches()[2]).toEqual({
      path: "/etapi/attributes/atrstatus001",
      body: '{"value":"Por hacer"}',
    });
    expect(sc.fake.statusOf("tarjeta00001")).toBe("Por hacer");
  }, 30_000);

  it("dos toggle seguidos con el falso lento: ≤ 2 PATCH, termina en Hecho", async () => {
    const sc = await start();
    await sc.tt.cycle();
    await sc.refresh();
    sc.fake.delayMs = 300;
    expect(sc.toggle("tarjeta00001").status).toBe("applied");
    await sc.refresh();
    expect(sc.toggle("tarjeta00001").status).toBe("applied");
    await sc.tt.idle();
    expect(sc.patches().length).toBeLessThanOrEqual(2);
    expect(sc.fake.statusOf("tarjeta00001")).toBe("Hecho");
    sc.fake.delayMs = 0;
    await sc.tt.cycle();
    expect(lastTask(sc, "tarjeta00001")).toMatchObject({ stage: "done", done: true });
  }, 30_000);

  it("un toggle de una tarea desconocida para la integración no escribe", async () => {
    const sc = await start();
    // Sin ciclo previo, la integración no conoce ninguna tarea.
    sc.tt.onToggle({
      sourceId: "tablero",
      taskId: "tarjeta00001",
      stage: "done",
      previous: "todo",
    });
    await sc.tt.idle();
    expect(sc.patches()).toHaveLength(0);
    expect(writeLines(sc, "unknown-task")).toHaveLength(1);
  });

  it("los toggles de otras fuentes se ignoran", async () => {
    const sc = await start();
    await sc.tt.cycle();
    sc.tt.onToggle({ sourceId: "otra", taskId: "tarjeta00001", stage: "done", previous: "todo" });
    await sc.tt.idle();
    expect(sc.patches()).toHaveLength(0);
    expect(sc.logs.lines.filter((l) => l.event === "write")).toHaveLength(0);
  });
});

describe("CA8 gana Trilium", () => {
  it("si cambió en Trilium, no se pisa y el siguiente ciclo trae lo de Trilium", async () => {
    const sc = await start();
    await sc.tt.cycle();
    sc.fake.setStatus("tarjeta00001", "En progreso");
    await sc.refresh();
    expect(sc.toggle("tarjeta00001").status).toBe("applied");
    await sc.tt.idle();
    expect(sc.patches()).toHaveLength(0);
    expect(writeLines(sc, "conflict")).toHaveLength(1);
    await sc.tt.cycle();
    expect(lastTask(sc, "tarjeta00001")).toMatchObject({ stage: "doing", done: false });
  }, 30_000);
});

describe("CA9 sin conexión y 24 h", () => {
  it("pendiente, sin llamadas al espía; al volver se escribe antes de leer", async () => {
    const sc = await start();
    await sc.tt.cycle();
    await sc.refresh();
    sc.fake.offline = true;
    sc.clock.set("2026-10-24T17:01:00Z");
    expect(sc.toggle("tarjeta00001").status).toBe("applied");
    await sc.tt.idle();
    expect(writeLines(sc, "pending")).toHaveLength(1);

    sc.clock.set("2026-10-24T17:02:00Z");
    const before = sc.calls.length;
    await sc.tt.cycle();
    expect(sc.calls).toHaveLength(before);

    sc.fake.offline = false;
    const n = sc.fake.requests.length;
    sc.clock.set("2026-10-24T17:03:00Z");
    await sc.tt.cycle();
    const fresh = sc.fake.requests.slice(n).map((r) => `${r.method} ${r.path.split("?")[0]}`);
    expect(fresh).toHaveLength(4);
    expect(fresh[0]).toBe("GET /etapi/notes/tarjeta00001");
    expect(fresh[1]).toBe("PATCH /etapi/attributes/atrstatus001");
    // F-015 (D3): la marca pendiente que se escribe al volver es la etapa siguiente, En progreso
    expect(sc.fake.requests[n + 1]?.body).toBe('{"value":"En progreso"}');
    expect([...fresh.slice(2)].sort()).toEqual([
      "GET /etapi/notes",
      "GET /etapi/notes/tablero00001",
    ]);
    expect(writeLines(sc, "written")).toHaveLength(1);
    expect(lastTask(sc, "tarjeta00001")).toMatchObject({ stage: "doing", done: false });
  }, 30_000);

  it("pasadas 24 h el pendiente caduca sin escribir", async () => {
    const sc = await start();
    await sc.tt.cycle();
    await sc.refresh();
    sc.fake.offline = true;
    sc.clock.set("2026-10-24T17:01:00Z");
    expect(sc.toggle("tarjeta00001").status).toBe("applied");
    await sc.tt.idle();
    sc.clock.set("2026-10-25T17:01:01Z");
    sc.fake.offline = false;
    const n = sc.fake.requests.length;
    await sc.tt.cycle();
    expect(writeLines(sc, "expired")).toHaveLength(1);
    expect(sc.fake.requests.slice(n).filter((r) => r.method === "PATCH")).toHaveLength(0);
    expect(lastTask(sc, "tarjeta00001")).toMatchObject({ stage: "todo", done: false });
  }, 30_000);
});

describe("CA10 hora de lectura", () => {
  it("readAt es el reloj de cada ciclo; un fallo no lo cambia", async () => {
    const sc = await start();
    await sc.tt.cycle();
    expect(sc.calls.map((c) => c.readAt)).toEqual([at(NOW), at(NOW)]);
    sc.fake.offline = true;
    sc.clock.set("2026-10-24T17:02:00Z");
    await sc.tt.cycle();
    expect(sc.calls).toHaveLength(2);
    expect(sc.calls.at(-1)?.readAt).toEqual(at(NOW));
    sc.fake.offline = false;
    sc.clock.set("2026-10-24T17:03:00Z");
    await sc.tt.cycle();
    expect(sc.calls).toHaveLength(3);
    expect(sc.calls.at(-1)?.readAt).toEqual(at("2026-10-24T17:03:00Z"));
    expect(sc.logs.lines.some((l) => l.event === "read" && l.ok === false)).toBe(true);
  }, 30_000);

  it("sin conexión desde el arranque: solo ([], readAt 17:00Z) y «sin datos desde 12:00»", async () => {
    const sc = await start({ offlineAtStart: true });
    await sc.tt.cycle();
    expect(sc.calls).toHaveLength(1);
    expect(sc.calls[0]).toEqual({ id: "tablero", items: [], readAt: at(NOW) });
    const readAt = sc.calls[0]?.readAt;
    expect(staleLabel(readAt, at("2026-10-24T17:06:00Z"), "America/Lima")).toBe(
      "sin datos desde 12:00",
    );
    const fail = sc.logs.lines.find((l) => l.event === "read");
    expect(fail).toMatchObject({ ok: false, code: "network" });
  }, 30_000);
});

describe("CA12 (integración)", () => {
  it("los registros de los escenarios no llevan contenido ni ids", () => {
    expect(allLogs.length).toBeGreaterThan(0);
    expectCleanLogs(allLogs);
    expect(allLogs.some((l) => "method" in l)).toBe(true);
    expect(allLogs.some((l) => l.event === "write")).toBe(true);
  });
});
