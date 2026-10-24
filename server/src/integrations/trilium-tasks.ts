// Trilium tasks (F-009): reads the Kanban board through ETAPI and writes back the `status` label.
// Logs carry no content and no ids (I7, S6).
import type { Engine, ToggleChange } from "../engine/engine.ts";
import type { Stage, Task } from "../engine/config.ts";
import { validDate, validDateTime } from "../engine/dates.ts";
import type { TriliumTasksConfig } from "./config.ts";
import { IntegrationHttpError, type GuardedHttp } from "./http.ts";
import type { Manifest } from "./manifest.ts";

type Log = (line: Record<string, unknown>) => void;

const INTEGRATION = "trilium-tareas";
const MAX_TASKS = 500;
const OLD_DONE_MS = 26 * 3_600_000;
const EXPIRE_MS = 24 * 3_600_000;
const ID = /^[A-Za-z0-9_]{1,32}$/;

interface Attribute {
  attributeId: string;
  noteId: string;
  type: string;
  name: string;
  value: string;
  utcDateModified: string;
}
interface Note {
  noteId: string;
  title: string;
  attributes: Attribute[];
  childNoteIds: string[];
}

const bad = (): never => {
  throw new IntegrationHttpError("bad-json");
};
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : bad());

function parseAttribute(v: unknown): Attribute {
  if (!isObj(v)) return bad();
  return {
    attributeId: str(v.attributeId),
    noteId: str(v.noteId),
    type: str(v.type),
    name: str(v.name),
    value: typeof v.value === "string" ? v.value : "",
    utcDateModified: typeof v.utcDateModified === "string" ? v.utcDateModified : "",
  };
}

function parseNote(v: unknown): Note {
  if (!isObj(v)) return bad();
  const attributes = v.attributes;
  if (!Array.isArray(attributes)) return bad();
  const children = v.childNoteIds;
  if (children !== undefined && !Array.isArray(children)) return bad();
  return {
    noteId: str(v.noteId),
    title: str(v.title),
    attributes: (attributes as unknown[]).map(parseAttribute),
    childNoteIds: ((children ?? []) as unknown[]).map(str),
  };
}

const ownLabel = (note: Note, name: string): Attribute | undefined =>
  note.attributes.find((a) => a.noteId === note.noteId && a.type === "label" && a.name === name);

/** "2026-10-24 16:30:00.000Z" → "2026-10-24T16:30:00.000Z"; undefined if it is not a date. */
function toRfc3339(text: string): string | undefined {
  const iso = text.replace(" ", "T");
  return validDateTime(iso) ? iso : undefined;
}

export async function readBoard(
  http: GuardedHttp,
  boardId: string,
  columns: Record<string, Stage>,
  now: Date,
  log: Log = () => undefined,
): Promise<{ tasks: Task[]; statuses: Map<string, string> }> {
  if (!ID.test(boardId)) throw new IntegrationHttpError("bad-path");
  const skip = (reason: string): void => {
    log({ ts: now.toISOString(), integration: INTEGRATION, event: "skipped", reason });
  };
  const board = parseNote((await http.request("GET", `/notes/${boardId}`)).json);
  const search = (
    await http.request(
      "GET",
      `/notes?search=%23status&ancestorNoteId=${boardId}&ancestorDepth=eq1&limit=1000`,
    )
  ).json;
  if (!isObj(search) || !Array.isArray(search.results)) return bad();
  const found = new Map<string, Note>();
  for (const item of search.results as unknown[]) {
    const note = parseNote(item);
    found.set(note.noteId, note);
  }

  const tasks: Task[] = [];
  const statuses = new Map<string, string>();
  for (const id of board.childNoteIds) {
    if (!ID.test(id)) continue;
    const note = found.get(id);
    const statusAttr = note === undefined ? undefined : ownLabel(note, "status");
    if (note === undefined || statusAttr === undefined) {
      skip("no-status");
      continue;
    }
    const stage = Object.hasOwn(columns, statusAttr.value) ? columns[statusAttr.value] : undefined;
    if (stage === undefined) {
      skip("unknown-status");
      continue;
    }
    if (note.attributes.some((a) => a.type === "label" && a.name === "archived")) {
      skip("archived");
      continue;
    }
    const title = note.title.trim();
    if (title === "") {
      skip("empty-title");
      continue;
    }
    let doneAt: string | undefined;
    if (stage === "done") {
      doneAt = toRfc3339(statusAttr.utcDateModified);
      if (doneAt === undefined || now.getTime() - Date.parse(doneAt) > OLD_DONE_MS) {
        skip("old-done");
        continue;
      }
    }
    if (tasks.length >= MAX_TASKS) {
      skip("too-many");
      continue;
    }
    const chars = Array.from(title);
    const task: Task = {
      id,
      title: chars.length > 200 ? `${chars.slice(0, 199).join("")}…` : title,
      done: stage === "done",
      stage,
    };
    if (doneAt !== undefined) task.doneAt = doneAt;
    const due = ownLabel(note, "vence")?.value;
    if (due !== undefined && validDate(due)) task.due = due;
    const category = ownLabel(note, "categoria")?.value;
    if (category !== undefined && category.length >= 1 && category.length <= 40) {
      task.category = category;
    }
    tasks.push(task);
    statuses.set(id, statusAttr.value);
  }
  return { tasks, statuses };
}

