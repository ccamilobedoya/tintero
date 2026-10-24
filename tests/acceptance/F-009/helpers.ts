/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- carpetas temporales propias y JSON de prueba */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { createEngine, type Engine, type Stage } from "../../../server/src/engine/index.ts";
import { fakeRenderer } from "../../../server/src/engine/testing.ts";
import { guardedHttp, type GuardedHttp } from "../../../server/src/integrations/http.ts";
import { triliumTasksManifest, type Manifest } from "../../../server/src/integrations/manifest.ts";
import {
  createTriliumTasks,
  type TriliumTasks,
} from "../../../server/src/integrations/trilium-tasks.ts";
import type { TriliumTasksConfig } from "../../../server/src/integrations/config.ts";
import {
  P124,
  cfg6,
  data6,
  makeClock,
  type Clock,
  type Loose,
  getViews,
  act6,
  zid,
} from "../F-006/helpers.ts";
import { FORBIDDEN_IN_LOGS, TOKEN, startEtapi, type FakeEtapi } from "./etapi.ts";

export { startEtapi, TOKEN, type FakeEtapi };
export { P124, makeClock, getViews, act6, zid };
export { staleLabel } from "../F-006/helpers.ts";

export const NOW = "2026-10-24T17:00:00Z";
export const COLUMNS: Record<string, Stage> = {
  "Por hacer": "todo",
  "En progreso": "doing",
  Hecho: "done",
};

export interface Tmp {
  dir: string;
  file(name: string, content: string | Buffer, mode?: number): string;
  cleanup(): void;
}
/** Carpeta temporal fuera del repo; se borra con `cleanup()`. */
export function tmp(): Tmp {
  const dir = mkdtempSync(join(tmpdir(), "tintero-f009-"));
  return {
    dir,
    file(name, content, mode = 0o600) {
      const p = join(dir, name);
      writeFileSync(p, content);
      chmodSync(p, mode);
      return p;
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type Line = Record<string, unknown>;
export interface Sink {
  lines: Line[];
  log: (line: Line) => void;
}
export const sink = (): Sink => {
  const lines: Line[] = [];
  return { lines, log: (l) => lines.push(l) };
};

/** Lo que ningún registro puede contener, y las claves exactas de una línea de llamada. */
export function expectCleanLogs(lines: Line[]): void {
  const callKeys = ["host", "integration", "method", "ms", "status", "ts"];
  for (const line of lines) {
    const text = JSON.stringify(line);
    for (const bad of FORBIDDEN_IN_LOGS) expect(text, `línea ${text}`).not.toContain(bad);
    expect(text).not.toContain("xxxxxxxxxx");
    if ("method" in line) expect(Object.keys(line).sort()).toEqual(callKeys);
  }
}

export interface HttpParts {
  http: GuardedHttp;
  logs: Sink;
}
export function mkHttp(
  fake: FakeEtapi,
  keyFile: string,
  opts: {
    manifest?: Manifest;
    maxBytes?: number;
    timeoutMs?: number;
    allowWrite?: boolean;
    clock?: () => Date;
    logs?: Sink;
  } = {},
): HttpParts {
  const logs = opts.logs ?? sink();
  const http = guardedHttp(new URL(fake.base), keyFile, opts.manifest ?? triliumTasksManifest, {
    allowWrite: opts.allowWrite ?? true,
    log: logs.log,
    clock: opts.clock ?? (() => new Date(NOW)),
    ...(opts.maxBytes === undefined ? {} : { maxBytes: opts.maxBytes }),
    ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
  });
  return { http, logs };
}

/** Código del error (síncrono o asíncrono) o `undefined` si no lanzó. */
export async function codeOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    const err = e as { code?: unknown; name?: unknown };
    return typeof err.code === "string"
      ? err.code
      : `no-es-IntegrationHttpError:${String(err.name)}`;
  }
}

export interface SpyCall {
  id: string;
  items: unknown;
  readAt: Date | undefined;
}

export interface Scenario {
  fake: FakeEtapi;
  clock: Clock;
  engine: Engine;
  tt: TriliumTasks;
  calls: SpyCall[];
  logs: Sink;
  cfg: TriliumTasksConfig;
  /** Vistas actualizadas del motor (para que la zona exista antes de un toggle). */
  refresh(): Promise<void>;
  toggle(taskId: string): { status: string; changed: boolean };
  /** Peticiones PATCH que recibió el falso. */
  patches(): { path: string; body: string }[];
  close(): Promise<void>;
}

/** Motor + espía + integración sobre el falso (CA7 a CA10). */
export async function scenario(
  t: Tmp,
  opts: { offlineAtStart?: boolean; allowWrite?: boolean } = {},
): Promise<Scenario> {
  const fake = await startEtapi();
  if (opts.offlineAtStart) fake.offline = true;
  const clock = makeClock(NOW);
  const logs = sink();
  const keyFile = t.file("llave", `${TOKEN}\n`);
  const cfgViews = cfg6();
  const data = data6(cfgViews, (o: Loose) => {
    o.sources.tablero.items = [];
  });
  let tt: TriliumTasks | undefined;
  const engineOptions = {
    config: cfgViews,
    data,
    renderer: fakeRenderer(),
    clock: clock.clock,
    nextWakeS: 1800,
    onToggle: (change: Parameters<TriliumTasks["onToggle"]>[0]) => {
      tt?.onToggle(change);
    },
  };
  const engine = createEngine(engineOptions as Parameters<typeof createEngine>[0]);
  const calls: SpyCall[] = [];
  const spy = {
    setSource: (id: string, items: unknown, meta?: { readAt?: Date }) => {
      calls.push({ id, items, readAt: meta?.readAt });
      return (
        engine as unknown as { setSource: (...a: unknown[]) => ReturnType<Engine["setSource"]> }
      ).setSource(id, items, meta);
    },
  } as Pick<Engine, "setSource">;
  const cfg: TriliumTasksConfig = {
    source: "tablero",
    baseUrl: fake.base,
    keyFile,
    boardNoteId: "tablero00001",
    allowWrite: opts.allowWrite ?? true,
    columns: COLUMNS,
  };
  const { http } = mkHttp(fake, keyFile, {
    allowWrite: cfg.allowWrite,
    clock: clock.clock,
    logs,
  });
  tt = createTriliumTasks({
    http,
    config: cfg,
    manifest: triliumTasksManifest,
    engine: spy,
    clock: clock.clock,
    log: logs.log,
  });
  const refresh = async (): Promise<void> => {
    await engine.idle();
    await getViews(engine, "local", P124);
    await engine.idle();
  };
  const made = tt;
  return {
    fake,
    clock,
    engine,
    tt: made,
    calls,
    logs,
    cfg,
    refresh,
    toggle: (taskId) => engine.apply("local", act6("hoy", zid("hoy", taskId), "toggle")),
    patches: () =>
      fake.requests
        .filter((r) => r.method === "PATCH")
        .map((r) => ({ path: r.path, body: r.body })),
    close: async () => {
      await made.stop();
      await engine.idle();
      await engine.close();
      await fake.close();
    },
  };
}

export const EXPECTED_TASKS = [
  { id: "tarjeta00002", title: "Soldar los pines", done: false, stage: "doing" },
  { id: "tarjeta00001", title: "Comprar pilas", done: false, stage: "todo", due: "2026-10-26" },
  {
    id: "tarjeta00003",
    title: "Pagar el agua",
    done: true,
    stage: "done",
    doneAt: "2026-10-24T16:30:00.000Z",
  },
  { id: "tarjeta00007", title: `${"x".repeat(199)}…`, done: false, stage: "todo" },
];
