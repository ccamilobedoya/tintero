// Integrations file (F-009): schema, limits and loading. Errors carry the JSON pointer and a reason,
// never a value from the file (S6).
import { isAbsolute } from "node:path";
import { ConfigError, type DataFile, type Stage } from "../engine/config.ts";
import { readCapped } from "../tls.ts";
import { IntegrationHttpError, parseBase } from "./http.ts";

const MAX_FILE_BYTES = 65_536;
const NOTE_ID = /^[A-Za-z0-9_]{1,32}$/;
const STAGES: readonly string[] = ["todo", "doing", "done"];
const POINTER = "/integrations/trilium-tareas";

export interface TriliumTasksConfig {
  source: string;
  baseUrl: string;
  keyFile: string;
  boardNoteId: string;
  allowWrite: boolean;
  columns: Record<string, Stage>;
  /** Absolute path of the saved state (ADR-0044); without it everything lives in memory. */
  stateFile?: string;
}

export interface HolidaysIntegrationConfig {
  /** Nager.Date by default; in tests, a local fake. */
  baseUrl: string;
  /** Absolute path of the cache file (F-013); without it everything lives in memory. */
  stateFile?: string;
}

export const DEFAULT_HOLIDAYS_BASE = "https://date.nager.at";

export interface IntegrationsFile {
  version: 1;
  integrations: { "trilium-tareas"?: TriliumTasksConfig; festivos?: HolidaysIntegrationConfig };
}

export const DEFAULT_COLUMNS: Record<string, Stage> = {
  "Por hacer": "todo",
  "En progreso": "doing",
  Hecho: "done",
};

type Obj = Record<string, unknown>;

const fail = (pointer: string, reason: string): never => {
  throw new ConfigError(`integrations: ${pointer === "" ? "/" : pointer}: ${reason}`);
};

const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const own = (obj: Obj, key: string): unknown => (Object.hasOwn(obj, key) ? obj[key] : undefined); // eslint-disable-line security/detect-object-injection -- guarded by hasOwn

function object(value: unknown, pointer: string, allowed: string[]): Obj {
  if (!isObj(value)) return fail(pointer, "must be an object");
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      fail(`${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`, "unknown field");
  }
  return value;
}

function text(value: unknown, pointer: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    return fail(pointer, `must be text of ${min} to ${max} characters`);
  }
  return value;
}

function parseColumns(value: unknown, pointer: string): Record<string, Stage> {
  if (!isObj(value)) return fail(pointer, "must be an object");
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > 10) fail(pointer, "must have 1 to 10 columns");
  const out: [string, Stage][] = [];
  for (const [index, [name, stage]] of entries.entries()) {
    // R8: the pointer uses the position, never the column name (S6).
    const at = `${pointer}/${index}`;
    if (name.length < 1 || name.length > 40) fail(at, "column name must have 1 to 40 characters");
    if (typeof stage !== "string" || !STAGES.includes(stage)) {
      fail(at, "must be todo, doing or done");
    }
    out.push([name, stage as Stage]);
  }
  const stages = out.map(([, stage]) => stage);
  if (!stages.includes("done")) fail(pointer, 'needs a column with "done"');
  if (!stages.includes("todo")) fail(pointer, 'needs a column with "todo"');
  return Object.fromEntries(out);
}

