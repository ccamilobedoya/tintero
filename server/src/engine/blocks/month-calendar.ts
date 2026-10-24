// `month-calendar`: the month of today, weeks from Monday; today inverted, event days underlined.
import { daysInMonth, eventStart, MONTHS_LONG, weekday } from "../dates.ts";
import { html } from "../html.ts";
import { fontCss } from "../theme.ts";
import { mmToPx } from "../units.ts";
import { isTooSmall, noFit, titleRow } from "./common.ts";
import type { Block } from "./types.ts";

const LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

export const monthCalendar: Block = (context) => {
  const { metrics, slot, source, today } = context;
  if (source.type !== "events") return noFit(context);
  if (isTooSmall(context, 50, mmToPx(35, context.panel.dpi))) return noFit(context);

  const title = titleRow(context);
  const header =
    slot.title === undefined
      ? {
          height: metrics.groupRow,
          html: html`<div
            class="a t"
            style="left:0;top:0;width:${context.w}px;height:${metrics.groupRow}px;line-height:${metrics.groupRow}px;${fontCss(metrics.font.detail, true)}"
          >
            ${`${MONTHS_LONG[today.m - 1] ?? ""} ${today.y}`}
          </div>`,
        }
      : title;
  const weekdays = metrics.groupRow;
  const offset = (weekday({ ...today, d: 1 }) + 6) % 7;
  const total = daysInMonth(today.y, today.m);
  const weeks = Math.ceil((offset + total) / 7);
  const top = header.height + weekdays;
  const rowH = Math.max(1, Math.floor((context.h - top) / weeks));
  const colW = Math.max(1, Math.floor(context.w / 7));
  const left = Math.floor((context.w - 7 * colW) / 2);

  const withEvents = new Set<number>();
  for (const event of source.items) {
    const start = eventStart(event.start, context.timeZone).day;
    if (start.y === today.y && start.m === today.m) withEvents.add(start.d);
  }

  const text = metrics.font.text;
  const innerW = Math.min(colW - 2, text.px * 2);
  const innerH = Math.min(rowH, Math.round(text.px * 1.5));
  const letters = LETTERS.map(
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
    const x = left + (slotIndex % 7) * colW;
    const y = top + Math.floor(slotIndex / 7) * rowH;
    const isToday = day === today.d;
    const style =
      `display:block;width:${innerW}px;height:${innerH}px;line-height:${innerH}px;text-align:center;` +
      (isToday ? "background:#000;color:#fff;" : "") +
      (withEvents.has(day) ? "text-decoration:underline;" : "");
    return html`<div
      class="a"
      style="left:${x}px;top:${y}px;width:${colW}px;height:${rowH}px;display:flex;align-items:center;justify-content:center;${fontCss(text)}"
    >
      <span style="${style}">${day}</span>
    </div>`;
  });
  return { html: html`${header.html}${letters}${cells}`, hidden: 0, tooSmall: false };
};
