/* eslint-disable security/detect-non-literal-fs-filename -- carpetas temporales propias */
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadState, saveState } from "../../../server/src/integrations/state.ts";
import { VIEWS6_PATH, data6Text, edited, runNpm } from "../F-006/helpers.ts";
import {
  EXPECTED_TASKS,
  NOW,
  TOKEN,
  startEtapi,
  staleLabel,
  tmp,
  type FakeEtapi,
  type Line,
  type Tmp,
} from "./helpers.ts";
import { rig, sleep, waitFor, type Rig } from "./rig.ts";

let t: Tmp;
let fake: FakeEtapi;
const rigs: Rig[] = [];
let seq = 0;

beforeAll(() => {
  t = tmp();
});
afterAll(() => {
  t.cleanup();
});
afterEach(async () => {
  for (const r of rigs.splice(0)) await r.close();
  await fake.close();
});

const BOARD = "tablero00001";
const at = (iso: string): Date => new Date(iso);
const stateFile = (): string => join(t.dir, `estado-${String(++seq)}.json`);
const load = (file: string, now = NOW): ReturnType<typeof loadState> =>
  loadState(file, BOARD, at(now));
const mode = (file: string): number => statSync(file).mode & 0o777;
const writeLines = (r: Rig, result: string): Line[] =>
  r.logs.lines.filter((l) => l.event === "write" && l.result === result);
const stateLines = (r: Rig): Line[] => r.logs.lines.filter((l) => l.event === "state");

async function fresh(): Promise<void> {
  fake = await startEtapi();
}
function mk(opts: Parameters<typeof rig>[2] = {}): Rig {
  const r = rig(fake, t, opts);
  rigs.push(r);
  return r;
}
interface TaskLike {
  id: string;
  stage: string;
  done: boolean;
}
const taskIn = (items: unknown, id: string): TaskLike | undefined =>
  (items as TaskLike[]).find((x) => x.id === id);

function validState(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    boardNoteId: BOARD,
    savedAt: "2026-10-24T16:59:00.000Z",
    lastGood: { readAt: "2026-10-24T16:59:00.000Z", tasks: EXPECTED_TASKS },
    statuses: { tarjeta00001: "Por hacer" },
    pending: {},
    ...over,
  });
}

describe("CA17 apagado y vuelta", () => {
  it("el estado sobrevive: pendiente guardado, primera llamada con lo último, y al volver se escribe", async () => {
    await fresh();
    const file = stateFile();
    const a = mk({ stateFile: file });
    await a.tt.cycle();
    await waitFor(() => load(file).state !== null, 5000, "archivo tras el ciclo");
    expect(mode(file)).toBe(0o600);
    expect(load(file).state?.lastGood?.readAt).toBe("2026-10-24T17:00:00.000Z");

    fake.offline = true;
    a.clock.set("2026-10-24T17:01:00Z");
    a.tt.onToggle({ sourceId: "tablero", taskId: "tarjeta00001", stage: "done", previous: "todo" });
    await a.tt.idle();
    await waitFor(
      () => load(file).state?.pending.tarjeta00001?.next === "Hecho",
      5000,
      "pendiente en el archivo",
    );
    await a.tt.stop();

    const b = mk({ stateFile: file, now: "2026-10-24T17:30:00Z" });
    expect(b.calls[0]?.id).toBe("tablero");
    expect(b.calls[0]?.readAt).toEqual(at(NOW));
    const items = b.calls[0]?.items as TaskLike[];
    expect(items).toHaveLength(4);
    expect(taskIn(items, "tarjeta00001")).toMatchObject({ stage: "done", done: true });
    expect(taskIn(items, "tarjeta00002")).toMatchObject({ stage: "doing", done: false });

    fake.offline = false;
    b.clock.set("2026-10-24T17:31:00Z");
    await b.tt.cycle();
    expect(b.patches()).toEqual([
      { path: "/etapi/attributes/atrstatus001", body: '{"value":"Hecho"}' },
    ]);
    await waitFor(
      () => {
        const s = load(file, "2026-10-24T17:31:00Z").state;
        return s !== null && Object.keys(s.pending).length === 0;
      },
      5000,
      "archivo sin pendientes",
    );
  }, 30_000);
});

