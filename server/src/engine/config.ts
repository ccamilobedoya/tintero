// Views file (D2/D3) and test data file (D4): schemas, limits and loading.
// Errors carry only the JSON Pointer and a reason, never a value from the file (S6).
import { readCapped } from "../tls.ts";
import { isValidTimeZone, validDate, validDateTime } from "./dates.ts";

export class ConfigError extends Error {}

const MAX_VIEWS_BYTES = 65_536;
const MAX_DATA_BYTES = 524_288;

export type BlockName = "task-list" | "issue-list" | "agenda" | "month-calendar";
export type SourceType = "tasks" | "events";

const BLOCK_SOURCE: Record<BlockName, SourceType> = {
  "task-list": "tasks",
  "issue-list": "tasks",
  agenda: "events",
  "month-calendar": "events",
};

export interface Grid {
  columns: number[];
  rows: number[];
  areas: string[][];
}

export interface Slot {
  block: BlockName;
  source: string;
  title?: string;
  options: Record<string, unknown>;
}

export interface ViewDef {
  id: string;
  title: string;
  grid: Grid;
  portrait?: Grid;
  slots: Record<string, Slot>;
  tab?: string[];
}

export interface ViewsConfig {
  version: 1;
  timezone: string;
  theme: "base";
  devices: Record<string, { views: string[] }>;
  views: ViewDef[];
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  category?: string;
  due?: string;
  key?: string;
  status?: string;
  description?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  notes?: string;
}

export type Source =
  | { type: "tasks"; readonly: boolean; items: Task[] }
  | { type: "events"; readonly: boolean; items: CalendarEvent[] };

export interface DataFile {
  version: 1;
  sources: Record<string, Source>;
}

// ---- small validation helpers ----

type Obj = Record<string, unknown>;

const fail = (file: string, pointer: string, reason: string): never => {
  throw new ConfigError(`${file}: ${pointer === "" ? "/" : pointer}: ${reason}`);
};

const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const escapePointer = (key: string): string => key.replaceAll("~", "~0").replaceAll("/", "~1");

class Reader {
  readonly file: string;
  constructor(file: string) {
    this.file = file;
  }

  fail(pointer: string, reason: string): never {
    return fail(this.file, pointer, reason);
  }

  object(value: unknown, pointer: string, known: string[]): Obj {
    if (!isObj(value)) return this.fail(pointer, "must be an object");
    for (const key of Object.keys(value)) {
      if (!known.includes(key)) this.fail(`${pointer}/${escapePointer(key)}`, "unknown field");
    }
    return value;
  }

  array(value: unknown, pointer: string, min: number, max: number): unknown[] {
    if (!Array.isArray(value)) return this.fail(pointer, "must be an array");
    if (value.length < min || value.length > max) {
      this.fail(pointer, `must have ${min} to ${max} elements`);
    }
    return value as unknown[];
  }

  string(value: unknown, pointer: string, min: number, max: number): string {
    if (typeof value !== "string") return this.fail(pointer, "must be a string");
    if (value.length < min || value.length > max) {
      this.fail(pointer, `length must be ${min} to ${max}`);
    }
    return value;
  }

  pattern(value: unknown, pointer: string, regex: RegExp): string {
    if (typeof value !== "string" || !regex.test(value)) {
      return this.fail(pointer, "invalid format");
    }
    return value;
  }

  boolean(value: unknown, pointer: string): boolean {
    if (typeof value !== "boolean") return this.fail(pointer, "must be a boolean");
    return value;
  }

  integer(value: unknown, pointer: string, min: number, max: number): number {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return this.fail(pointer, "must be an integer");
    }
    if (value < min || value > max) this.fail(pointer, `must be ${min} to ${max}`);
    return value;
  }
}

// Own-property read for keys that come from the file (never walks the prototype chain).
const own = (object: Obj, key: string): unknown =>
  Object.hasOwn(object, key) // eslint-disable-next-line security/detect-object-injection -- guarded by hasOwn
    ? object[key]
    : undefined;

const VIEW_ID = /^[a-z0-9_]{1,14}$/;
const DEVICE_ID = /^[a-z0-9-]{1,32}$/;
const AREA_NAME = /^[a-z0-9_]{1,16}$/;
const SOURCE_ID = /^[a-z0-9_]{1,32}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;
const BLOCKS = Object.keys(BLOCK_SOURCE);

