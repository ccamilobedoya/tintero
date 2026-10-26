// `agenda`: events by day (today and the next `days` - 1), an optional pictogram column, a time
// column and the title. With `holidays: true` each public holiday is the first row of its day.
import type { CalendarEvent } from "../config.ts";
import {
  addDays,
  dayKey,
  dayLabel,
  eventStart,
  hhmm,
  upperDate,
  type DayParts,
  type EventTime,
} from "../dates.ts";
import { html, type Raw } from "../html.ts";
import type { Messages } from "../i18n/index.ts";
import { fontCss } from "../theme.ts";
import { fitList, isTooSmall, moreRow, noFit, titleRow } from "./common.ts";
import { pictogram } from "./pictograms.ts";
import type { Block, BlockContext } from "./types.ts";

interface Entry {
  /** Absent in a holiday row (not a zone: no focus, no detail). */
  event?: CalendarEvent;
  holiday?: string;
  time: EventTime;
  /** Column layout: the day text, only on the first row of each day. */
  day?: string;
}

/** Events per day inside the window; holiday first, then all-day, then by time (ties keep the data order). */
function agendaGroups(
  events: CalendarEvent[],
  today: DayParts,
  days: number,
  timeZone: string,
  holidays: ReadonlyMap<string, string> | undefined,
  column: boolean,
  msgs: Messages,
): { header?: string; items: Entry[] }[] {
  const starts = events.map((event): Entry => ({ event, time: eventStart(event.start, timeZone) }));
  const out: { header?: string; items: Entry[] }[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    const key = dayKey(day);
    const items = starts
      .filter((entry) => dayKey(entry.time.day) === key)
      .sort(
        (a, b) =>
          Number(!a.time.allDay) - Number(!b.time.allDay) ||
          (a.time.minutes ?? 0) - (b.time.minutes ?? 0),
      );
    const name = holidays?.get(key);
    if (name !== undefined) items.unshift({ holiday: name, time: { day, allDay: true } });
    const [first] = items;
    if (first === undefined) continue;
    if (column) {
      first.day = dayLabel(day, today, msgs);
      out.push({ items });
    } else {
      out.push({ header: upperDate(day, msgs), items });
    }
  }
  return out;
}

function row(context: BlockContext, entry: Entry, iconColumn: boolean, dayColumn: boolean): Raw {
  const { metrics } = context;
  const h = metrics.row;
  const pad = metrics.focusPad;
  const ih = h - 2 * pad;
  const zone =
    entry.event === undefined ? undefined : context.focus(entry.event.id, "open", context.w, h);
  const time = entry.time.allDay ? context.msgs.allDay : hhmm(entry.time.minutes ?? 0);
  const title = entry.event?.title ?? entry.holiday ?? "";
  const icon = entry.event === undefined ? "estrella" : entry.event.icon;
  const size = metrics.font.text.px;
  let cell = html``;
  if (iconColumn) {
    const top = Math.max(0, Math.floor((ih - size) / 2));
    cell = html`<span style="display:block;height:${ih}px;overflow:visible"
      >${
        icon === undefined
          ? html``
          : html`<span style="display:block;padding-top:${top}px">${pictogram(icon, size)}</span>`
      }</span
    >`;
  }
  return html`<div
    data-fit="${context.area}"
    ${zone === undefined ? html`` : html` data-zone="${zone}"`}
    style="grid-column:1/-1;display:grid;grid-template-columns:subgrid;align-items:center;height:${h}px;padding:${pad}px;overflow:hidden"
  >
    ${
      dayColumn
        ? html`<span
            style="white-space:nowrap;line-height:${ih}px;${fontCss(metrics.font.detail, true)}"
            >${entry.day ?? ""}</span
          >`
        : html``
    }${cell}<span style="white-space:nowrap;line-height:${ih}px;${fontCss(metrics.font.detail)}"
      >${time}</span
    ><span class="t" style="line-height:${ih}px;${fontCss(metrics.font.text)}">${title}</span>
  </div>`;
}

export const agenda: Block = (context) => {
  const { metrics, slot, source } = context;
  if (source.type !== "events") return noFit(context);
  const dayColumn = slot.options.layout === "column";
  const days = typeof slot.options.days === "number" ? slot.options.days : 7;
  const withHolidays = slot.options.holidays === true;
  const groups = agendaGroups(
    source.items,
    context.today,
    days,
    context.timeZone,
    withHolidays ? context.holidays : undefined,
    dayColumn,
    context.msgs,
  );
  const events = groups.reduce(
    (sum, group) => sum + group.items.filter((item) => item.event !== undefined).length,
    0,
  );
  const title = titleRow(context, String(events));
  const minH = 2 * metrics.margin + title.height + metrics.groupRow + metrics.row + metrics.moreRow;
  if (isTooSmall(context, 40, minH)) return noFit(context);
  const fitted = fitList(
    groups,
    () => metrics.row,
    metrics.groupRow,
    metrics.moreRow,
    context.h - title.height,
  );
  // Rule 1: the column exists only if a drawn row has a pictogram.
  const iconColumn = fitted.placed.some(
    (entry) =>
      entry.kind === "item" &&
      (entry.item.event === undefined || entry.item.event.icon !== undefined),
  );
  const columns = `${dayColumn ? "max-content " : ""}${
    iconColumn
      ? `${metrics.font.text.px + 6}px max-content minmax(0,1fr)`
      : "max-content minmax(0,1fr)"
  }`;
  const parts = fitted.placed.map((entry) =>
    entry.kind === "header"
      ? html`<div
          class="t"
          style="grid-column:1/-1;height:${entry.h}px;padding:0 ${metrics.focusPad}px;line-height:${entry.h}px;${fontCss(metrics.font.detail, true)}"
        >
          ${entry.text}
        </div>`
      : row(context, entry.item, iconColumn, dayColumn),
  );
  const more =
    fitted.moreY === undefined
      ? html``
      : moreRow(context, title.height + fitted.moreY, fitted.hidden);
  return {
    html: html`${title.html}
      <div
        class="a"
        style="left:0;top:${title.height}px;width:${context.w}px;display:grid;grid-template-columns:${columns};column-gap:${metrics.gap}px"
      >
        ${parts}
      </div>
      ${more}`,
    hidden: fitted.hidden,
    tooSmall: false,
  };
};
