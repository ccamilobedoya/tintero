/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access -- carpetas temporales propias y JSON de prueba */
import { mkdirSync, readFileSync, readdirSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../../../server/src/engine/index.ts";
import { fakeRenderer } from "../../../server/src/engine/testing.ts";
import type { TriliumTasksConfig } from "../../../server/src/integrations/config.ts";
import { guardedHttp } from "../../../server/src/integrations/http.ts";
import { triliumTasksManifest } from "../../../server/src/integrations/manifest.ts";
import { loadState, saveState } from "../../../server/src/integrations/state.ts";
import {
  createTriliumTasks,
  type TriliumTasks,
} from "../../../server/src/integrations/trilium-tasks.ts";
import { cfg6, data6, makeClock, type Clock, type Loose } from "../F-006/helpers.ts";
import {
  COLUMNS,
  EXPECTED_TASKS,
  NOW,
  TOKEN,
  sink,
  startEtapi,
  tmp,
  type FakeEtapi,
  type Sink,
  type Tmp,
} from "../F-009/helpers.ts";
import { rig, sleep, waitFor, type Rig } from "../F-009/rig.ts";

const BOARD = "tablero00001";
let t: Tmp;
let fake: FakeEtapi;
const closers: (() => Promise<void>)[] = [];
let seq = 0;

beforeAll(() => {
  t = tmp();
});
afterAll(() => {
  t.cleanup();
});
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  await fake.close();
});

const at = (iso: string): Date => new Date(iso);
const load = (file: string, now = NOW): ReturnType<typeof loadState> =>
  loadState(file, BOARD, at(now));

function mk(opts: Parameters<typeof rig>[2]): Rig {
  const r = rig(fake, t, opts);
  closers.push(() => r.close());
  return r;
}

function validState(): Parameters<typeof saveState>[1] {
  return JSON.parse(
    JSON.stringify({
      version: 1,
      boardNoteId: BOARD,
      savedAt: "2026-10-24T16:59:00.000Z",
      lastGood: { readAt: "2026-10-24T16:59:00.000Z", tasks: EXPECTED_TASKS },
      statuses: { tarjeta00001: "Por hacer" },
      pending: {},
    }),
  ) as Parameters<typeof saveState>[1];
}

describe("CA5 (1) persist libera saveRunning aunque saveState lance", () => {
  it("un guardado que falla una vez no impide el siguiente", async () => {
    fake = await startEtapi();
    const dir = join(t.dir, `aun-no-${String(++seq)}`);
    const file = join(dir, "estado.json");
    const r = mk({ stateFile: file });
    // la carpeta no existe: el primer guardado (tras el ciclo) lanza
    await r.tt.cycle();
    await r.tt.idle();
    await sleep(300);
    expect(() => statSync(file)).toThrow();
    // la carpeta aparece: el siguiente cambio tiene que guardar
    mkdirSync(dir, { mode: 0o700 });
    fake.offline = true;
    r.clock.set("2026-10-24T17:01:00Z");
    r.tt.onToggle({ sourceId: "tablero", taskId: "tarjeta00001", stage: "done", previous: "todo" });
    await r.tt.idle();
    await waitFor(
      () => load(file).state?.pending.tarjeta00001?.next === "Hecho",
      5000,
      "archivo guardado tras el cambio siguiente",
    );
    expect(load(file).problem).toBeUndefined();
  }, 30_000);
});

interface DefectRig {
  tt: TriliumTasks;
  clock: Clock;
  logs: Sink;
  explode(on: boolean): void;
}

/** Integración con un `engine.setSource` que puede lanzar (solo después de crearla). */
function defectRig(): DefectRig {
  const clock = makeClock(NOW);
  const logs = sink();
  const keyFile = t.file(`llave-defecto-${String(++seq)}`, `${TOKEN}\n`);
  const cfgViews = cfg6();
  const data = data6(cfgViews, (o: Loose) => {
    o.sources.tablero.items = [];
  });
  const engine: Engine = createEngine({
    config: cfgViews,
    data,
    renderer: fakeRenderer(),
    clock: clock.clock,
    nextWakeS: 1800,
  });
  let explode = false;
  const failing = {
    setSource: (id: string, items: unknown, meta?: { readAt?: Date }) => {
      if (explode) throw new Error("explota-con-secreto-789");
      return (
        engine as unknown as { setSource: (...a: unknown[]) => ReturnType<Engine["setSource"]> }
      ).setSource(id, items, meta);
    },
  } as Pick<Engine, "setSource">;
  const cfg: TriliumTasksConfig = {
    source: "tablero",
    baseUrl: fake.base,
    keyFile,
    boardNoteId: BOARD,
    allowWrite: true,
    columns: COLUMNS,
  };
  const http = guardedHttp(new URL(fake.base), keyFile, triliumTasksManifest, {
    allowWrite: true,
    log: logs.log,
    clock: clock.clock,
  });
  const tt = createTriliumTasks({
    http,
    config: cfg,
    manifest: triliumTasksManifest,
    engine: failing,
    clock: clock.clock,
    log: logs.log,
  });
  closers.push(async () => {
    await tt.stop();
    await engine.idle();
    await engine.close();
  });
  return {
    tt,
    clock,
    logs,
    explode: (on) => {
      explode = on;
    },
  };
}