export async function markStage(
  http: GuardedHttp,
  noteId: string,
  expected: string,
  next: string,
): Promise<"written" | "conflict"> {
  if (!ID.test(noteId)) return "conflict";
  let note: Note;
  try {
    note = parseNote((await http.request("GET", `/notes/${noteId}`)).json);
  } catch (error) {
    if (error instanceof IntegrationHttpError && error.httpStatus === 404) return "conflict";
    throw error;
  }
  const attr = ownLabel(note, "status");
  if (attr?.value !== expected) return "conflict";
  if (!ID.test(attr.attributeId)) return bad();
  await http.request("PATCH", `/attributes/${attr.attributeId}`, { value: next });
  return "written";
}

export interface TriliumTasks {
  start(): void;
  cycle(): Promise<void>;
  onToggle(change: ToggleChange): void;
  idle(): Promise<void>;
  stop(): Promise<void>;
}

interface Pending {
  next: string;
  since: Date;
}

export function createTriliumTasks(options: {
  http: GuardedHttp;
  config: TriliumTasksConfig;
  manifest: Manifest;
  engine: Pick<Engine, "setSource">;
  clock?: () => Date;
  log?: Log;
}): TriliumTasks {
  const { http, config, manifest, engine } = options;
  const clock = options.clock ?? ((): Date => new Date());
  const rawLog = options.log ?? ((): void => undefined);
  const log: Log = (line) => {
    rawLog({ ts: clock().toISOString(), integration: INTEGRATION, ...line });
  };

  const known = new Map<string, string>(); // last status known in Trilium
  const pending = new Map<string, Pending>();
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  // Everything that calls Trilium runs here, one thing at a time.
  let tail: Promise<void> = Promise.resolve();
  let active = 0;
  function enqueue(job: () => Promise<void>): Promise<void> {
    active++;
    const run = tail.then(job).catch(() => undefined);
    tail = run.finally(() => {
      active--;
    });
    return run;
  }
  const idle = async (): Promise<void> => {
    while (active > 0) await tail;
  };

  const columnOf = (stage: Stage): string | undefined =>
    Object.entries(config.columns).find(([, s]) => s === stage)?.[0];

  async function write(id: string): Promise<void> {
    const wanted = pending.get(id);
    const current = known.get(id);
    if (wanted === undefined || current === undefined) return;
    if (wanted.next === current) {
      pending.delete(id);
      return;
    }
    try {
      const result = await markStage(http, id, current, wanted.next);
      if (result === "written") known.set(id, wanted.next);
      if (pending.get(id) === wanted) pending.delete(id);
      else void enqueue(() => write(id));
      log({ event: "write", result });
    } catch {
      log({ event: "write", result: "pending" });
    }
  }

  async function runCycle(): Promise<void> {
    try {
      const now = clock();
      for (const [id, p] of [...pending]) {
        if (now.getTime() - p.since.getTime() > EXPIRE_MS) {
          pending.delete(id);
          log({ event: "write", result: "expired" });
        }
      }
      for (const id of [...pending.keys()]) await write(id);
      const { tasks, statuses } = await readBoard(
        http,
        config.boardNoteId,
        config.columns,
        clock(),
        rawLog,
      );
      for (const [id, status] of statuses) known.set(id, status);
      const shown = tasks.map((task) => {
        const p = pending.get(task.id);
        const stage = p === undefined ? undefined : config.columns[p.next];
        if (p === undefined || stage === undefined) return task;
        const rest: Task = { ...task };
        delete rest.doneAt;
        return {
          ...rest,
          stage,
          done: stage === "done",
          ...(stage === "done" ? { doneAt: p.since.toISOString() } : {}),
        };
      });
      engine.setSource(config.source, shown, { readAt: clock() });
    } catch (error) {
      log({
        event: "read",
        ok: false,
        code: error instanceof IntegrationHttpError ? error.code : "error",
      });
    }
  }

  engine.setSource(config.source, [], { readAt: clock() });

  const schedule = (): void => {
    if (stopped) return;
    void enqueue(runCycle).then(() => {
      if (stopped) return;
      timer = setTimeout(schedule, manifest.pollS * 1000);
      timer.unref();
    });
  };

  return {
    start: schedule,
    cycle: () => enqueue(runCycle),
    onToggle(change) {
      if (change.sourceId !== config.source) return;
      const next = columnOf(change.stage);
      if (!known.has(change.taskId) || next === undefined) {
        log({ event: "write", result: "unknown-task" });
        return;
      }
      pending.set(change.taskId, { next, since: clock() });
      void enqueue(() => write(change.taskId));
    },
    idle,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await idle();
    },
  };
}
