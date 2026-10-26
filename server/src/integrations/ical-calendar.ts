// The owner's calendars by iCalendar address (F-014, ADR-0053, ADR-0054): 1 to 10 calendars read
// every 4 min, expanded inside a window and joined into one `events` source. The address is a
// secret: it never reaches a log, an error, the state file or the engine; a calendar is its `id`.
import { createHash } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import ICAL from "ical.js";
import { parseItems, type CalendarEvent, type Icon } from "../engine/config.ts";
import {
  addDays,
  dayKey,
  eventSpan,
  localParts,
  validDateTime,
  type DayParts,
} from "../engine/dates.ts";
import type { Engine } from "../engine/engine.ts";
import { readCapped } from "../tls.ts";
import { IntegrationHttpError, type GuardedHttp } from "./http.ts";
import { icalManifest } from "./manifest.ts";

type Log = (line: Record<string, unknown>) => void;

const INTEGRATION = "ical-calendario";
/** Limits the guarded client of every calendar must be built with (R3). */
export const ICAL_HTTP_LIMITS = { maxBytes: 8_388_608, timeoutMs: 15_000 } as const;
const MAX_VEVENTS = 20_000;
const MAX_REPETITIONS = 2000; // repetitions inside the window, per calendar
const MAX_STEPS = 100_000; // iterator steps, also those before the window
const MAX_TITLE = 200;
const MAX_STATE_BYTES = 4_194_304;
const SOURCE_LIMIT = 500;
const CHUNK = 500; // `parseItems` takes up to 500 items at once

export class CalendarParseError extends Error {
  readonly code: "too-many" | "bad-ical";
  constructor(code: "too-many" | "bad-ical") {
    super(code);
    this.code = code;
  }
}

export interface CalendarWindow {
  from: DayParts;
  to: DayParts;
}

const pad = (value: number, size = 2): string => String(value).padStart(size, "0");

/** The UTC instant of a wall-clock time in a zone (two corrections cover the offset changes). */
function wallToInstant(
  parts: { y: number; m: number; d: number; h: number; mi: number; s: number },
  timeZone: string,
): number {
  const target = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h, parts.mi, parts.s);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const local = localParts(new Date(guess), timeZone);
    const shown = Date.UTC(local.day.y, local.day.m - 1, local.day.d, local.hour, local.minute, 0);
    guess -= shown - (target - parts.s * 1000);
  }
  return guess;
}

const isoZ = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

interface Point {
  allDay: boolean;
  /** `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SSZ`. */
  text: string;
  /** Day number for all-day points, epoch ms for the rest (only compared with its own kind). */
  value: number;
}

function point(time: ICAL.Time, fallbackZone: string): Point {
  if (time.isDate) {
    const text = `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}`;
    return { allDay: true, text, value: Date.UTC(time.year, time.month - 1, time.day) };
  }
  const floating = time.zone === ICAL.Timezone.localTimezone || time.zone.tzid === "floating";
  const ms = floating
    ? wallToInstant(
        {
          y: time.year,
          m: time.month,
          d: time.day,
          h: time.hour,
          mi: time.minute,
          s: time.second,
        },
        fallbackZone,
      )
    : time.toJSDate().getTime();
  return { allDay: false, text: isoZ(ms), value: ms };
}

function countVevents(text: string): number {
  const line = /^BEGIN:VEVENT[ \t]*\r?$/gim;
  let count = 0;
  while (line.exec(text) !== null) {
    count++;
    if (count > MAX_VEVENTS) break;
  }
  return count;
}

const cleanTitle = (summary: unknown): string => {
  const text = typeof summary === "string" ? summary.replace(/\s+/g, " ").trim() : "";
  return text === "" ? "(sin título)" : Array.from(text).slice(0, MAX_TITLE).join("");
};

/**
 * R3 to R5: the events of one iCalendar text that cross the window. The text is already capped by
 * the caller; `VEVENT` lines are counted before `ical.js` sees it. Throws `CalendarParseError`.
 */