function readGrid(r: Reader, value: unknown, pointer: string): Grid {
  const obj = r.object(value, pointer, ["columns", "rows", "areas"]);
  const sizes = (key: "columns" | "rows"): number[] => {
    const list = r.array(own(obj, key), `${pointer}/${key}`, 1, 4);
    const numbers = list.map((entry, i) => {
      const min = list.length === 1 ? 100 : 10;
      const max = list.length === 1 ? 100 : 90;
      return r.integer(entry, `${pointer}/${key}/${i}`, min, max);
    });
    if (numbers.reduce((a, b) => a + b, 0) !== 100)
      r.fail(`${pointer}/${key}`, "must add up to 100");
    return numbers;
  };
  const columns = sizes("columns");
  const rows = sizes("rows");
  const rawAreas = r.array(own(obj, "areas"), `${pointer}/areas`, rows.length, rows.length);
  const areas = rawAreas.map((row, y) => {
    const cells = r.array(row, `${pointer}/areas/${y}`, columns.length, columns.length);
    return cells.map((cell, x) => r.pattern(cell, `${pointer}/areas/${y}/${x}`, AREA_NAME));
  });
  const names = new Set(areas.flat());
  if (names.size > 8) r.fail(`${pointer}/areas`, "at most 8 areas");
  for (const name of names) {
    const cells: [number, number][] = [];
    areas.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === name) cells.push([x, y]);
      });
    });
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs) + 1;
    const height = Math.max(...ys) - Math.min(...ys) + 1;
    if (width * height !== cells.length) r.fail(`${pointer}/areas`, "an area must be a rectangle");
  }
  return { columns, rows, areas };
}

function readSlot(r: Reader, value: unknown, pointer: string): Slot {
  const obj = r.object(value, pointer, ["block", "source", "title", "options"]);
  const block = r.string(own(obj, "block"), `${pointer}/block`, 1, 20);
  if (!BLOCKS.includes(block)) r.fail(`${pointer}/block`, "unknown block");
  const source = r.pattern(own(obj, "source"), `${pointer}/source`, SOURCE_ID);
  const slot: Slot = { block: block as BlockName, source, options: {} };
  if (own(obj, "title") !== undefined) {
    slot.title = r.string(own(obj, "title"), `${pointer}/title`, 1, 40);
  }
  if (own(obj, "options") !== undefined) {
    const known: Record<BlockName, string[]> = {
      "task-list": ["group_by"],
      "issue-list": ["description"],
      agenda: ["days"],
      "month-calendar": [],
    };
    const options = r.object(own(obj, "options"), `${pointer}/options`, known[slot.block]);
    if (own(options, "group_by") !== undefined) {
      const group = own(options, "group_by");
      if (group !== "category" && group !== "none") {
        r.fail(`${pointer}/options/group_by`, "must be category or none");
      }
    }
    if (own(options, "description") !== undefined) {
      r.boolean(own(options, "description"), `${pointer}/options/description`);
    }
    if (own(options, "days") !== undefined) {
      r.integer(own(options, "days"), `${pointer}/options/days`, 1, 14);
    }
    slot.options = { ...options };
  }
  return slot;
}

function readView(r: Reader, value: unknown, pointer: string): ViewDef {
  const obj = r.object(value, pointer, ["id", "title", "grid", "portrait", "slots", "tab"]);
  const id = r.pattern(own(obj, "id"), `${pointer}/id`, VIEW_ID);
  const title = r.string(own(obj, "title"), `${pointer}/title`, 1, 40);
  const grid = readGrid(r, own(obj, "grid"), `${pointer}/grid`);
  const view: ViewDef = { id, title, grid, slots: {} };
  const names = [...new Set(grid.areas.flat())];
  if (own(obj, "portrait") !== undefined) {
    view.portrait = readGrid(r, own(obj, "portrait"), `${pointer}/portrait`);
    const portraitNames = new Set(view.portrait.areas.flat());
    if (portraitNames.size !== names.length || names.some((n) => !portraitNames.has(n))) {
      r.fail(`${pointer}/portrait`, "must use the same area names as grid");
    }
  }
  const slots = r.object(own(obj, "slots"), `${pointer}/slots`, names);
  // fromEntries creates own properties even for a name like `__proto__`.
  view.slots = Object.fromEntries(
    names.map((name) => {
      if (own(slots, name) === undefined) r.fail(`${pointer}/slots/${name}`, "missing slot");
      return [name, readSlot(r, own(slots, name), `${pointer}/slots/${name}`)] as const;
    }),
  );
  if (own(obj, "tab") !== undefined) {
    const list = r.array(own(obj, "tab"), `${pointer}/tab`, 0, 8);
    const tab = list.map((entry, i) => r.pattern(entry, `${pointer}/tab/${i}`, AREA_NAME));
    tab.forEach((name, i) => {
      if (!names.includes(name) || tab.indexOf(name) !== i) {
        r.fail(`${pointer}/tab/${i}`, "unknown or repeated area");
      }
    });
    view.tab = tab;
  }
  return view;
}

