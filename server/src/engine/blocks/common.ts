// Pieces shared by the blocks: the "fits / +N more" rule, the block title row and "No cabe".
import type { Task } from "../config.ts";
import { html, type Raw } from "../html.ts";
import { fontCss } from "../theme.ts";
import { mmToPx } from "../units.ts";
import type { BlockContext, BlockResult } from "./types.ts";

/** Width of what is not a zone: the column minus the blank band on each side (F-008). */
export const innerW = (context: BlockContext): number =>
  Math.max(1, context.w - 2 * context.metrics.focusPad);

export interface Group<T> {
  header?: string;
  items: T[];
}

type Placed<T> =
  | { kind: "header"; y: number; h: number; text: string }
  | { kind: "item"; y: number; h: number; item: T };

export interface Fitted<T> {
  placed: Placed<T>[];
  hidden: number;
  /** Top of the "+N más" row, when there is one. */
  moreY: number | undefined;
}

/**
 * Common rule: rows go one under another with the height their design fixes. A group header is
 * only drawn if it fits with at least one row of its own. If not everything fits, the last row
 * is kept for "+N más" and rows are added while they fit; the first one that does not ends it.
 */
export function fitList<T>(
  groups: Group<T>[],
  itemHeight: (item: T) => number,
  headerHeight: number,
  moreHeight: number,
  available: number,
): Fitted<T> {
  const items = groups.reduce((sum, group) => sum + group.items.length, 0);
  const everything = groups.reduce(
    (sum, group) =>
      sum +
      (group.header === undefined || group.items.length === 0 ? 0 : headerHeight) +
      group.items.reduce((rows, item) => rows + itemHeight(item), 0),
    0,
  );
  const all = everything <= available;
  const limit = all ? available : available - moreHeight;
  const placed: Placed<T>[] = [];
  let y = 0;
  let shown = 0;
  let stop = false;
  for (const group of groups) {
    if (stop) break;
    const first = group.items[0];
    if (first === undefined) continue;
    if (group.header !== undefined) {
      if (y + headerHeight + itemHeight(first) > limit) break;
      placed.push({ kind: "header", y, h: headerHeight, text: group.header });
      y += headerHeight;
    }
    for (const item of group.items) {
      const h = itemHeight(item);
      if (y + h > limit) {
        stop = true;
        break;
      }
      placed.push({ kind: "item", y, h, item });
      y += h;
      shown++;
    }
  }
  const hidden = items - shown;
  return { placed, hidden, moreY: hidden > 0 ? y : undefined };
}

/** Section strip (ADR-0056): label on the left, `right` on the right, a `line` rule at the bottom. */
export function stripRow(
  context: BlockContext,
  label: string,
  right: string,
  y: number,
  options: { lead?: boolean; dropRight?: boolean; plainRight?: boolean } = {},
): Raw {
  const m = context.metrics;
  const lead = options.lead === true;
  const rightStyle =
    options.plainRight === true
      ? "white-space:nowrap;font-weight:400;letter-spacing:0"
      : "white-space:nowrap";
  const text = label.toUpperCase();
  const common = `line-height:${m.strip}px;letter-spacing:1px;${fontCss(m.font.detail, true)}${lead ? ";background:#000;color:#fff" : ""}`;
  const box = `left:0;top:${y}px;width:${context.w}px;height:${m.strip}px;padding:0 ${m.focusPad}px`;
  const body =
    options.dropRight === true
      ? html`<div
          class="a"
          style="${box};overflow:hidden;display:flex;flex-wrap:wrap;justify-content:space-between;column-gap:${m.gap}px;${common}"
        >
          <span style="white-space:nowrap">${text}</span><span style="${rightStyle}">${right}</span>
        </div>`
      : html`<div
          class="a"
          style="${box};display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:${m.gap}px;${common}"
        >
          <span class="t">${text}</span><span style="${rightStyle}">${right}</span>
        </div>`;
  const rule = lead
    ? html``
    : html`<div
        class="a"
        style="left:0;top:${y + m.strip - m.line}px;width:${context.w}px;height:${m.line}px;background:#000"
      ></div>`;
  return html`${body}${rule}`;
}

/** The block's title as a strip (only with `slot.title`); the stale notice wins over `right`. */
export function titleRow(context: BlockContext, right = ""): { html: Raw; height: number } {
  const { metrics, slot } = context;
  if (slot.title === undefined) return { html: html``, height: 0 };
  return {
    height: metrics.strip,
    html: stripRow(context, slot.title, context.stale ?? right, 0),
  };
}

export function moreRow(context: BlockContext, y: number, hidden: number): Raw {
  const { metrics } = context;
  const h = metrics.moreRow;
  return html`<div
    class="a t"
    style="left:${metrics.focusPad}px;top:${y}px;width:${innerW(context)}px;height:${h}px;line-height:${h}px;${fontCss(metrics.font.detail)}"
  >
    +${hidden} más
  </div>`;
}

export function groupHeader(context: BlockContext, text: string, y: number): Raw {
  const { metrics } = context;
  const h = metrics.groupRow;
  return html`<div
    class="a t"
    style="left:${metrics.focusPad}px;top:${y}px;width:${innerW(context)}px;height:${h}px;line-height:${h}px;${fontCss(metrics.font.detail, true)}"
  >
    ${text}
  </div>`;
}

/** Is the slot smaller than the minimum of the block? (width in mm, height in px) */
export function isTooSmall(context: BlockContext, minMm: number, minH: number): boolean {
  return context.outerW < mmToPx(minMm, context.panel.dpi) || context.outerH < minH;
}

export function noFit(context: BlockContext): BlockResult {
  const { metrics } = context;
  const h = metrics.row;
  return {
    hidden: 0,
    tooSmall: true,
    html: html`<div
      class="a t"
      style="left:${metrics.focusPad}px;top:0;width:${innerW(context)}px;height:${h}px;line-height:${h}px;${fontCss(metrics.font.text)}"
    >
      No cabe
    </div>`,
  };
}

const NO_CATEGORY = "Sin categoría";

export function groupTasks(tasks: Task[], byCategory: boolean): Group<Task>[] {
  if (!byCategory) return [{ items: tasks }];
  const order: string[] = [];
  const byName = new Map<string, Task[]>();
  for (const task of tasks) {
    const name = task.category ?? NO_CATEGORY;
    let list = byName.get(name);
    if (!list) {
      list = [];
      byName.set(name, list);
      order.push(name);
    }
    list.push(task);
  }
  // Tasks without a category go last, whatever their position in the data.
  const names = [...order.filter((name) => name !== NO_CATEGORY)];
  if (byName.has(NO_CATEGORY)) names.push(NO_CATEGORY);
  return names.map((name) => ({ header: name, items: byName.get(name) ?? [] }));
}

/** `25 oct` from `2026-10-25`. */
export function shortDay(text: string, months: readonly string[]): string {
  const month = Number(text.slice(5, 7));
  return `${Number(text.slice(8, 10))} ${months[month - 1] ?? ""}`;
}