export function parseCalendar(
  text: string,
  calendar: { id: string; icon: Icon },
  window: CalendarWindow,
  timeZone: string,
): { events: CalendarEvent[]; truncated: number } {
  if (countVevents(text) > MAX_VEVENTS) throw new CalendarParseError("too-many");

  let root: ICAL.Component;
  try {
    const jcal = ICAL.parse(text) as unknown;
    if (!Array.isArray(jcal) || jcal[0] !== "vcalendar") throw new Error("not a calendar");
    root = new ICAL.Component(jcal as unknown[]);
  } catch {
    throw new CalendarParseError("bad-ical");
  }

  const fromKey = dayKey(window.from);
  const toKey = dayKey(addDays(window.to, 1));
  const fromMs = wallToInstant({ ...ymd(window.from), h: 0, mi: 0, s: 0 }, timeZone);
  const toMs = wallToInstant({ ...ymd(addDays(window.to, 1)), h: 0, mi: 0, s: 0 }, timeZone);
  const crosses = (start: Point, end: Point | undefined): boolean => {
    if (start.allDay) {
      const endKey = end?.allDay
        ? end.text
        : dayKey(addDays(dayParts(start.text), 1)); /* a day long */
      return start.text < toKey && endKey > fromKey;
    }
    const endMs = end === undefined || end.allDay ? start.value : end.value;
    return start.value < toMs && (endMs > fromMs || start.value >= fromMs);
  };

  const zones = new Map<string, boolean>();
  const tzComponents = root.getAllSubcomponents("vtimezone");
  const events: CalendarEvent[] = [];
  const seen = new Set<string>();
  let truncated = 0;
  let expanded = 0;
  let steps = 0;

  const emit = (
    uid: string,
    item: ICAL.Event,
    master: ICAL.Event,
    startTime: ICAL.Time,
    endTime: ICAL.Time,
    fallbackZone: string,
  ): void => {
    if (statusOf(item) === "CANCELLED") return;
    const start = point(startTime, fallbackZone);
    const hasEnd = hasEndOf(item) || hasEndOf(master);
    let end = hasEnd ? point(endTime, fallbackZone) : undefined;
    if (!crosses(start, end)) return;
    if (end !== undefined && (end.allDay !== start.allDay || end.value < start.value)) {
      end = undefined;
    }
    const id = `${calendar.id}-${createHash("sha256")
      .update(`${uid}|${start.text}`)
      .digest("hex")
      .slice(0, 12)}`;
    if (seen.has(id)) return;
    seen.add(id);
    events.push({
      id,
      title: cleanTitle(item.summary),
      start: start.text,
      ...(end === undefined ? {} : { end: end.text }),
      icon: calendar.icon,
      calendar: calendar.id,
    });
  };

  // Registered only while this text is read; `ical.js` keeps the table global.
  ICAL.TimezoneService.reset();
  try {
    for (const zone of tzComponents) {
      try {
        ICAL.TimezoneService.register(zone);
      } catch {
        // a broken VTIMEZONE: its events fall back to the zone of the display
      }
    }
    const masters = new Map<string, ICAL.Event>();
    const exceptions: ICAL.Event[] = [];
    const singles: ICAL.Event[] = [];
    for (const component of root.getAllSubcomponents("vevent")) {
      try {
        // `exceptions: []` stops ical.js from scanning (and relating) every event of the calendar
        // for each one: that scan is quadratic and ignores the UID. Exceptions are related below.
        const item = new ICAL.Event(component, { exceptions: [], strictExceptions: true });
        if (!item.uid) continue;
        if (component.hasProperty("recurrence-id")) exceptions.push(item);
        else if (!masters.has(item.uid)) masters.set(item.uid, item);
      } catch {
        // an event that cannot be read is left out; the others go on
      }
    }
    for (const exception of exceptions) {
      const master = masters.get(exception.uid);
      if (master === undefined) singles.push(exception);
      else
        try {
          master.relateException(exception);
        } catch {
          // left out
        }
    }

    const zoneOf = (item: ICAL.Event): string => {
      const tzid = item.component.getFirstProperty("dtstart")?.getParameter("tzid");
      if (typeof tzid !== "string") return timeZone;
      const known = zones.get(tzid) ?? isIana(tzid);
      zones.set(tzid, known);
      return known ? tzid : timeZone;
    };

    for (const item of [...masters.values(), ...singles]) {
      try {
        if (!item.isRecurring() || item.isRecurrenceException()) {
          if (statusOf(item) === "CANCELLED") continue;
          emit(item.uid, item, item, item.startDate, item.endDate, zoneOf(item));
          continue;
        }
        if (statusOf(item) === "CANCELLED") continue;
        const fallback = zoneOf(item);
        const iterator = item.iterator();
        const noExceptions = Object.keys(item.exceptions).length === 0;
        const durationSeconds = Math.max(0, Math.abs(item.duration.toSeconds()));
        const skipMs = durationSeconds * 1000 + 2 * 86_400_000;
        const skipDays = Math.ceil(durationSeconds / 86_400) + 2;
        for (;;) {
          if (expanded >= MAX_REPETITIONS || steps >= MAX_STEPS) {
            truncated++;
            break;
          }
          const next = iterator.next() as ICAL.Time | null; // the types miss the end: it gives null
          if (!next) break;
          steps++;
          const origin = point(next, fallback);
          if (origin.allDay ? origin.text >= toKey : origin.value >= toMs) break;
          // Far before the window and no moved occurrences: skip the costly details.
          if (
            noExceptions &&
            (origin.allDay ? origin.text : origin.value) <
              (origin.allDay ? dayKey(addDays(window.from, -skipDays)) : fromMs - skipMs)
          )
            continue;
          const details = item.getOccurrenceDetails(next) as unknown as {
            item: ICAL.Event;
            startDate: ICAL.Time;
            endDate: ICAL.Time;
          };
          const before = events.length;
          emit(item.uid, details.item, item, details.startDate, details.endDate, fallback);
          if (events.length > before) expanded++;
        }
      } catch {
        // a recurrence that cannot be expanded is left out; the others go on
      }
    }
  } finally {
    ICAL.TimezoneService.reset();
  }

  events.sort(byStart);
  return { events, truncated };
}