function parseTasks(value: unknown): TriliumTasksConfig {
  const p = POINTER;
  const obj = object(value, p, [
    "source",
    "baseUrl",
    "keyFile",
    "boardNoteId",
    "allowWrite",
    "columns",
    "stateFile",
  ]);
  const source = text(own(obj, "source"), `${p}/source`, 1, 64);
  const baseUrl = text(own(obj, "baseUrl"), `${p}/baseUrl`, 1, 300);
  try {
    parseBase(baseUrl);
  } catch (error) {
    if (!(error instanceof IntegrationHttpError)) throw error;
    fail(`${p}/baseUrl`, "must be https:// or http://127.0.0.1:<port>/…");
  }
  const keyFile = text(own(obj, "keyFile"), `${p}/keyFile`, 1, 4096);
  if (!isAbsolute(keyFile)) fail(`${p}/keyFile`, "must be an absolute path");
  const boardNoteId = text(own(obj, "boardNoteId"), `${p}/boardNoteId`, 1, 32);
  if (!NOTE_ID.test(boardNoteId)) fail(`${p}/boardNoteId`, "must be letters, digits or _");
  const allowWrite = own(obj, "allowWrite");
  if (typeof allowWrite !== "boolean") fail(`${p}/allowWrite`, "must be true or false");
  const columns =
    own(obj, "columns") === undefined
      ? { ...DEFAULT_COLUMNS }
      : parseColumns(own(obj, "columns"), `${p}/columns`);
  const result: TriliumTasksConfig = {
    source,
    baseUrl,
    keyFile,
    boardNoteId,
    allowWrite: allowWrite as boolean,
    columns,
  };
  if (own(obj, "stateFile") !== undefined) {
    const stateFile = text(own(obj, "stateFile"), `${p}/stateFile`, 1, 4096);
    if (!isAbsolute(stateFile)) fail(`${p}/stateFile`, "must be an absolute path");
    result.stateFile = stateFile;
  }
  return result;
}

export function parseIntegrations(raw: string): IntegrationsFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("", "not valid JSON");
  }
  const root = object(parsed, "", ["version", "integrations"]);
  if (own(root, "version") !== 1) fail("/version", "must be 1");
  const list = object(own(root, "integrations"), "/integrations", ["trilium-tareas", "festivos"]);
  const tasks = own(list, "trilium-tareas");
  const holidays = own(list, "festivos");
  return {
    version: 1,
    integrations: {
      ...(tasks === undefined ? {} : { "trilium-tareas": parseTasks(tasks) }),
      ...(holidays === undefined ? {} : { festivos: parseHolidays(holidays) }),
    },
  };
}

function parseHolidays(value: unknown): HolidaysIntegrationConfig {
  const p = "/integrations/festivos";
  const obj = object(value, p, ["baseUrl", "stateFile"]);
  const baseUrl =
    own(obj, "baseUrl") === undefined
      ? DEFAULT_HOLIDAYS_BASE
      : text(own(obj, "baseUrl"), `${p}/baseUrl`, 1, 300);
  try {
    parseBase(baseUrl);
  } catch (error) {
    if (!(error instanceof IntegrationHttpError)) throw error;
    fail(`${p}/baseUrl`, "must be https:// or http://127.0.0.1:<port>/…");
  }
  const result: HolidaysIntegrationConfig = { baseUrl };
  if (own(obj, "stateFile") !== undefined) {
    const stateFile = text(own(obj, "stateFile"), `${p}/stateFile`, 1, 4096);
    if (!isAbsolute(stateFile)) fail(`${p}/stateFile`, "must be an absolute path");
    result.stateFile = stateFile;
  }
  return result;
}

export function loadIntegrations(file: string): IntegrationsFile {
  let raw: string;
  try {
    raw = readCapped(file, MAX_FILE_BYTES).toString("utf8");
  } catch (error) {
    const big = error instanceof Error && error.message === "file too large";
    throw new ConfigError(`integrations: /: ${big ? "file too large" : "cannot be read"}`, {
      cause: error,
    });
  }
  return parseIntegrations(raw);
}

/** The source must exist with type tasks, and `readonly` must be the opposite of `allowWrite` (D15). */
export function checkAgainstData(file: IntegrationsFile, data: DataFile): void {
  const tasks = file.integrations["trilium-tareas"];
  if (tasks === undefined) return;
  const source = Object.hasOwn(data.sources, tasks.source) ? data.sources[tasks.source] : undefined;
  if (source?.type !== "tasks") fail(`${POINTER}/source`, "must be a source of type tasks");
  if (source?.readonly === tasks.allowWrite) {
    fail(`${POINTER}/allowWrite`, "does not match the readonly flag of the source");
  }
}
