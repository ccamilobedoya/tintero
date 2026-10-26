// `example-json` (F-018, D8): the template for a new integration. It reads one public JSON file
// over https, with a GET and no key, and hands a read-only `tasks` source to the engine. It is off
// unless the integrations file configures it. Logs carry counts and codes, never titles.
//
// The JSON it expects (at most 100 items; any other field is dropped):
//   [{ "id": "a1", "title": "Water the plants", "done": false, "due": "2026-10-30" }]
import type { Engine } from "../engine/engine.ts";
import { validDate } from "../engine/dates.ts";
import { IntegrationHttpError, type GuardedHttp } from "./http.ts";
import { exampleJsonManifest } from "./manifest.ts";

type Log = (line: Record<string, unknown>) => void;

const INTEGRATION = exampleJsonManifest.id;
/** The only path it reads, below the configured base URL (also the one its manifest allows). */
export const EXAMPLE_JSON_PATH = "/tasks.json";
const MAX_BYTES = 65_536; // the answer, checked while reading and before parsing
const MAX_ITEMS = 100;
const MAX_ID = 64;
const MAX_TITLE = 200;
const ID = /^[A-Za-z0-9_-]+$/;

/** Limits the guarded client must be built with for this integration. */
export const EXAMPLE_JSON_HTTP_LIMITS = { maxBytes: MAX_BYTES, timeoutMs: 5000 } as const;

export interface ExampleTask {
  id: string;
  title: string;
  done: boolean;
  due?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The answer → tasks, field by field. One wrong field, or a repeated id, rejects the whole answer
 * (`bad-json`): nothing half-checked reaches the engine.
 */
export function parseExampleTasks(json: unknown): ExampleTask[] {
  if (!Array.isArray(json) || json.length > MAX_ITEMS) throw new IntegrationHttpError("bad-json");
  const seen = new Set<string>();
  return (json as unknown[]).map((entry) => {
    if (!isObj(entry)) throw new IntegrationHttpError("bad-json");
    const { id, title, done, due } = entry;
    if (typeof id !== "string" || id.length > MAX_ID || !ID.test(id) || seen.has(id)) {
      throw new IntegrationHttpError("bad-json");
    }
    seen.add(id);
    if (typeof title !== "string" || title.length < 1 || title.length > MAX_TITLE) {
      throw new IntegrationHttpError("bad-json");
    }
    if (typeof done !== "boolean") throw new IntegrationHttpError("bad-json");
    if (due === undefined) return { id, title, done };
    if (typeof due !== "string" || !validDate(due)) throw new IntegrationHttpError("bad-json");
    return { id, title, done, due };
  });
}

export interface ExampleJson {
  start(): void;
  cycle(): Promise<void>;
  idle(): Promise<void>;
  stop(): Promise<void>;
}

export function createExampleJson(options: {
  http: GuardedHttp;
  source: string;
  engine: Pick<Engine, "setSource">;
  clock?: () => Date;
  log?: Log;
}): ExampleJson {
  const { http, source, engine } = options;
  const clock = options.clock ?? ((): Date => new Date());
  const rawLog = options.log ?? ((): void => undefined);
  const log: Log = (line) => {
    rawLog({ ts: clock().toISOString(), integration: INTEGRATION, ...line });
  };
  const flags = { stopped: false };
  let timer: NodeJS.Timeout | undefined;

  async function runCycle(): Promise<void> {
    try {
      const answer = await http.request("GET", EXAMPLE_JSON_PATH);
      const items = parseExampleTasks(answer.json);
      if (flags.stopped) return;
      const result = engine.setSource(source, items, { readAt: clock() });
      log(
        result.ok
          ? { event: "read", status: answer.status, items: items.length }
          : { event: "error", code: "set-source" },
      );
    } catch (error) {
      if (flags.stopped) return;
      // The last good read stays in the engine; it will say "no data since" on its own.
      log({
        event: "error",
        code: error instanceof IntegrationHttpError ? error.code : "error",
        ...(error instanceof IntegrationHttpError && error.httpStatus !== undefined
          ? { status: error.httpStatus }
          : {}),
      });
    }
  }

  let tail: Promise<void> = Promise.resolve();
  let active = 0;
  function enqueue(job: () => Promise<void>): Promise<void> {
    active++;
    const run = tail.then(() => (flags.stopped ? undefined : job())).catch(() => undefined);
    tail = run.finally(() => {
      active--;
    });
    return run;
  }

  const schedule = (): void => {
    if (flags.stopped) return;
    enqueue(runCycle)
      .then(() => {
        if (flags.stopped) return;
        timer = setTimeout(schedule, exampleJsonManifest.pollS * 1000);
        timer.unref();
      })
      .catch(() => undefined);
  };

  return {
    start: schedule,
    cycle: () => enqueue(runCycle),
    async idle() {
      while (active > 0) await tail;
    },
    async stop() {
      flags.stopped = true;
      if (timer) clearTimeout(timer);
      while (active > 0) await tail;
    },
  };
}
