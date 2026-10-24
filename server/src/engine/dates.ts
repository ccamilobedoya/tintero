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

const STALE_AFTER_MS = 5 * 60 * 1000;

/** `sin datos desde HH:MM` (local time of the last good read) when it is over 5 min old. */
export function staleLabel(
  readAt: Date | undefined,
  now: Date,
  timeZone: string,
): string | undefined {
  if (readAt === undefined || now.getTime() - readAt.getTime() <= STALE_AFTER_MS) return undefined;
  const local = localParts(readAt, timeZone);
  return `sin datos desde ${hhmm(local.hour * 60 + local.minute)}`;
}

export const daysInMonth = (y: number, m: number): number =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();
