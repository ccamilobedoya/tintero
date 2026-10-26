// `task-list`: checkable rows (or open-only for a read-only source), grouped by category.
import type { Task } from "../config.ts";
import { MONTHS } from "../dates.ts";
import { html, type Raw } from "../html.ts";
import { fontCss } from "../theme.ts";
import {
  fitList,
  groupHeader,
  groupTasks,
  isTooSmall,
  moreRow,
  noFit,
  shortDay,
  titleRow,
} from "./common.ts";
import type { Block, BlockContext } from "./types.ts";

function taskRow(context: BlockContext, task: Task, y: number, readonly: boolean): Raw {
  const { metrics } = context;
  const h = metrics.row;
  const pad = metrics.focusPad;
  const ih = h - 2 * pad;
  const zone = context.focus(task.id, readonly ? "open" : "toggle", context.w, h);
  const boxTop = pad + Math.floor((ih - metrics.box) / 2);
  const checkbox = readonly
    ? html``
    : html`<span
        class="a"
        style="left:${pad}px;top:${boxTop}px;width:${metrics.box}px;height:${metrics.box}px;border:${metrics.boxBorder}px solid #000;background:${task.done ? "#000" : "#fff"}"
      ></span>`;
  const first = readonly ? 0 : metrics.box + metrics.gap;
  const due =
    task.due === undefined
      ? html``
      : html`<span
          style="grid-column:3;margin-left:${metrics.gap}px;white-space:nowrap;line-height:${ih}px;${fontCss(metrics.font.detail)}"
          >${shortDay(task.due, MONTHS)}</span
        >`;
  const deco = task.done
    ? `text-decoration:line-through;text-decoration-thickness:${metrics.line}px;`
    : "";
  return html`<div
    class="a"
    data-fit="${context.area}"
    ${zone === undefined ? html`` : html` data-zone="${zone}"`}
    style="left:0;top:${y}px;width:${context.w}px;height:${h}px;padding:${pad}px;display:grid;grid-template-columns:${first}px minmax(0,1fr) max-content;align-items:center"
  >
    ${checkbox}<span
      class="t"
      style="grid-column:2;line-height:${ih}px;${deco}${fontCss(metrics.font.text)}"
      >${task.title}</span
    >${due}
  </div>`;
}

export const taskList: Block = (context) => {
  const { metrics, slot, source } = context;
  if (source.type !== "tasks") return noFit(context);
  const grouped = slot.options.group_by !== "none";
  const title = titleRow(context, String(source.items.length));
  const minH =
    2 * metrics.margin +
    title.height +
    (grouped ? metrics.groupRow : 0) +
    metrics.row +
    metrics.moreRow;
  if (isTooSmall(context, 30, minH)) return noFit(context);
  const fitted = fitList(
    groupTasks(source.items, grouped),
    () => metrics.row,
    metrics.groupRow,
    metrics.moreRow,
    context.h - title.height,
  );
  const parts = fitted.placed.map((entry) => {
    const y = title.height + entry.y;
    return entry.kind === "header"
      ? groupHeader(context, entry.text, y)
      : taskRow(context, entry.item, y, source.readonly);
  });
  const more =
    fitted.moreY === undefined
      ? html``
      : moreRow(context, title.height + fitted.moreY, fitted.hidden);
  return { html: html`${title.html}${parts}${more}`, hidden: fitted.hidden, tooSmall: false };
};
