// Trilium tasks (F-009): reads the Kanban board through ETAPI and writes back the `status` label.
// Logs carry no content and no ids (I7, S6).
import type { Engine, ToggleChange } from "../engine/engine.ts";
import type { Stage, Task } from "../engine/config.ts";
import { validDate, validDateTime } from "../engine/dates.ts";
import type { TriliumTasksConfig } from "./config.ts";
import { IntegrationHttpError, type GuardedHttp } from "./http.ts";
import type { Manifest } from "./manifest.ts";
import { loadState, saveState, type SavedState } from "./state.ts";

type Log = (line: Record<string, unknown>) => void;

const INTEGRATION = "trilium-tareas";
const MAX_TASKS = 500;
const OLD_DONE_MS = 26 * 3_600_000;
const EXPIRE_MS = 24 * 3_600_000;
const REFRESH_SAVED_MS = 5 * 60_000; // an unchanged board refreshes the saved read time this often
const FAIL_LOG_EVERY_MS = 60 * 60_000;
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
  /** Waits for the queue to be empty and for the state file to be written. */
  idle(): Promise<void>;
  /** Stops the timer, starts nothing more and waits only for the call in progress. */
  stop(): Promise<void>;
}

interface Pending {
  next: string;
  since: Date;
}

const parseTime = (text: string): Date => new Date(text);

