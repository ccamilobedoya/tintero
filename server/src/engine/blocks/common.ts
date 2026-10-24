// Pieces shared by the blocks: the "fits / +N more" rule, the block title row and "No cabe".
import { html, type Raw } from "../html.ts";
import { fontCss } from "../theme.ts";
import { mmToPx } from "../units.ts";
import type { BlockContext, BlockResult } from "./types.ts";

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

/** The block's own title row (only if the slot has a `title`); returns its height. */
export function titleRow(context: BlockContext): { html: Raw; height: number } {
  const { metrics, slot } = context;
  if (slot.title === undefined) return { html: html``, height: 0 };
  const h = metrics.titleRow;
  return {
    height: h,
    html: html`<div
      class="a t"
      style="left:0;top:0;width:${context.w}px;height:${h}px;line-height:${h}px;${fontCss(metrics.font.title, true)}"
    >
      ${slot.title}
    </div>`,
  };
}

export function moreRow(context: BlockContext, y: number, hidden: number): Raw {
  const { metrics } = context;
  const h = metrics.moreRow;
  return html`<div
    class="a t"
    style="left:0;top:${y}px;width:${context.w}px;height:${h}px;line-height:${h}px;${fontCss(metrics.font.detail)}"
  >
    +${hidden} más
  </div>`;
}

export function groupHeader(context: BlockContext, text: string, y: number): Raw {
  const { metrics } = context;
  const h = metrics.groupRow;
  return html`<div
    class="a t"
    style="left:0;top:${y}px;width:${context.w}px;height:${h}px;line-height:${h}px;${fontCss(metrics.font.detail, true)}"
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
      style="left:0;top:0;width:${context.w}px;height:${h}px;line-height:${h}px;${fontCss(metrics.font.text)}"
    >
      No cabe
    </div>`,
  };
}

/** `25 oct` from `2026-10-25`. */
export function shortDay(text: string, months: readonly string[]): string {
  const month = Number(text.slice(5, 7));
  return `${Number(text.slice(8, 10))} ${months[month - 1] ?? ""}`;
}
