// Integrations file (F-009): schema, limits and loading. Errors carry the JSON pointer and a reason,
// never a value from the file (S6).
import { closeSync, fstatSync, openSync } from "node:fs";
import { isAbsolute } from "node:path";
import { ConfigError, ICONS, type DataFile, type Icon, type Stage } from "../engine/config.ts";
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

export interface IcalIntegrationConfig {
  source: string;
  /** Absolute path of the file with the calendars (private, mode 600: it holds secret addresses). */
  calendarsFile: string;
  stateFile?: string;
}

export interface IntegrationsFile {
  version: 1;
  integrations: {
    "trilium-tareas"?: TriliumTasksConfig;
    festivos?: HolidaysIntegrationConfig;
    "ical-calendario"?: IcalIntegrationConfig;
  };
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
  const list = object(own(root, "integrations"), "/integrations", [
    "trilium-tareas",
    "festivos",
    "ical-calendario",
  ]);
  const tasks = own(list, "trilium-tareas");
  const holidays = own(list, "festivos");
  const ical = own(list, "ical-calendario");
  return {
    version: 1,
    integrations: {
      ...(tasks === undefined ? {} : { "trilium-tareas": parseTasks(tasks) }),
      ...(holidays === undefined ? {} : { festivos: parseHolidays(holidays) }),
      ...(ical === undefined ? {} : { "ical-calendario": parseIcal(ical) }),
    },
  };
}

function parseIcal(value: unknown): IcalIntegrationConfig {
  const p = "/integrations/ical-calendario";
  const obj = object(value, p, ["source", "calendarsFile", "stateFile"]);
  const source = text(own(obj, "source"), `${p}/source`, 1, 64);
  const calendarsFile = text(own(obj, "calendarsFile"), `${p}/calendarsFile`, 1, 4096);
  if (!isAbsolute(calendarsFile)) fail(`${p}/calendarsFile`, "must be an absolute path");
  const result: IcalIntegrationConfig = { source, calendarsFile };
  if (own(obj, "stateFile") !== undefined) {
    const stateFile = text(own(obj, "stateFile"), `${p}/stateFile`, 1, 4096);
    if (!isAbsolute(stateFile)) fail(`${p}/stateFile`, "must be an absolute path");
    result.stateFile = stateFile;
  }
  return result;
}

// ---- the calendars file (F-014): a private list of calendar addresses ----

const MAX_CALENDARS_BYTES = 32_768;
const CALENDAR_ID = /^[a-z0-9-]{1,32}$/;

export interface CalendarSpec {
  id: string;
  icon: Icon;
  /** Already `https://`, without user, query or fragment. */
  url: string;
}

const calendarsFail = (pointer: string, reason: string): never => {
  throw new ConfigError(`calendars: ${pointer === "" ? "/" : pointer}: ${reason}`);
};

/**
 * Reads and checks the calendars file. It is treated like a key: mode 600 or `key-permissions`.
 * Errors carry the position of the calendar, never a value (the addresses are secrets).
 */
export function loadCalendars(file: string): CalendarSpec[] {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the owner's configuration
    const fd = openSync(file, "r");
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) throw new IntegrationHttpError("key-missing");
      if ((stat.mode & 0o077) !== 0) throw new IntegrationHttpError("key-permissions");
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    if (error instanceof IntegrationHttpError) throw error;
    throw new IntegrationHttpError("key-missing");
  }
  let raw: string;
  try {
    raw = readCapped(file, MAX_CALENDARS_BYTES).toString("utf8");
  } catch (error) {
    const big = error instanceof Error && error.message === "file too large";
    throw new ConfigError(`calendars: /: ${big ? "file too large" : "cannot be read"}`, {
      cause: error,
    });
  }
  return parseCalendars(raw);
}

export function parseCalendars(raw: string): CalendarSpec[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return calendarsFail("", "not valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 10) {
    return calendarsFail("", "must be a list of 1 to 10 calendars");
  }
  const seen = new Set<string>();
  return (parsed as unknown[]).map((entry, index) => {
    const at = `/${index}`;
    if (!isObj(entry)) return calendarsFail(at, "must be an object");
    for (const key of Object.keys(entry)) {
      if (!["id", "icon", "url"].includes(key)) {
        calendarsFail(`${at}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`, "unknown field");
      }
    }
    const id = own(entry, "id");
    if (typeof id !== "string" || !CALENDAR_ID.test(id)) {
      calendarsFail(`${at}/id`, "must be 1 to 32 lowercase letters, digits or -");
    }
    if (seen.has(id as string)) calendarsFail(`${at}/id`, "repeated id");
    seen.add(id as string);
    const icon = own(entry, "icon");
    if (typeof icon !== "string" || !(ICONS as readonly string[]).includes(icon)) {
      calendarsFail(`${at}/icon`, "must be one of the known pictograms");
    }
    const url = own(entry, "url");
    if (typeof url !== "string" || url.length < 1 || url.length > 2048) {
      calendarsFail(`${at}/url`, "must be text of 1 to 2048 characters");
    }
    return { id: id as string, icon: icon as Icon, url: httpsUrl(url as string, `${at}/url`) };
  });
}

function httpsUrl(text: string, pointer: string): string {
  const fixed = /^webcal:\/\//i.test(text) ? `https://${text.slice("webcal://".length)}` : text;
  try {
    if (parseBase(fixed).protocol === "https:") return fixed;
  } catch (error) {
    if (!(error instanceof IntegrationHttpError)) throw error;
  }
  return calendarsFail(pointer, "must be https:// or webcal://");
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
  const ical = file.integrations["ical-calendario"];
  if (ical !== undefined) {
    const events = Object.hasOwn(data.sources, ical.source) ? data.sources[ical.source] : undefined;
    if (events?.type !== "events") {
      fail("/integrations/ical-calendario/source", "must be a source of type events");
    }
  }
  const tasks = file.integrations["trilium-tareas"];
  if (tasks === undefined) return;
  const source = Object.hasOwn(data.sources, tasks.source) ? data.sources[tasks.source] : undefined;
  if (source?.type !== "tasks") fail(`${POINTER}/source`, "must be a source of type tasks");
  if (source?.readonly === tasks.allowWrite) {
    fail(`${POINTER}/allowWrite`, "does not match the readonly flag of the source");
  }
}
