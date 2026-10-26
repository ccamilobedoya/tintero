// Public holidays of the month calendar (F-013, ADR-0051, ADR-0052): corrections and the next one.
import { addDays, dayKey, upperDate, validDate, type DayParts } from "./dates.ts";
import { fill, messages, type Messages } from "./i18n/index.ts";

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

/** The list plus `add` (the name of `add` wins on a repeated date) minus `remove`, sorted by date. */
export function applyCorrections(list: Holiday[], add: Holiday[], remove: string[]): Holiday[] {
  const byDate = new Map<string, string>();
  for (const item of [...list, ...add]) byDate.set(item.date, item.name);
  for (const date of remove) byDate.delete(date);
  return [...byDate]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function parse(date: string): DayParts | undefined {
  if (!validDate(date)) return undefined;
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
}

/** The first holiday from `today` (included) to `withinDays` days later (included). */
export function nextHoliday(
  list: Holiday[],
  today: DayParts,
  withinDays = 366,
): Holiday | undefined {
  const from = dayKey(today);
  const until = dayKey(addDays(today, withinDays));
  let best: Holiday | undefined;
  for (const item of list) {
    if (item.date < from || item.date > until) continue;
    if (best === undefined || item.date < best.date) best = item;
  }
  return best;
}

/** `HOY FESTIVO`, `FESTIVO LUN 2 NOV` (or the catalog's), or nothing. */
export function holidayLabel(
  list: Holiday[],
  today: DayParts,
  msgs: Messages = messages("es"),
): string | undefined {
  const next = nextHoliday(list, today);
  if (next === undefined) return undefined;
  if (next.date === dayKey(today)) return msgs.holidayToday;
  const day = parse(next.date);
  return day === undefined ? undefined : fill(msgs.holidayOn, { date: upperDate(day, msgs) });
}
