/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access -- archivos de configuración del repo y JSON de prueba */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Panel } from "../../../contract/src/index.ts";
import {
  createEngine,
  parseDataFile,
  parseViewsConfig,
  zoneId,
  type DataFile,
  type Engine,
  type Renderer,
  type ViewsConfig,
} from "../../../server/src/engine/index.ts";
import {
  ROOT,
  edited,
  holidays2026,
  index8,
  setHolidays,
  view8,
  type Loose,
  type TestChromium,
  type View8,
} from "../F-013/helpers.ts";

export * from "../F-013/helpers.ts";

export const HOY_VIEWS_PATH = join(ROOT, "config/hoy.views.example.json");
export const HOY_DATA_PATH = join(ROOT, "config/hoy.data.example.json");
/** Lunes 26, 08:00 en Lima. */
export const NOW15 = "2026-10-26T13:00:00Z";
export const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;

export const hoyViewsText = (): string => readFileSync(HOY_VIEWS_PATH, "utf8");
export const hoyDataText = (): string => readFileSync(HOY_DATA_PATH, "utf8");

export const cfg15 = (fn?: (o: Loose) => void): ViewsConfig =>
  parseViewsConfig(fn ? edited(hoyViewsText(), fn) : hoyViewsText());
export const data15 = (config: ViewsConfig, fn?: (o: Loose) => void): DataFile =>
  parseDataFile(fn ? edited(hoyDataText(), fn) : hoyDataText(), config);

/** Los eventos de la fuente `calendario` de los ejemplos de hoy, tal cual. */
export const calendarItems = (): Loose[] =>
  (JSON.parse(hoyDataText()) as { sources: { calendario: { items: Loose[] } } }).sources.calendario
    .items;

/** What `onToggle` receives (F-009). */
export interface Change {
  sourceId: string;
  taskId: string;
  stage: string;
  previous: string;
}

export interface Opts15 {
  views?: string[];
  clock?: () => Date;
  cfgFn?: (o: Loose) => void;
  dataFn?: (o: Loose) => void;
  onToggle?: (change: Change) => void;
  /** Los 19 festivos `CO` de 2026 (por defecto sí). */
  holidays?: boolean;
}

const engines: Engine[] = [];
export async function closeEngines15(): Promise<void> {
  for (const e of engines.splice(0)) {
    try {
      await e.idle();
      await e.close();
    } catch {
      /* closing anyway */
    }
  }
}

/** Engine over the examples of `hoy` (config/hoy.*.example.json). */
export function mkEngine15(renderer: Renderer, opts: Opts15 = {}): Engine {
  const config = cfg15((o: Loose) => {
    if (opts.views) o.devices["*"].views = opts.views;
    opts.cfgFn?.(o);
  });
  const data = data15(config, opts.dataFn);
  const engine = createEngine({
    nextWakeS: 1800,
    clock: opts.clock ?? (() => new Date(NOW15)),
    config,
    data,
    renderer,
    ...(opts.onToggle ? { onToggle: opts.onToggle } : {}),
  });
  engines.push(engine);
  if (opts.holidays !== false) {
    const r = setHolidays(engine, holidays2026());
    if (!r.ok) throw new Error(`setHolidays: ${r.error}`);
  }
  return engine;
}

export interface Drawn15 {
  engine: Engine;
  views: View8[];
  /** HTML of each full draw made by this call. */
  htmls: string[];
  gray: number[];
  overflow: string[][];
}

const fullDraws = (cr: TestChromium): TestChromium["renderer"]["calls"] =>
  cr.renderer.calls.filter((c) => c.html.includes("data-fit="));

/** Draws all the views of an engine with the real Chromium and waits for the background draws. */
export async function drawEngine(cr: TestChromium, engine: Engine, panel: Panel): Promise<Drawn15> {
  const n0 = fullDraws(cr).length;
  const { views } = await index8(engine, "local", panel);
  await engine.idle();
  const calls = fullDraws(cr).slice(n0);
  return {
    engine,
    views,
    htmls: calls.map((c) => c.html),
    gray: calls.map((c) => c.out.gray),
    overflow: calls.map((c) => c.out.overflow),
  };
}

export function draw15(cr: TestChromium, panel: Panel, opts: Opts15 = {}): Promise<Drawn15> {
  return drawEngine(cr, mkEngine15(cr.renderer, opts), panel);
}

export const view15 = (d: { views: View8[] }, id: string): View8 => view8(d.views, id);

/** Zone ids of `hoy`: the tasks of `tablero` and the events of `calendario`. */
export const zb = (id: string, view = "hoy"): string => zoneId(view, "tablero", id);
export const za = (id: string, view = "hoy"): string => zoneId(view, "calendario", id);

/** The element of a row (from its `data-zone` to the next element), to look inside one row. */
export function rowHtml(html: string, zone: string): string {
  const at = html.indexOf(`data-zone="${zone}"`);
  if (at < 0) return "";
  const next = html.indexOf("<div", at);
  return html.slice(at, next < 0 ? undefined : next);
}

export type { Panel };
