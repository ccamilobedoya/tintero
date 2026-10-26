// Fixed texts the engine draws, one catalog per language (F-018, D3). The catalog is chosen once,
// when the views file is loaded; every catalog has exactly the same keys.
import { en } from "./en.ts";
import { es } from "./es.ts";

export type Locale = "es" | "en";

export interface Messages {
  /** Sunday first, as `Date#getUTCDay`. */
  weekdays: readonly string[];
  months: readonly string[];
  monthsLong: readonly string[];
  today: string;
  tomorrow: string;
  /** `{time}` is `HH:MM`. */
  staleToday: string;
  /** `{date}` is `DD/MM`, `{time}` is `HH:MM`. */
  staleOther: string;
  holidayToday: string;
  /** `{date}` is the upper-case short date, e.g. `MON 2 NOV`. */
  holidayOn: string;
  allDay: string;
  /** Appended to a date in the detail view. */
  allDaySuffix: string;
  noCategory: string;
  stageDoing: string;
  stageTodo: string;
  stageDone: string;
  emptyDoing: string;
  emptyTodo: string;
  emptyDone: string;
  /** `{n}` is the number of hidden rows. */
  more: string;
  noFit: string;
  notAvailable: string;
  detail: string;
  calibrationSample: string;
  calibrationNormal: string;
  calibrationBold: string;
  calibrationStrike: string;
  calibrationFocus: string;
  calibrationSending: string;
}

export function isLocale(value: unknown): value is Locale {
  return value === "es" || value === "en";
}

export function messages(locale: Locale): Messages {
  return locale === "en" ? en : es;
}

/** Fills `{name}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  const known = new Map(Object.entries(values));
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = known.get(name);
    return value === undefined ? whole : String(value);
  });
}
