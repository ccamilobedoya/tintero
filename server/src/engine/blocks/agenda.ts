// `agenda`: events by day (today and the next `days` - 1), a time column and the title.
import type { CalendarEvent } from "../config.ts";
import {
  addDays,
  dayKey,
  eventStart,
  hhmm,
  upperDate,
  type DayParts,
  type EventTime,
} from "../dates.ts";
import { html, type Raw } from "../html.ts";
import { fontCss } from "../theme.ts";
import { fitList, isTooSmall, moreRow, noFit, titleRow } from "./common.ts";
import type { Block, BlockContext } from "./types.ts";

interface Entry {
  event: CalendarEvent;
  time: EventTime;
}

/** Events per day inside the window; all-day first, then by time (ties keep the data order). */
function agendaGroups(
  events: CalendarEvent[],
  today: DayParts,
  days: number,
  timeZone: string,
): { header: string; items: Entry[] }[] {
  const starts = events.map((event) => ({ event, time: eventStart(event.start, timeZone) }));
  const out: { header: string; items: Entry[] }[] = [];
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
    if (items.length > 0) out.push({ header: upperDate(day), items });
  }
  return out;
}

function row(context: BlockContext, entry: Entry): Raw {
  const { metrics } = context;
  const h = metrics.row;
  const zone = context.focus(entry.event.id, "open", context.w, h);
  const time = entry.time.allDay ? "Todo el día" : hhmm(entry.time.minutes ?? 0);
  return html`<div
    data-fit="${context.area}"
    ${zone === undefined ? html`` : html` data-zone="${zone}"`}
    style="grid-column:1/-1;display:grid;grid-template-columns:subgrid;align-items:center;height:${h}px;overflow:hidden"
  >
    <span style="white-space:nowrap;line-height:${h}px;${fontCss(metrics.font.detail)}"
      >${time}</span
    ><span class="t" style="line-height:${h}px;${fontCss(metrics.font.text)}"
      >${entry.event.title}</span
    >
  </div>`;
}

export const agenda: Block = (context) => {
  const { metrics, slot, source } = context;
  if (source.type !== "events") return noFit(context);
  const title = titleRow(context);
  const minH = 2 * metrics.margin + title.height + metrics.groupRow + metrics.row + metrics.moreRow;
  if (isTooSmall(context, 40, minH)) return noFit(context);
  const days = typeof slot.options.days === "number" ? slot.options.days : 7;
  const fitted = fitList(
    agendaGroups(source.items, context.today, days, context.timeZone),
    () => metrics.row,
    metrics.groupRow,
    metrics.moreRow,
    context.h - title.height,
  );
  const parts = fitted.placed.map((entry) =>
    entry.kind === "header"
      ? html`<div
          class="t"
          style="grid-column:1/-1;height:${entry.h}px;line-height:${entry.h}px;${fontCss(metrics.font.detail, true)}"
        >
          ${entry.text}
        </div>`
      : row(context, entry.item),
  );
  const more =
    fitted.moreY === undefined
      ? html``
      : moreRow(context, title.height + fitted.moreY, fitted.hidden);
  return {
    html: html`${title.html}
      <div
        class="a"
        style="left:0;top:${title.height}px;width:${context.w}px;display:grid;grid-template-columns:max-content minmax(0,1fr);column-gap:${metrics.gap}px"
      >
        ${parts}
      </div>
      ${more}`,
    hidden: fitted.hidden,
    tooSmall: false,
  };
};