describe("CA18 24 h también apagado", () => {
  it("un pendiente de más de 24 h guardado caduca y no escribe", async () => {
    await fresh();
    const file = t.file(
      "estado-viejo.json",
      validState({
        savedAt: "2026-10-23T16:59:30.000Z",
        lastGood: { readAt: "2026-10-23T16:59:00.000Z", tasks: EXPECTED_TASKS },
        statuses: { tarjeta00001: "Por hacer" },
        pending: { tarjeta00001: { next: "Hecho", since: "2026-10-23T16:59:30.000Z" } },
      }),
    );
    const r = mk({ stateFile: file });
    expect(r.calls[0]).toEqual({ id: "tablero", items: [], readAt: at(NOW) });
    await r.tt.cycle();
    expect(writeLines(r, "expired")).toHaveLength(1);
    expect(r.patches()).toHaveLength(0);
  }, 30_000);
});

describe("CA19 archivo dañado no impide arrancar", () => {
  const cases: { name: string; problem: string; make: () => string }[] = [
    { name: "bad-json", problem: "bad-json", make: () => t.file("d1.json", "{") },
    {
      name: "too-large",
      problem: "too-large",
      make: () => t.file("d2.json", Buffer.alloc(1_048_577, 0x20)),
    },
    {
      name: "permissions",
      problem: "permissions",
      make: () => t.file("d3.json", validState(), 0o644),
    },
    {
      name: "other-board",
      problem: "other-board",
      make: () => t.file("d4.json", validState({ boardNoteId: "otrotablero" })),
    },
  ];
  for (const c of cases) {
    it(`${c.name}: se crea, primera llamada ([], reloj), línea state y archivo válido tras un ciclo`, async () => {
      await fresh();
      const file = c.make();
      const r = mk({ stateFile: file });
      expect(r.calls[0]).toEqual({ id: "tablero", items: [], readAt: at(NOW) });
      const lines = stateLines(r);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ ok: false, problem: c.problem });
      await r.tt.cycle();
      await waitFor(
        () => {
          const l = load(file);
          return l.problem === undefined && l.state !== null && mode(file) === 0o600;
        },
        5000,
        "archivo válido y 600",
      );
    }, 30_000);
  }
});