const byStart = (a: CalendarEvent, b: CalendarEvent): number =>
  a.start < b.start ? -1 : a.start > b.start ? 1 : 0;

function ymd(day: DayParts): { y: number; m: number; d: number } {
  return { y: day.y, m: day.m, d: day.d };
}

function dayParts(text: string): DayParts {
  return { y: Number(text.slice(0, 4)), m: Number(text.slice(5, 7)), d: Number(text.slice(8, 10)) };
}

function isIana(tzid: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tzid });
    return true;
  } catch {
    return false;
  }
}

function statusOf(item: ICAL.Event): string {
  const status = item.component.getFirstPropertyValue("status");
  return typeof status === "string" ? status.toUpperCase() : "";
}

const hasEndOf = (item: ICAL.Event): boolean =>
  item.component.hasProperty("dtend") || item.component.hasProperty("duration");

const dayNumber = (day: DayParts): number => Date.UTC(day.y, day.m - 1, day.d) / 86_400_000;

/** R6: one list by `start`; over the limit, the ones nearest to today stay. */
export function mergeCalendars(
  lists: CalendarEvent[][],
  today: DayParts,
  timeZone: string,
  limit = SOURCE_LIMIT,
): { events: CalendarEvent[]; dropped: number } {
  const all = lists.flat().sort(byStart);
  if (all.length <= limit) return { events: all, dropped: 0 };
  const todayKey = dayKey(today);
  const todayNumber = dayNumber(today);
  const ranked = all.map((event) => {
    const { first, last } = eventSpan(event.start, event.end, timeZone);
    const covers = dayKey(first) <= todayKey && todayKey <= dayKey(last);
    return { event, distance: covers ? 0 : Math.abs(dayNumber(first) - todayNumber) };
  });
  const kept = ranked
    .slice()
    .sort((a, b) => a.distance - b.distance || byStart(a.event, b.event))
    .slice(0, limit)
    .map((entry) => entry.event)
    .sort(byStart);
  return { events: kept, dropped: all.length - kept.length };
}

/** From the first of this month minus 7 days to today + 62 days (R4). */
export function calendarWindow(today: DayParts): CalendarWindow {
  return {
    from: addDays({ y: today.y, m: today.m, d: 1 }, -7),
    to: addDays(today, 62),
  };
}

// ---- saved state (R8) ----

interface Saved {
  readAt: Date;
  events: CalendarEvent[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Never throws: a missing, big, broken or foreign file gives nothing for that part (ADR-0044). */
function loadState(
  file: string | undefined,
  calendars: { id: string; icon: Icon }[],
): Map<string, Saved> {
  const out = new Map<string, Saved>();
  if (file === undefined) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readCapped(file, MAX_STATE_BYTES).toString("utf8"));
  } catch {
    return out;
  }
  if (!isObj(parsed) || parsed.version !== 1 || !isObj(parsed.calendars)) return out;
  const saved = parsed.calendars;
  for (const calendar of calendars) {
    const entry = Object.hasOwn(saved, calendar.id) ? saved[calendar.id] : undefined;
    if (!isObj(entry) || typeof entry.readAt !== "string" || !validDateTime(entry.readAt)) continue;
    if (!Array.isArray(entry.events)) continue;
    try {
      const events: CalendarEvent[] = [];
      for (let at = 0; at < entry.events.length; at += CHUNK) {
        const part = parseItems("state", "events", entry.events.slice(at, at + CHUNK), "");
        for (const event of part as CalendarEvent[]) {
          events.push({ ...event, icon: calendar.icon, calendar: calendar.id });
        }
      }
      out.set(calendar.id, { readAt: new Date(entry.readAt), events });
    } catch {
      // a damaged part is ignored; the others stay
    }
  }
  return out;
}