describe("CA5 (2) los defectos del ciclo se registran siempre", () => {
  it("setSource lanza: tres ciclos → tres líneas defect/cycle exactas y ninguna read ok:false", async () => {
    fake = await startEtapi();
    const d = defectRig();
    d.explode(true);
    for (const hhmm of ["17:01", "17:02", "17:03"]) {
      d.clock.set(`2026-10-24T${hhmm}:00Z`);
      await d.tt.cycle().catch(() => undefined);
    }
    const defects = d.logs.lines.filter((l) => l.event === "defect");
    expect(defects).toHaveLength(3);
    for (const line of defects) {
      expect(Object.keys(line).sort()).toEqual(["event", "integration", "ts", "where"]);
      expect(line).toMatchObject({ event: "defect", where: "cycle" });
      expect(typeof line.integration).toBe("string");
      expect(typeof line.ts).toBe("string");
    }
    expect(d.logs.lines.filter((l) => l.event === "read" && l.ok === false)).toEqual([]);
    expect(JSON.stringify(d.logs.lines)).not.toContain("explota-con-secreto-789");
  }, 30_000);

  it("un fallo de red sigue siendo read ok:false, no defect", async () => {
    fake = await startEtapi();
    fake.offline = true;
    const d = defectRig();
    await d.tt.cycle();
    expect(d.logs.lines.filter((l) => l.event === "defect")).toEqual([]);
    expect(d.logs.lines.filter((l) => l.event === "read" && l.ok === false)).toHaveLength(1);
  }, 30_000);
});

describe("CA5 (3) la línea pending lleva su code", () => {
  it("una escritura que falla por red deja write/pending con code network", async () => {
    fake = await startEtapi();
    const r = mk({});
    await r.tt.cycle();
    fake.offline = true;
    r.tt.onToggle({ sourceId: "tablero", taskId: "tarjeta00001", stage: "done", previous: "todo" });
    await r.tt.idle();
    const pending = r.logs.lines.filter((l) => l.event === "write" && l.result === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ event: "write", result: "pending", code: "network" });
  }, 30_000);
});

describe("CA5 (4) saveState no sigue enlaces en el temporal", () => {
  it("<estado>.tmp-<pid> enlace a un archivo: el destino no cambia y el estado queda bien", async () => {
    const dir = join(t.dir, `enlace-${String(++seq)}`);
    mkdirSync(dir, { mode: 0o700 });
    const victim = t.file(`victima-${String(seq)}`, "CONTENIDO-ORIGINAL");
    const file = join(dir, "estado.json");
    symlinkSync(victim, `${file}.tmp-${String(process.pid)}`);
    await saveState(file, validState());
    expect(readFileSync(victim, "utf8")).toBe("CONTENIDO-ORIGINAL");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(load(file).problem).toBeUndefined();
    expect(load(file).state?.boardNoteId).toBe(BOARD);
    expect(readdirSync(dir)).toEqual(["estado.json"]);
  });

  it("enlace colgante: no se crea el destino y el estado queda bien", async () => {
    const dir = join(t.dir, `colgante-${String(++seq)}`);
    mkdirSync(dir, { mode: 0o700 });
    const target = join(t.dir, `no-debe-existir-${String(seq)}`);
    const file = join(dir, "estado.json");
    symlinkSync(target, `${file}.tmp-${String(process.pid)}`);
    await saveState(file, validState());
    expect(() => statSync(target)).toThrow();
    expect(load(file).problem).toBeUndefined();
    expect(readdirSync(dir)).toEqual(["estado.json"]);
  });

  it("un resto regular del mismo nombre se reemplaza y no queda", async () => {
    const dir = join(t.dir, `resto-${String(++seq)}`);
    mkdirSync(dir, { mode: 0o700 });
    const file = join(dir, "estado.json");
    t.file(join(`resto-${String(seq)}`, `estado.json.tmp-${String(process.pid)}`), "basura");
    await saveState(file, validState());
    expect(load(file).problem).toBeUndefined();
    expect(readdirSync(dir)).toEqual(["estado.json"]);
  });
});