export function createTriliumTasks(options: {
  http: GuardedHttp;
  config: TriliumTasksConfig;
  manifest: Manifest;
  engine: Pick<Engine, "setSource">;
  clock?: () => Date;
  log?: Log;
}): TriliumTasks {
  const { config, manifest, engine } = options;
  const clock = options.clock ?? ((): Date => new Date());
  const rawLog = options.log ?? ((): void => undefined);
  const log: Log = (line) => {
    rawLog({ ts: clock().toISOString(), integration: INTEGRATION, ...line });
  };

  const known = new Map<string, string>(); // last status known in Trilium
  const pending = new Map<string, Pending>();
  let lastKey = ""; // what the saved result looked like (tasks + statuses)
  let timer: NodeJS.Timeout | undefined;
  // Flags changed from several async paths live in one object (control-flow narrowing).
  const flags = { stopped: false, saveAgain: false, saveRunning: false };

  // After stop() nothing new goes out: an in-flight markStage cannot send its PATCH.
  const http: GuardedHttp = {
    request: (method, path, body) =>
      flags.stopped
        ? Promise.reject(new IntegrationHttpError("network"))
        : options.http.request(method, path, body),
  };

  const columnOf = (stage: Stage): string | undefined =>
    Object.entries(config.columns).find(([, s]) => s === stage)?.[0];

  /** Puts the local marks on top of what was read. */
  const overlay = (tasks: Task[]): Task[] =>
    tasks.map((task) => {
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

  // ---- saved state: one write at a time, one more at the end if something changed meanwhile ----
  let saving: Promise<void> = Promise.resolve();
  const again = (): boolean => flags.saveAgain;
  const isStopped = (): boolean => flags.stopped;
  function snapshot(): SavedState {
    return {
      version: 1,
      boardNoteId: config.boardNoteId,
      savedAt: clock().toISOString(),
      lastGood:
        lastGood === null ? null : { readAt: lastGood.readAt.toISOString(), tasks: lastGood.tasks },
      statuses: Object.fromEntries(known),
      pending: Object.fromEntries(
        [...pending].map(([id, p]) => [id, { next: p.next, since: p.since.toISOString() }]),
      ),
    };
  }
  function persist(): void {
    const file = config.stateFile;
    if (file === undefined) return;
    if (flags.saveRunning) {
      flags.saveAgain = true;
      return;
    }
    flags.saveRunning = true;
    saving = (async () => {
      try {
        do {
          flags.saveAgain = false;
          try {
            await saveState(file, snapshot());
          } catch {
            log({ event: "state", ok: false, problem: "write" });
          }
        } while (again());
      } finally {
        flags.saveRunning = false;
      }
    })();
  }

  // ---- start: recover what was saved ----
  function recover(): { readAt: Date; tasks: Task[] } | null {
    const file = config.stateFile;
    if (file === undefined) return null;
    const { state, problem } = loadState(file, config.boardNoteId, clock());
    if (problem !== undefined && problem !== "missing") {
      log({ event: "state", ok: false, problem });
    }
    if (state === null) return null;
    for (const [id, status] of Object.entries(state.statuses)) known.set(id, status);
    for (const [id, p] of Object.entries(state.pending)) {
      if (known.has(id) && Object.hasOwn(config.columns, p.next)) {
        pending.set(id, { next: p.next, since: parseTime(p.since) });
      }
    }
    if (state.lastGood === null) return null;
    const good = { readAt: parseTime(state.lastGood.readAt), tasks: state.lastGood.tasks };
    lastKey = JSON.stringify([good.tasks, Object.fromEntries(known)]);
    return good;
  }
  let lastGood = recover();
  let first = true;
  if (lastGood !== null) {
    const result = engine.setSource(config.source, overlay(lastGood.tasks), {
      readAt: lastGood.readAt,
    });
    if (result.ok) first = false;
    else {
      log({ event: "state", ok: false, problem: "bad-json" });
      lastGood = null;
      lastKey = "";
    }
  }
  if (first) engine.setSource(config.source, [], { readAt: clock() });

  // ---- the queue: everything that calls Trilium runs here, one thing at a time ----
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
  const fire = (job: () => Promise<void>): void => {
    enqueue(job).catch(() => undefined); // enqueue never rejects; this keeps it explicit
  };
  const idle = async (): Promise<void> => {
    for (;;) {
      while (active > 0) await tail;
      await saving;
      if (active === 0 && !flags.saveRunning) return;
    }
  };

  async function write(id: string): Promise<void> {
    const wanted = pending.get(id);
    const current = known.get(id);
    if (flags.stopped || wanted === undefined || current === undefined) return;
    if (wanted.next === current) {
      pending.delete(id);
      persist();
      return;
    }
    try {
      const result = await markStage(http, id, current, wanted.next);
      if (result === "written") known.set(id, wanted.next);
      if (pending.get(id) === wanted) pending.delete(id);
      else fire(() => write(id));
      persist();
      log({ event: "write", result });
    } catch (error) {
      log({
        event: "write",
        result: "pending",
        code: error instanceof IntegrationHttpError ? error.code : "error",
      });
    }
  }

  // Read failures are logged once, then once per hour, then once when it is back.
  let failingSince: Date | undefined;
  let lastFailLog: Date | undefined;
  function readFailed(error: unknown): void {
    const now = clock();
    if (failingSince === undefined) failingSince = now;
    else if (
      lastFailLog !== undefined &&
      now.getTime() - lastFailLog.getTime() < FAIL_LOG_EVERY_MS
    ) {
      return;
    }
    lastFailLog = now;
    log({
      event: "read",
      ok: false,
      code: error instanceof IntegrationHttpError ? error.code : "error",
    });
  }
  function readSucceeded(): void {
    if (failingSince === undefined) return;
    log({
      event: "read",
      ok: true,
      downS: Math.round((clock().getTime() - failingSince.getTime()) / 1000),
    });
    failingSince = undefined;
    lastFailLog = undefined;
  }

  async function runCycle(): Promise<void> {
    try {
      const now = clock();
      let expired = false;
      for (const [id, p] of [...pending]) {
        if (now.getTime() - p.since.getTime() > EXPIRE_MS) {
          pending.delete(id);
          expired = true;
          log({ event: "write", result: "expired" });
        }
      }
      if (expired) persist();
      for (const id of [...pending.keys()]) await write(id);
      if (flags.stopped) return;
      const { tasks, statuses } = await readBoard(
        http,
        config.boardNoteId,
        config.columns,
        clock(),
        rawLog,
      );
      if (isStopped()) return;
      readSucceeded();
      for (const [id, status] of statuses) known.set(id, status);
      let forgot = false;
      for (const id of [...known.keys()]) {
        if (statuses.has(id)) continue;
        known.delete(id);
        forgot = true;
        if (pending.delete(id)) log({ event: "write", result: "gone" });
      }
      const readAt = clock();
      engine.setSource(config.source, overlay(tasks), { readAt });
      const key = JSON.stringify([tasks, Object.fromEntries(known)]);
      const aged =
        lastGood !== null && readAt.getTime() - lastGood.readAt.getTime() >= REFRESH_SAVED_MS;
      if (key !== lastKey || forgot || aged) {
        lastKey = key;
        lastGood = { readAt, tasks };
        persist();
      }
    } catch (error) {
      if (error instanceof IntegrationHttpError) readFailed(error);
      else log({ event: "defect", where: "cycle" }); // always logged, no message or stack
    }
  }

  const schedule = (): void => {
    if (flags.stopped) return;
    enqueue(runCycle)
      .then(() => {
        if (flags.stopped) return;
        timer = setTimeout(schedule, manifest.pollS * 1000);
        timer.unref();
      })
      .catch(() => undefined);
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
      persist();
      fire(() => write(change.taskId));
    },
    idle,
    async stop() {
      flags.stopped = true;
      if (timer) clearTimeout(timer);
      while (active > 0) await tail;
      await saving;
    },
  };
}
