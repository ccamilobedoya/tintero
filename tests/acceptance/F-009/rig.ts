/* eslint-disable @typescript-eslint/no-unsafe-member-access -- JSON de prueba */
// Auxiliares de la vuelta 2 de F-009: servidor crudo (corta a media respuesta, 500),
// integración con `stateFile` y esperas.
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { createEngine, type Engine } from "../../../server/src/engine/index.ts";
import { fakeRenderer } from "../../../server/src/engine/testing.ts";
import { triliumTasksManifest } from "../../../server/src/integrations/manifest.ts";
import {
  createTriliumTasks,
  type TriliumTasks,
} from "../../../server/src/integrations/trilium-tasks.ts";
import type { TriliumTasksConfig } from "../../../server/src/integrations/config.ts";
import { guardedHttp } from "../../../server/src/integrations/http.ts";
import { cfg6, data6, makeClock, type Clock, type Loose } from "../F-006/helpers.ts";
import {
  COLUMNS,
  NOW,
  TOKEN,
  sink,
  type FakeEtapi,
  type Sink,
  type SpyCall,
  type Tmp,
} from "./helpers.ts";

export interface RawServer {
  base: string;
  close(): Promise<void>;
}
/** `half`: manda cabeceras y la mitad del cuerpo y se calla. `500`: responde 500. */
export async function startRaw(mode: "half" | "500"): Promise<RawServer> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((_req, res) => {
    if (mode === "500") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end('{"status":500,"code":"INTERNAL","message":"x"}');
      return;
    }
    const full = JSON.stringify({
      noteId: "tablero00001",
      title: "Tablero",
      type: "book",
      childNoteIds: [],
      attributes: [],
    });
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(full),
    });
    res.write(full.slice(0, Math.floor(full.length / 2)));
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}/etapi`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => {
          resolve();
        });
      }),
  };
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Repite `check` cada 20 ms hasta que devuelva algo verdadero (o falla a los `ms`). */
export async function waitFor(check: () => boolean, ms = 5000, what = "condición"): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await sleep(20);
  }
  if (!check()) throw new Error(`no se cumplió a tiempo: ${what}`);
}

export interface Rig {
  clock: Clock;
  engine: Engine;
  tt: TriliumTasks;
  calls: SpyCall[];
  logs: Sink;
  patches(): { path: string; body: string }[];
  close(): Promise<void>;
}

/** Motor + espía + integración con `stateFile` sobre un falso que ya existe. */
export function rig(
  fake: FakeEtapi,
  t: Tmp,
  opts: {
    now?: string;
    stateFile?: string;
    timeoutMs?: number;
    keyFile?: string;
    source?: string;
  } = {},
): Rig {
  const clock = makeClock(opts.now ?? NOW);
  const logs = sink();
  const keyFile =
    opts.keyFile ?? t.file(`llave-${String(Math.random()).slice(2, 8)}`, `${TOKEN}\n`);
  const cfgViews = cfg6();
  const data = data6(cfgViews, (o: Loose) => {
    o.sources.tablero.items = [];
  });
  const ref: { tt?: TriliumTasks } = {};
  const engine = createEngine({
    config: cfgViews,
    data,
    renderer: fakeRenderer(),
    clock: clock.clock,
    nextWakeS: 1800,
    onToggle: (change: Parameters<TriliumTasks["onToggle"]>[0]) => {
      ref.tt?.onToggle(change);
    },
  });
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
    source: opts.source ?? "tablero",
    baseUrl: fake.base,
    keyFile,
    boardNoteId: "tablero00001",
    allowWrite: true,
    columns: COLUMNS,
    ...(opts.stateFile === undefined ? {} : { stateFile: opts.stateFile }),
  };
  const http = guardedHttp(new URL(fake.base), keyFile, triliumTasksManifest, {
    allowWrite: true,
    log: logs.log,
    clock: clock.clock,
    ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
  });
  const made = createTriliumTasks({
    http,
    config: cfg,
    manifest: triliumTasksManifest,
    engine: spy,
    clock: clock.clock,
    log: logs.log,
  });
  ref.tt = made;
  return {
    clock,
    engine,
    tt: made,
    calls,
    logs,
    patches: () =>
      fake.requests
        .filter((r) => r.method === "PATCH")
        .map((r) => ({ path: r.path, body: r.body })),
    close: async () => {
      await made.stop();
      await engine.idle();
      await engine.close();
    },
  };
}