describe("CA20 escritura atómica", () => {
  it("50 toggle/deshacer: solo el archivo de estado, sin temporales", async () => {
    await fresh();
    const dir = join(t.dir, "solo-estado");
    mkdirSync(dir, { mode: 0o700 });
    const file = join(dir, "estado.json");
    const r = mk({ stateFile: file });
    await r.tt.cycle();
    for (let i = 0; i < 50; i++) {
      r.tt.onToggle({
        sourceId: "tablero",
        taskId: "tarjeta00001",
        stage: i % 2 === 0 ? "done" : "todo",
        previous: i % 2 === 0 ? "todo" : "done",
      });
    }
    await r.tt.idle();
    await sleep(500);
    expect(readdirSync(dir)).toEqual(["estado.json"]);
    const l = load(file);
    expect(l.problem).toBeUndefined();
    expect(l.state).not.toBeNull();
    expect(fake.statusOf("tarjeta00001")).toBe("Por hacer");
  }, 30_000);

  it("saveState hacia una carpeta inexistente lanza y no deja temporal", async () => {
    const dir = join(t.dir, "no-existe");
    const state = JSON.parse(validState()) as Parameters<typeof saveState>[1];
    await expect(saveState(join(dir, "estado.json"), state)).rejects.toThrow();
    expect(readdirSync(t.dir).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });

  it("saveState escribe 600 y loadState lo carga", async () => {
    const file = join(t.dir, "directo.json");
    await saveState(file, JSON.parse(validState()) as Parameters<typeof saveState>[1]);
    expect(mode(file)).toBe(0o600);
    expect(load(file).problem).toBeUndefined();
    expect(readdirSync(t.dir).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });

  it("loadState: inexistente → missing; lastGood de más de 24 h → null con pending conservados", () => {
    expect(load(join(t.dir, "nada.json"))).toEqual({ state: null, problem: "missing" });
    const file = t.file(
      "viejo.json",
      validState({
        lastGood: { readAt: "2026-10-23T16:59:00.000Z", tasks: EXPECTED_TASKS },
        pending: { tarjeta00001: { next: "Hecho", since: "2026-10-24T16:00:00.000Z" } },
      }),
    );
    const l = load(file);
    expect(l.problem).toBeUndefined();
    expect(l.state?.lastGood).toBeNull();
    expect(l.state?.pending.tarjeta00001?.next).toBe("Hecho");
    expect(l.state?.statuses.tarjeta00001).toBe("Por hacer");
  });

  it("el servidor con stateFile en una carpeta inexistente sale con 2 y el puntero", async () => {
    const key = t.file("llave-srv", `${TOKEN}\n`);
    const integ = t.file(
      "i-state.json",
      JSON.stringify({
        version: 1,
        integrations: {
          "trilium-tareas": {
            source: "tablero",
            baseUrl: "http://127.0.0.1:8080/etapi",
            keyFile: key,
            boardNoteId: BOARD,
            allowWrite: true,
            stateFile: join(t.dir, "carpeta-que-no-existe", "estado.json"),
          },
        },
      }),
    );
    const data = t.file(
      "data-state.json",
      edited(data6Text(), (o) => {
        o.sources.tablero.readonly = false;
      }),
    );
    const r = await runNpm(
      "server",
      ["--port", "0", "--views", VIEWS6_PATH, "--data", data, "--integrations", integ],
      60_000,
    );
    expect(r.code).toBe(2);
    expect(r.out + r.err).toContain("/integrations/trilium-tareas/stateFile");
    expect(r.out + r.err).not.toContain(TOKEN);
  }, 90_000);
});

describe("CA21 cierre y olvido", () => {
  it("stop() con el falso lento: ≤ 5500 ms, a lo sumo 1 petición después, pendientes guardados", async () => {
    await fresh();
    const file = stateFile();
    const r = mk({ stateFile: file, timeoutMs: 5000 });
    await r.tt.cycle();
    fake.delayMs = 2000;
    for (const id of ["tarjeta00001", "tarjeta00002", "tarjeta00007"]) {
      r.tt.onToggle({ sourceId: "tablero", taskId: id, stage: "done", previous: "todo" });
    }
    await sleep(150);
    const n = fake.requests.length;
    const t0 = Date.now();
    await r.tt.stop();
    expect(Date.now() - t0).toBeLessThanOrEqual(5500);
    await sleep(2500);
    expect(fake.requests.length - n).toBeLessThanOrEqual(1);
    await waitFor(
      () => {
        const p = load(file).state?.pending ?? {};
        return "tarjeta00002" in p && "tarjeta00007" in p;
      },
      5000,
      "pendientes sin escribir en el archivo",
    );
  }, 30_000);

  it("una tarea que ya no está en el tablero se olvida con result «gone»", async () => {
    await fresh();
    const file = stateFile();
    const r = mk({ stateFile: file });
    await r.tt.cycle();
    fake.offline = true;
    r.tt.onToggle({ sourceId: "tablero", taskId: "tarjeta00001", stage: "done", previous: "todo" });
    await r.tt.idle();
    expect(writeLines(r, "pending")).toHaveLength(1);
    fake.offline = false;
    fake.remove("tarjeta00001");
    fake.failNext = 1; // la escritura falla; la lectura siguiente va bien
    await r.tt.cycle();
    expect(writeLines(r, "gone")).toHaveLength(1);
    expect(taskIn(r.calls.at(-1)?.items, "tarjeta00001")).toBeUndefined();
    await waitFor(
      () => Object.keys(load(file).state?.pending ?? { x: 1 }).length === 0,
      5000,
      "pendiente borrado del archivo",
    );
    expect(r.patches()).toHaveLength(0);
  }, 30_000);
});

describe("CA22 registro sin inundar y día en el aviso", () => {
  it("65 ciclos caídos → 2 líneas; al volver una línea ok con downS 3900", async () => {
    await fresh();
    const r = mk();
    await r.tt.cycle();
    fake.offline = true;
    const start = at("2026-10-24T17:01:00Z").getTime();
    for (let i = 0; i < 65; i++) {
      r.clock.set(new Date(start + i * 60_000).toISOString());
      await r.tt.cycle();
    }
    const failed = r.logs.lines.filter((l) => l.event === "read" && l.ok === false);
    expect(failed).toHaveLength(2);
    expect(failed.map((l) => l.ts)).toEqual([
      "2026-10-24T17:01:00.000Z",
      "2026-10-24T18:01:00.000Z",
    ]);
    fake.offline = false;
    r.clock.set("2026-10-24T18:06:00Z");
    await r.tt.cycle();
    const ok = r.logs.lines.filter((l) => l.event === "read" && l.ok === true);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ downS: 3900 });
  }, 60_000);

  it("staleLabel muestra el día si no es hoy", () => {
    expect(staleLabel(at("2026-10-23T23:30:00Z"), at("2026-10-24T17:06:00Z"), "America/Lima")).toBe(
      "sin datos desde 23/10 18:30",
    );
    expect(staleLabel(at("2026-10-24T17:00:00Z"), at("2026-10-24T17:06:00Z"), "America/Lima")).toBe(
      "sin datos desde 12:00",
    );
  });
});
