// Saved state of an integration (F-009 vuelta 2, ADR-0044): pending marks and the last good read.
// It holds task titles, so it is private (mode 600), capped on load and written atomically.
import { closeSync, fstatSync, openSync } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { Task } from "../engine/config.ts";
import { validDateTime } from "../engine/dates.ts";
import { readCapped } from "../tls.ts";

export interface SavedState {
  version: 1;
  boardNoteId: string;
  savedAt: string; // RFC 3339
  lastGood: { readAt: string; tasks: Task[] } | null;
  statuses: Record<string, string>;
  pending: Record<string, { next: string; since: string }>;
}

export type StateProblem = "missing" | "permissions" | "too-large" | "bad-json" | "other-board";

const MAX_STATE_BYTES = 1_048_576;
const MAX_ENTRIES = 1000;
const MAX_TEXT = 4096;
const DAY_MS = 24 * 3_600_000;
const ID = /^[A-Za-z0-9_]{1,32}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isTime = (v: unknown): v is string =>
  typeof v === "string" && validDateTime(v) && !Number.isNaN(Date.parse(v));

const shortText = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_TEXT;

/** Returns the checked state, or undefined when the shape is wrong. */
function shape(value: unknown): SavedState | undefined {
  if (!isObj(value) || value.version !== 1) return undefined;
  const { boardNoteId, savedAt, lastGood, statuses, pending } = value;
  if (typeof boardNoteId !== "string" || !ID.test(boardNoteId) || !isTime(savedAt)) {
    return undefined;
  }
  let good: SavedState["lastGood"] = null;
  if (lastGood !== null) {
    if (!isObj(lastGood) || !isTime(lastGood.readAt) || !Array.isArray(lastGood.tasks)) {
      return undefined;
    }
    if (lastGood.tasks.length > MAX_ENTRIES || !lastGood.tasks.every(isObj)) return undefined;
    good = { readAt: lastGood.readAt, tasks: lastGood.tasks as unknown as Task[] };
  }
  if (!isObj(statuses) || !isObj(pending)) return undefined;
  const statusEntries = Object.entries(statuses);
  const pendingEntries = Object.entries(pending);
  if (statusEntries.length > MAX_ENTRIES || pendingEntries.length > MAX_ENTRIES) return undefined;
  const outStatuses: [string, string][] = [];
  for (const [id, status] of statusEntries) {
    if (!ID.test(id) || !shortText(status)) return undefined;
    outStatuses.push([id, status]);
  }
  const outPending: [string, { next: string; since: string }][] = [];
  for (const [id, item] of pendingEntries) {
    if (!ID.test(id) || !isObj(item) || !shortText(item.next) || !isTime(item.since)) {
      return undefined;
    }
    outPending.push([id, { next: item.next, since: item.since }]);
  }
  return {
    version: 1,
    boardNoteId,
    savedAt,
    lastGood: good,
    statuses: Object.fromEntries(outStatuses),
    pending: Object.fromEntries(outPending),
  };
}

/** Never throws: any problem gives `state: null` and the reason. */
export function loadState(
  file: string,
  boardNoteId: string,
  now: Date,
): { state: SavedState | null; problem?: StateProblem } {
  let size: number;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the owner's configuration
    const fd = openSync(file, "r");
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) return { state: null, problem: "bad-json" };
      if ((stat.mode & 0o077) !== 0) return { state: null, problem: "permissions" };
      size = stat.size;
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return { state: null, problem: missing ? "missing" : "bad-json" };
  }
  if (size > MAX_STATE_BYTES) return { state: null, problem: "too-large" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readCapped(file, MAX_STATE_BYTES).toString("utf8"));
  } catch (error) {
    const big = error instanceof Error && error.message === "file too large";
    return { state: null, problem: big ? "too-large" : "bad-json" };
  }
  const state = shape(parsed);
  if (state === undefined) return { state: null, problem: "bad-json" };
  if (state.boardNoteId !== boardNoteId) return { state: null, problem: "other-board" };
  if (state.lastGood !== null && now.getTime() - Date.parse(state.lastGood.readAt) > DAY_MS) {
    state.lastGood = null;
  }
  return { state };
}

/** Atomic: temporary file (600) + fsync + rename + fsync of the folder. Throws if it cannot. */
export async function saveState(file: string, state: SavedState): Promise<void> {
  const temp = `${file}.tmp-${process.pid}`;
  try {
    /* eslint-disable security/detect-non-literal-fs-filename -- path from the owner's configuration */
    const handle = await open(temp, "w", 0o600);
    try {
      await handle.chmod(0o600);
      await handle.writeFile(JSON.stringify(state), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
    const dir = await open(dirname(file), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
    /* eslint-enable security/detect-non-literal-fs-filename */
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}