/** Atomic: temporary file (600) + fsync + rename. Throws if it cannot. */
async function saveState(file: string, text: string): Promise<void> {
  const temp = `${file}.tmp-${process.pid}`;
  try {
    /* eslint-disable security/detect-non-literal-fs-filename -- path from the owner's configuration */
    await rm(temp, { force: true });
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.chmod(0o600);
      await handle.writeFile(text, "utf8");
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

export interface IcalCalendars {
  start(): void;
  cycle(): Promise<void>;
  idle(): Promise<void>;
  stop(): Promise<void>;
}

export function createIcalCalendars(options: {
  calendars: { id: string; icon: Icon; http: GuardedHttp; path: string }[];
  source: string;
  engine: Pick<Engine, "setSource">;
  timeZone: string;
  stateFile?: string;
  clock?: () => Date;
  log?: Log;
}): IcalCalendars {
  const { calendars, source, engine, timeZone, stateFile } = options;
  const clock = options.clock ?? ((): Date => new Date());
  const rawLog = options.log ?? ((): void => undefined);
  const log: Log = (line) => {
    rawLog({ ts: clock().toISOString(), integration: INTEGRATION, ...line });
  };

  const good = loadState(stateFile, calendars);
  const flags = { stopped: false };
  let timer: NodeJS.Timeout | undefined;

  function deliver(): void {
    if (good.size === 0) return;
    const today = localParts(clock(), timeZone).day;
    const lists = calendars.flatMap((c) => good.get(c.id)?.events ?? []);
    const merged = mergeCalendars([lists], today, timeZone);
    const readAt = new Date(Math.min(...[...good.values()].map((s) => s.readAt.getTime())));
    if (merged.dropped > 0) log({ event: "truncated", items: merged.dropped });
    const result = engine.setSource(source, merged.events, { readAt });
    if (!result.ok) log({ event: "error", code: "set-source" });
  }

  let saving: Promise<void> = Promise.resolve();
  function persist(): void {
    if (stateFile === undefined) return;
    const body = {
      version: 1,
      calendars: Object.fromEntries(
        [...good].map(([id, saved]) => [
          id,
          { readAt: saved.readAt.toISOString(), events: saved.events },
        ]),
      ),
    };
    const text = JSON.stringify(body);
    if (Buffer.byteLength(text, "utf8") > MAX_STATE_BYTES) return; // it must load back under its cap
    saving = saving
      .then(() => saveState(stateFile, text))
      .catch(() => {
        log({ event: "error", code: "state-write" });
      });
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

  async function readOne(calendar: (typeof calendars)[number], now: Date): Promise<boolean> {
    try {
      const answer = await calendar.http.requestText(calendar.path);
      if (answer.status !== 200) throw new IntegrationHttpError("status", answer.status);
      const window = calendarWindow(localParts(now, timeZone).day);
      const parsed = parseCalendar(answer.text, calendar, window, timeZone);
      if (flags.stopped) return false;
      good.set(calendar.id, { readAt: now, events: parsed.events });
      log({ event: "read", calendar: calendar.id, items: parsed.events.length });
      if (parsed.truncated > 0) {
        log({ event: "truncated", calendar: calendar.id, items: parsed.truncated });
      }
      return true;
    } catch (error) {
      if (flags.stopped) return false;
      const code =
        error instanceof IntegrationHttpError || error instanceof CalendarParseError
          ? error.code
          : "error";
      log({ event: "error", calendar: calendar.id, code });
      return false;
    }
  }

  async function runCycle(): Promise<void> {
    let changed = false;
    for (const calendar of calendars) {
      if (flags.stopped) return;
      if (await readOne(calendar, clock())) changed = true;
    }
    if (flags.stopped) return;
    if (changed) persist();
    // Delivered every cycle: the window of "today" moves and `readAt` must say who is behind.
    deliver();
  }

  const schedule = (): void => {
    if (flags.stopped) return;
    enqueue(runCycle)
      .then(() => {
        if (flags.stopped) return;
        timer = setTimeout(schedule, icalManifest.pollS * 1000);
        timer.unref();
      })
      .catch(() => undefined);
  };

  return {
    start() {
      for (const [id, saved] of good) {
        log({ event: "state", calendar: id, items: saved.events.length });
      }
      deliver();
      schedule();
    },
    cycle: () => enqueue(runCycle),
    async idle() {
      for (;;) {
        while (active > 0) await tail;
        await saving;
        if (active === 0) return;
      }
    },
    async stop() {
      flags.stopped = true;
      if (timer) clearTimeout(timer);
      while (active > 0) await tail;
      await saving;
    },
  };
}
