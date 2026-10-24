// Builds the HTML of one view: title bar, rules between areas, and each block in its area.
import { createHash } from "node:crypto";
import { LIMITS, type Panel } from "../../../contract/src/index.ts";
import { BLOCKS, detailBody, type BlockContext } from "./blocks/index.ts";
import type { Grid, Source, ViewDef, ViewsConfig } from "./config.ts";
import { localParts, shortDate } from "./dates.ts";
import { html, page, type Raw } from "./html.ts";
import { dividers, slotRects } from "./layout.ts";
import { fontCss, themeMetrics } from "./theme.ts";

interface ZoneSpec {
  id: string;
  act: "toggle" | "open";
}

export interface BuiltView {
  html: string;
  /** Zones in Tab order; the page carries each one as `data-zone`. */
  zones: ZoneSpec[];
  hidden: Record<string, number>;
  tooSmall: string[];
}

/** Opaque and stable: "z" + 10 hex digits of the SHA-256 of view, source and item ids. */
export function zoneId(viewId: string, sourceId: string, itemId: string): string {
  const digest = createHash("sha256").update(`${viewId}\n${sourceId}\n${itemId}`).digest("hex");
  return `z${digest.slice(0, 10)}`;
}

const gridFor = (def: ViewDef, panel: Panel): Grid =>
  panel.h > panel.w && def.portrait !== undefined ? def.portrait : def.grid;

function bar(panel: Panel, title: string, dateText: string): Raw {
  const m = themeMetrics(panel);
  return html`<div
      class="a"
      data-fit="bar"
      style="left:0;top:0;width:${panel.w}px;height:${m.bar}px;padding:0 ${m.margin}px;display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:${m.gap}px;align-items:center"
    >
      <div class="t" style="line-height:${m.bar}px;${fontCss(m.font.title, true)}">${title}</div>
      <div style="white-space:nowrap;line-height:${m.bar}px;${fontCss(m.font.detail)}">
        ${dateText}
      </div>
    </div>
    <div
      class="a"
      style="left:0;top:${m.bar}px;width:${panel.w}px;height:${m.line}px;background:#000"
    ></div>`;
}

function rules(grid: Grid, panel: Panel): Raw {
  return html`${dividers(grid, panel).map(
    (r) =>
      html`<div
        class="a"
        style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:#000"
      ></div>`,
  )}`;
}

interface Input {
  panel: Panel;
  config: ViewsConfig;
  sources: Record<string, Source>;
  at: Date;
  /** Per source: the "sin datos desde" notice for this draw, when there is one. */
  stale?: Record<string, string>;
}

function newFocus(viewId: string, sourceId: string, zones: ZoneSpec[]) {
  return (itemId: string, act: "toggle" | "open", w: number, h: number): string | undefined => {
    if (zones.length >= LIMITS.maxZones || w < LIMITS.minZoneSize || h < LIMITS.minZoneSize) {
      return undefined;
    }
    const id = zoneId(viewId, sourceId, itemId);
    if (zones.some((zone) => zone.id === id)) return undefined;
    zones.push({ id, act });
    return id;
  };
}

export function buildView(def: ViewDef, input: Input): BuiltView {
  const { panel, config, sources, at, stale } = input;
  const metrics = themeMetrics(panel);
  const today = localParts(at, config.timezone).day;
  const grid = gridFor(def, panel);
  const rects = slotRects(grid, panel);
  // Tab order: the listed areas first, then the rest in the default order.
  const order = [
    ...(def.tab ?? []),
    ...rects.map((r) => r.area).filter((area) => !(def.tab ?? []).includes(area)),
  ];
  const zones: ZoneSpec[] = [];
  const hidden = new Map<string, number>();
  const tooSmall: string[] = [];
  const parts = new Map<string, Raw>();
  for (const area of order) {
    const rect = rects.find((r) => r.area === area);
    // eslint-disable-next-line security/detect-object-injection -- area names were validated against the grid
    const slot = def.slots[area];
    const source = slot === undefined ? undefined : sources[slot.source];
    if (rect === undefined || slot === undefined || source === undefined) continue;
    const w = Math.max(1, rect.w - 2 * metrics.margin);
    const h = Math.max(1, rect.h - 2 * metrics.margin);
    const context: BlockContext = {
      panel,
      metrics,
      outerW: rect.w,
      outerH: rect.h,
      w,
      h,
      area,
      slot,
      source,
      timeZone: config.timezone,
      today,
      stale:
        stale !== undefined && Object.hasOwn(stale, slot.source) ? stale[slot.source] : undefined,
      focus: newFocus(def.id, slot.source, zones),
    };
    const result = BLOCKS[slot.block](context);
    hidden.set(area, result.hidden);
    if (result.tooSmall) tooSmall.push(area);
    parts.set(
      area,
      html`<div
        class="a"
        style="left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px"
      >
        <div
          class="a"
          data-fit="${area}"
          style="left:${metrics.margin}px;top:${metrics.margin}px;width:${w}px;height:${h}px;overflow:hidden"
        >
          ${result.html}
        </div>
      </div>`,
    );
  }
  const body = html`${bar(panel, def.title, shortDate(today))}${rules(grid, panel)}${[...parts.values()]}`;
  return {
    html: page(panel.w, panel.h, body),
    zones,
    hidden: Object.fromEntries(hidden),
    tooSmall,
  };
}

/** The detail view of one item: one area, no zones. */
export function buildDetailView(input: Input & { sourceId: string; itemId: string }): BuiltView {
  const { panel, config, sources, at } = input;
  const metrics = themeMetrics(panel);
  const today = localParts(at, config.timezone).day;
  const grid: Grid = { columns: [100], rows: [100], areas: [["detalle"]] };
  const rect = slotRects(grid, panel)[0];
  const w = Math.max(1, (rect?.w ?? panel.w) - 2 * metrics.margin);
  const h = Math.max(1, (rect?.h ?? panel.h) - 2 * metrics.margin);
  const found = Object.hasOwn(sources, input.sourceId) ? sources[input.sourceId] : undefined;
  const inner = detailBody({
    metrics,
    w,
    h,
    timeZone: config.timezone,
    source: found,
    itemId: input.itemId,
    area: "detalle",
  });
  const body = html`${bar(panel, "Detalle", shortDate(today))}
    <div
      class="a"
      style="left:${metrics.margin}px;top:${(rect?.y ?? 0) + metrics.margin}px;width:${w}px;height:${h}px"
    >
      ${inner}
    </div>`;
  return { html: page(panel.w, panel.h, body), zones: [], hidden: {}, tooSmall: [] };
}