function parseJson(file: string, raw: string, max: number): unknown {
  // Size first: an oversized file is never parsed.
  if (Buffer.byteLength(raw, "utf8") > max) throw new ConfigError(`${file}: too large`);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fail(file, "", "invalid JSON");
  }
}

export function parseViewsConfig(raw: string): ViewsConfig {
  const r = new Reader("views");
  const root = r.object(parseJson("views", raw, MAX_VIEWS_BYTES), "", [
    "version",
    "timezone",
    "theme",
    "devices",
    "views",
  ]);
  if (own(root, "version") !== 1) r.fail("/version", "must be 1");
  const timezone = r.string(own(root, "timezone"), "/timezone", 1, 64);
  if (!isValidTimeZone(timezone)) r.fail("/timezone", "unknown time zone");
  if (own(root, "theme") !== "base") r.fail("/theme", 'must be "base"');
  const rawViews = r.array(own(root, "views"), "/views", 1, 32);
  const views = rawViews.map((view, i) => readView(r, view, `/views/${i}`));
  const ids = new Set<string>();
  views.forEach((view, i) => {
    if (ids.has(view.id)) r.fail(`/views/${i}/id`, "repeated id");
    ids.add(view.id);
  });
  const devicesValue = own(root, "devices");
  const rawDevices = r.object(
    devicesValue,
    "/devices",
    isObj(devicesValue) ? Object.keys(devicesValue) : [],
  );
  if (!Object.hasOwn(rawDevices, "*")) r.fail("/devices", 'the "*" entry is required');
  const devices: Record<string, { views: string[] }> = Object.fromEntries(
    Object.keys(rawDevices).map((key) => {
      const pointer = `/devices/${escapePointer(key)}`;
      if (key !== "*" && !DEVICE_ID.test(key)) r.fail(pointer, "invalid device id");
      const entry = r.object(own(rawDevices, key), pointer, ["views"]);
      const list = r.array(own(entry, "views"), `${pointer}/views`, 1, 15);
      const views = list.map((id, i) => {
        const name = r.string(id, `${pointer}/views/${i}`, 1, 14);
        if (!ids.has(name)) r.fail(`${pointer}/views/${i}`, "unknown view");
        return name;
      });
      return [key, { views }] as const;
    }),
  );
  return { version: 1, timezone, theme: "base", devices, views };
}

// ---- data ----

function readTask(r: Reader, value: unknown, pointer: string): Task {
  const obj = r.object(value, pointer, [
    "id",
    "title",
    "done",
    "category",
    "due",
    "key",
    "status",
    "description",
  ]);
  const task: Task = {
    id: r.pattern(own(obj, "id"), `${pointer}/id`, ITEM_ID),
    title: r.string(own(obj, "title"), `${pointer}/title`, 1, 200),
    done: r.boolean(own(obj, "done"), `${pointer}/done`),
  };
  const text = (key: "category" | "key" | "status" | "description", max: number): void => {
    if (own(obj, key) === undefined) return;
    // eslint-disable-next-line security/detect-object-injection -- key is one of four literals
    task[key] = r.string(own(obj, key), `${pointer}/${key}`, 1, max);
  };
  text("category", 40);
  text("key", 24);
  text("status", 24);
  text("description", 1000);
  if (own(obj, "due") !== undefined) {
    const due = r.string(own(obj, "due"), `${pointer}/due`, 10, 10);
    if (!validDate(due)) r.fail(`${pointer}/due`, "must be YYYY-MM-DD");
    task.due = due;
  }
  return task;
}

const instant = (text: string): number =>
  Date.parse(text.length === 10 ? `${text}T00:00:00Z` : text);

