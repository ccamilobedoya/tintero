// `issue-list`: `key · status`, the title and (optionally) the description, ungrouped.
import type { Task } from "../config.ts";
import { html, type Raw } from "../html.ts";
import { fontCss } from "../theme.ts";
import { fitList, isTooSmall, moreRow, noFit, titleRow } from "./common.ts";
import type { Block, BlockContext } from "./types.ts";

function issueRow(context: BlockContext, task: Task, y: number, withDescription: boolean): Raw {
  const { metrics } = context;
  const inner = withDescription ? metrics.issueDescRow : metrics.issueRow;
  const h = inner + 2 * metrics.focusPad;
  const zone = context.focus(task.id, "open", context.w, h);
  const detail = metrics.font.detail;
  const line1 = detail.px + 6;
  const line3 = withDescription ? detail.px + 5 : 0;
  const line2 = inner - line1 - line3;
  const head = [task.key, task.status].filter((part) => part !== undefined).join(" · ");
  const description = withDescription
    ? html`<div class="t" style="height:${line3}px;line-height:${line3}px;${fontCss(detail)}">
        ${task.description ?? ""}
      </div>`
    : html``;
  return html`<div
    class="a"
    data-fit="${context.area}"
    ${zone === undefined ? html`` : html` data-zone="${zone}"`}
    style="left:0;top:${y}px;width:${context.w}px;height:${h}px;padding:${metrics.focusPad}px"
  >
    <div class="t" style="height:${line1}px;line-height:${line1}px;${fontCss(detail, true)}">
      ${head}
    </div>
    <div class="t" style="height:${line2}px;line-height:${line2}px;${fontCss(metrics.font.text)}">
      ${task.title}
    </div>
    ${description}
  </div>`;
}

export const issueList: Block = (context) => {
  const { metrics, slot, source } = context;
  if (source.type !== "tasks") return noFit(context);
  const withDescription = slot.options.description === true;
  const rowH = (withDescription ? metrics.issueDescRow : metrics.issueRow) + 2 * metrics.focusPad;
  const title = titleRow(context, String(source.items.length));
  const minH = 2 * metrics.margin + title.height + rowH + metrics.moreRow;
  if (isTooSmall(context, 30, minH)) return noFit(context);
  const fitted = fitList(
    [{ items: source.items }],
    () => rowH,
    0,
    metrics.moreRow,
    context.h - title.height,
  );
  const parts = fitted.placed.map((entry) =>
    entry.kind === "item"
      ? issueRow(context, entry.item, title.height + entry.y, withDescription)
      : html``,
  );
  const more =
    fitted.moreY === undefined
      ? html``
      : moreRow(context, title.height + fitted.moreY, fitted.hidden);
  return { html: html`${title.html}${parts}${more}`, hidden: fitted.hidden, tooSmall: false };
};
