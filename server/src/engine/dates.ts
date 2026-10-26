// Local dates in a IANA zone, with fixed Spanish names (no relative texts, 24 h).
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
export const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;
export const MONTHS_LONG = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

export interface DayParts {
  y: number;
  m: number; // 1-12
  d: number;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
// eslint-disable-next-line security/detect-unsafe-regex -- anchored, fixed-width parts and one bounded optional group; the text is capped by the callers
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let found = formatters.get(timeZone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatters.set(timeZone, found);
  }
  return found;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in the zone. */
export function localParts(
  at: Date,
  timeZone: string,
): { day: DayParts; hour: number; minute: number } {
  const out: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(at)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    day: { y: out.year ?? 1970, m: out.month ?? 1, d: out.day ?? 1 },
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
  };
}

const pad = (value: number, size = 2): string => String(value).padStart(size, "0");

export const dayKey = (day: DayParts): string => `${pad(day.y, 4)}-${pad(day.m)}-${pad(day.d)}`;

export function validDate(text: string): boolean {
  const match = DATE_ONLY.exec(text);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function validDateTime(text: string): boolean {
  return DATE_TIME.test(text) && validDate(text.slice(0, 10)) && !Number.isNaN(Date.parse(text));
}

function parseDay(text: string): DayParts {
  const match = DATE_ONLY.exec(text.slice(0, 10));
  return { y: Number(match?.[1]), m: Number(match?.[2]), d: Number(match?.[3]) };
}

/** Adds days to a calendar day (zone-free arithmetic). */
export function addDays(day: DayParts, days: number): DayParts {
  const date = new Date(Date.UTC(day.y, day.m - 1, day.d + days));
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

export const weekday = (day: DayParts): number =>
  new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();

export interface EventTime {
  day: DayParts;
  allDay: boolean;
  /** Minutes since local midnight; undefined for all-day events. */
  minutes?: number;
}

/** Where an event starts, in the zone: all-day events keep their own date. */
export function eventStart(start: string, timeZone: string): EventTime {
  if (DATE_ONLY.test(start)) return { day: parseDay(start), allDay: true };
  const local = localParts(new Date(start), timeZone);
  return { day: local.day, allDay: false, minutes: local.hour * 60 + local.minute };
}

export const hhmm = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** `vie 23 oct` */
export const shortDate = (day: DayParts): string =>
  `${WEEKDAYS[weekday(day)] ?? ""} ${day.d} ${MONTHS[day.m - 1] ?? ""}`;

/** `VIE 23 OCT` */
export const upperDate = (day: DayParts): string => shortDate(day).toUpperCase();

/** `Hoy`, `Mañana` (today + 1) or `Mié 28`. */
export function dayLabel(day: DayParts, today: DayParts): string {
  const key = dayKey(day);
  if (key === dayKey(today)) return "Hoy";
  if (key === dayKey(addDays(today, 1))) return "Mañana";
  const name = WEEKDAYS[weekday(day)] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${day.d}`;
}

const STALE_AFTER_MS = 5 * 60 * 1000;

/** `sin datos desde HH:MM` (local time of the last good read) when it is over 5 min old. */
export function staleLabel(
  readAt: Date | undefined,
  now: Date,
  timeZone: string,
): string | undefined {
  if (readAt === undefined || now.getTime() - readAt.getTime() <= STALE_AFTER_MS) return undefined;
  const local = localParts(readAt, timeZone);
  const time = hhmm(local.hour * 60 + local.minute);
  const today = localParts(now, timeZone).day;
  if (dayKey(local.day) === dayKey(today)) return `sin datos desde ${time}`;
  return `sin datos desde ${pad(local.day.d)}/${pad(local.day.m)} ${time}`;
}

export const daysInMonth = (y: number, m: number): number =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

const MAX_EVENT_DAYS = 62;

/**
 * Every local day an event covers (R2): all-day events end the day before `end` (exclusive, as in
 * iCalendar); timed events do not count the day of an `end` at exactly 00:00. At most 62 days.
 */
export function eventDays(start: string, end: string | undefined, timeZone: string): DayParts[] {
  const { first, last } = eventSpan(start, end, timeZone);
  if (dayKey(last) <= dayKey(first)) return [first];
  const days: DayParts[] = [];
  for (let day = first; days.length < MAX_EVENT_DAYS && dayKey(day) <= dayKey(last);) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

/** First and last local day of an event, without the 62-day cap (`last` >= `first`). */
export function eventSpan(
  start: string,
  end: string | undefined,
  timeZone: string,
): { first: DayParts; last: DayParts } {
  const first = eventStart(start, timeZone).day;
  if (end === undefined) return { first, last: first };
  let last: DayParts;
  if (DATE_ONLY.test(end)) {
    last = addDays(parseDay(end), -1);
  } else {
    const stop = new Date(end);
    if (!DATE_ONLY.test(start) && stop.getTime() < new Date(start).getTime()) {
      return { first, last: first };
    }
    const local = localParts(stop, timeZone);
    const atMidnight = local.hour === 0 && local.minute === 0 && stop.getUTCSeconds() === 0;
    last = atMidnight ? addDays(local.day, -1) : local.day;
  }
  return dayKey(last) < dayKey(first) ? { first, last: first } : { first, last };
}