function readEvent(r: Reader, value: unknown, pointer: string): CalendarEvent {
  const obj = r.object(value, pointer, ["id", "title", "start", "end", "location", "notes"]);
  const when = (key: "start" | "end"): string => {
    const text = r.string(own(obj, key), `${pointer}/${key}`, 10, 40);
    if (!validDate(text) && !validDateTime(text)) r.fail(`${pointer}/${key}`, "invalid date");
    return text;
  };
  const event: CalendarEvent = {
    id: r.pattern(own(obj, "id"), `${pointer}/id`, ITEM_ID),
    title: r.string(own(obj, "title"), `${pointer}/title`, 1, 200),
    start: when("start"),
  };
  if (own(obj, "end") !== undefined) {
    event.end = when("end");
    if (instant(event.end) < instant(event.start)) r.fail(`${pointer}/end`, "before start");
  }
  if (own(obj, "location") !== undefined) {
    event.location = r.string(own(obj, "location"), `${pointer}/location`, 1, 100);
  }
  if (own(obj, "notes") !== undefined) {
    event.notes = r.string(own(obj, "notes"), `${pointer}/notes`, 1, 1000);
  }
  return event;
}

/** Items of a source, validated for its type. Throws ConfigError (file label `items`). */
export function parseItems(
  file: string,
  type: SourceType,
  items: unknown,
  pointer: string,
): Task[] | CalendarEvent[] {
  const r = new Reader(file);
  const list = r.array(items, pointer, 0, 500);
  const seen = new Set<string>();
  const check = (id: string, at: string): void => {
    if (seen.has(id)) r.fail(`${at}/id`, "repeated id");
    seen.add(id);
  };
  if (type === "tasks") {
    return list.map((item, i) => {
      const task = readTask(r, item, `${pointer}/${i}`);
      check(task.id, `${pointer}/${i}`);
      return task;
    });
  }
  return list.map((item, i) => {
    const event = readEvent(r, item, `${pointer}/${i}`);
    check(event.id, `${pointer}/${i}`);
    return event;
  });
}

export function parseDataFile(raw: string, config: ViewsConfig): DataFile {
  const r = new Reader("data");
  const root = r.object(parseJson("data", raw, MAX_DATA_BYTES), "", ["version", "sources"]);
  if (own(root, "version") !== 1) r.fail("/version", "must be 1");
  const rawSources = own(root, "sources");
  if (!isObj(rawSources)) r.fail("/sources", "must be an object");
  const keys = Object.keys(rawSources as Obj);
  if (keys.length < 1 || keys.length > 16) r.fail("/sources", "must have 1 to 16 sources");
  // fromEntries creates own properties even for an id like `__proto__`.
  const sources: Record<string, Source> = Object.fromEntries(
    keys.map((key) => {
      const pointer = `/sources/${escapePointer(key)}`;
      if (!SOURCE_ID.test(key)) r.fail(pointer, "invalid source id");
      const obj = r.object(own(rawSources as Obj, key), pointer, ["type", "readonly", "items"]);
      const type = own(obj, "type");
      if (type !== "tasks" && type !== "events") {
        r.fail(`${pointer}/type`, "must be tasks or events");
      }
      const readonly =
        own(obj, "readonly") === undefined
          ? false
          : r.boolean(own(obj, "readonly"), `${pointer}/readonly`);
      const items = parseItems("data", type as SourceType, own(obj, "items"), `${pointer}/items`);
      return [key, { type, readonly, items } as Source] as const;
    }),
  );
  config.views.forEach((view, v) => {
    for (const [area, slot] of Object.entries(view.slots)) {
      const source = Object.hasOwn(sources, slot.source) ? sources[slot.source] : undefined;
      const pointer = `/views/${v}/slots/${area}/source`;
      if (!source) r.fail(pointer, "source not found in the data file");
      if (source?.type !== BLOCK_SOURCE[slot.block]) r.fail(pointer, "source has another type");
    }
  });
  return { version: 1, sources };
}

export function loadViewsConfig(path: string): ViewsConfig {
  return parseViewsConfig(readText("views", path, MAX_VIEWS_BYTES));
}

export function loadDataFile(path: string, config: ViewsConfig): DataFile {
  return parseDataFile(readText("data", path, MAX_DATA_BYTES), config);
}

function readText(file: string, path: string, max: number): string {
  try {
    return readCapped(path, max).toString("utf8");
  } catch (error) {
    // The system error carries the path; only a fixed reason is reported.
    const big = error instanceof Error && error.message === "file too large";
    throw new ConfigError(`${file}: ${big ? "too large" : "cannot be read"}`, { cause: error });
  }
}
