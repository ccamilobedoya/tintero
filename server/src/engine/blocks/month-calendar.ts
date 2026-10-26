// `month-calendar`: the month of today, weeks from Monday; today inverted, Sundays and holidays in
// bold, a 2 px rule (or a dot) under every day an event covers, and the next holiday by the title.
import { dayKey, daysInMonth, eventDays, weekday } from "../dates.ts";
import { holidayLabel } from "../holidays.ts";
import { html, type Raw } from "../html.ts";
import { fontCss } from "../theme.ts";
import { mmToPx } from "../units.ts";
import { innerW, isTooSmall, noFit, stripRow, titleRow } from "./common.ts";
import type { Block, BlockContext } from "./types.ts";

const RULE_H = 2;
const DOT = 5;
const DOT_ROOM = 14;

/** The title row of the month: the month on the left and, when it fits whole, the next holiday. */
function monthHeader(context: BlockContext): { html: Raw; height: number } {
  const { metrics, today } = context;
  const label = holidayLabel(
    [...context.holidays].map(([date, name]) => ({ date, name })),
    today,
    context.msgs,
  );
  return {
    height: metrics.strip,
    html: stripRow(
      context,
      `${context.msgs.monthsLong[today.m - 1] ?? ""} ${today.y}`,
      label ?? "",
      0,
      {
        dropRight: true,
        plainRight: true,
      },
    ),
  };
}

export const monthCalendar: Block = (context) => {
  const { metrics, slot, source, today } = context;
  if (source.type !== "events") return noFit(context);
  if (isTooSmall(context, 50, mmToPx(35, context.panel.dpi))) return noFit(context);

  const header = slot.title === undefined ? monthHeader(context) : titleRow(context);
  const weekdays = metrics.groupRow;
  const offset = (weekday({ ...today, d: 1 }) + 6) % 7;
  const total = daysInMonth(today.y, today.m);
  const weeks = Math.ceil((offset + total) / 7);
  const top = header.height + weekdays;
  const rowH = Math.max(1, Math.floor((context.h - top) / weeks));
  const colW = Math.max(1, Math.floor(innerW(context) / 7));
  const left = metrics.focusPad + Math.floor((innerW(context) - 7 * colW) / 2);

  // Every day of the month an event covers (not only the day it starts).
  const withEvents = new Set<number>();
  for (const event of source.items) {
    for (const day of eventDays(event.start, event.end, context.timeZone)) {
      if (day.y === today.y && day.m === today.m) withEvents.add(day.d);
    }
  }

  const text = metrics.font.text;
  const px = text.px;
  const numW = Math.min(colW - 2, px * 2);
  const box = Math.max(px + 4, Math.min(Math.round(1.5 * px), rowH - 7));
  const below = rowH >= box + 7;
  const group = below ? box + 4 : box;
  const beside = !below && colW - numW >= DOT_ROOM;
  const hidden = below || beside ? 0 : withEvents.size;

  const letters = context.msgs.weekdayLetters.map(
    (letter, i) =>
      html`<div
        class="a"
        style="left:${left + i * colW}px;top:${header.height}px;width:${colW}px;height:${weekdays}px;line-height:${weekdays}px;text-align:center;${fontCss(metrics.font.detail, true)}"
      >
        ${letter}
      </div>`,
  );
  const cells = Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    const slotIndex = offset + index;
    const column = slotIndex % 7;
    const x = left + column * colW + Math.floor((colW - numW) / 2);
    const y = top + Math.floor(slotIndex / 7) * rowH + Math.floor((rowH - group) / 2);
    const bold = column === 6 || context.holidays.has(dayKey({ y: today.y, m: today.m, d: day }));
    const style =
      `left:${x}px;top:${y}px;width:${numW}px;height:${box}px;line-height:${box}px;text-align:center;` +
      (day === today.d ? "background:#000;color:#fff;" : "") +
      fontCss(text, bold);
    const marked = withEvents.has(day);
    const rule =
      marked && below
        ? html`<div
            class="a"
            style="left:${x + Math.floor((numW - px) / 2)}px;top:${y + box + 2}px;width:${px}px;height:${RULE_H}px;background:#000"
          ></div>`
        : "";
    const dot =
      marked && beside
        ? html`<div
            class="a"
            style="left:${x + numW + 2}px;top:${y + Math.floor((box - DOT) / 2)}px;width:${DOT}px;height:${DOT}px;background:#000"
          ></div>`
        : "";
    return html`<div class="a" style="${style}">${day}</div>
      ${rule}${dot}`;
  });
  return { html: html`${header.html}${letters}${cells}`, hidden, tooSmall: false };
};
