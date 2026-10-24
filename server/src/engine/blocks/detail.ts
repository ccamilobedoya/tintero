// The detail of one event or task (used by the engine for the `<id>-d` views; it has no zones).
import type { Source } from "../config.ts";
import { eventStart, hhmm, MONTHS, shortDate } from "../dates.ts";
import { html, type Raw } from "../html.ts";
import { fontCss, type FontChoice, type Metrics } from "../theme.ts";
import { shortDay } from "./common.ts";

export interface DetailInput {
  metrics: Metrics;
  w: number;
  h: number;
  timeZone: string;
  source: Source | undefined;
  itemId: string;
  area: string;
}

const lineHeight = (font: FontChoice): number => Math.round(font.px * 1.3);

/** A paragraph of at most `lines` lines, cut with an ellipsis. */
function paragraph(text: string, font: FontChoice, bold: boolean, lines: number, gap: number): Raw {
  const lh = lineHeight(font);
  return html`<div
    style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${lines};overflow:hidden;overflow-wrap:anywhere;line-height:${lh}px;max-height:${lines * lh}px;margin-bottom:${gap}px;${fontCss(font, bold)}"
  >
    ${text}
  </div>`;
}

export function detailBody(input: DetailInput): Raw {
  const { metrics, w, h, timeZone, source, itemId } = input;
  const { font, gap } = metrics;
  const frame = (inner: Raw): Raw =>
    html`<div
      class="a"
      data-fit="${input.area}"
      style="left:0;top:0;width:${w}px;height:${h}px;overflow:hidden"
    >
      ${inner}
    </div>`;
  const found = source?.items.find((item) => item.id === itemId);
  if (source === undefined || found === undefined) {
    return frame(paragraph("No disponible", font.text, false, 1, gap));
  }
  const used = (lines: number, f: FontChoice): number => lines * lineHeight(f) + gap;
  const notesLines = (spent: number, f: FontChoice): number =>
    Math.max(1, Math.floor((h - spent) / lineHeight(f)));

  if (source.type === "events") {
    const event = source.items.find((item) => item.id === itemId);
    if (event === undefined) return frame(html``);
    const start = eventStart(event.start, timeZone);
    let when = shortDate(start.day);
    if (start.allDay) when += " · todo el día";
    else {
      const end = event.end === undefined ? undefined : eventStart(event.end, timeZone);
      const range =
        end?.minutes === undefined
          ? hhmm(start.minutes ?? 0)
          : `${hhmm(start.minutes ?? 0)}–${hhmm(end.minutes)}`;
      when += ` · ${range}`;
    }
    let spent = used(3, font.title) + used(1, font.detail);
    const parts: Raw[] = [
      paragraph(event.title, font.title, true, 3, gap),
      paragraph(when, font.detail, false, 1, gap),
    ];
    if (event.location !== undefined) {
      parts.push(paragraph(event.location, font.text, false, 1, gap));
      spent += used(1, font.text);
    }
    if (event.notes !== undefined) {
      parts.push(paragraph(event.notes, font.text, false, notesLines(spent, font.text), gap));
    }
    return frame(html`${parts}`);
  }

  const task = source.items.find((item) => item.id === itemId);
  if (task === undefined) return frame(html``);
  const head = [task.key, task.status].filter((part) => part !== undefined).join(" · ");
  const parts: Raw[] = [];
  let spent = used(3, font.title);
  if (head !== "") {
    parts.push(paragraph(head, font.detail, true, 1, gap));
    spent += used(1, font.detail);
  }
  parts.push(paragraph(task.title, font.title, true, 3, gap));
  if (task.due !== undefined) {
    parts.push(paragraph(shortDay(task.due, MONTHS), font.detail, false, 1, gap));
    spent += used(1, font.detail);
  }
  if (task.description !== undefined) {
    parts.push(paragraph(task.description, font.text, false, notesLines(spent, font.text), gap));
  }
  return frame(html`${parts}`);
}
