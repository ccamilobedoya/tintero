/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- JSON de prueba y funciones del contrato leídas del módulo público */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Action, Zone } from "../../../contract/src/index.ts";
import * as engineModule from "../../../server/src/engine/index.ts";
import {
  parseDataFile,
  parseViewsConfig,
  type DataFile,
  type Engine,
  type Renderer,
  type ViewsConfig,
} from "../../../server/src/engine/index.ts";
import { ROOT, edited, mkEngine, type Loose } from "../F-005/helpers.ts";

export * from "../F-005/helpers.ts";

export const VIEWS6_PATH = join(ROOT, "config/tablero.views.example.json");
export const DATA6_PATH = join(ROOT, "config/tablero.data.example.json");
export const NOW = "2026-10-24T17:00:00Z";
export const AFTER_MIDNIGHT = "2026-10-25T05:01:00Z";

export const views6Text = (): string => readFileSync(VIEWS6_PATH, "utf8");
export const data6Text = (): string => readFileSync(DATA6_PATH, "utf8");

export const cfg6 = (fn?: (o: Loose) => void): ViewsConfig =>
  parseViewsConfig(fn ? edited(views6Text(), fn) : views6Text());
export const data6 = (config: ViewsConfig, fn?: (o: Loose) => void): DataFile =>
  parseDataFile(fn ? edited(data6Text(), fn) : data6Text(), config);

/** Only these views for every device (`"*"`). */
export const only6 =
  (list: string[]) =>
  (o: Loose): void => {
    o.devices["*"].views = list;
  };

/** The items of the `tablero` source, straight from the example JSON. */
export const tableroItems = (): Loose[] => JSON.parse(data6Text()).sources.tablero.items;

/** Engine over the F-006 examples with the fixed clock (or the given one). */
export function mkEngine6(
  renderer: Renderer,
  opts: {
    views?: string[];
    clock?: () => Date;
    cfgFn?: (o: Loose) => void;
    dataFn?: (o: Loose) => void;
  } = {},
): Engine {
  const viewsFn = (o: Loose): void => {
    if (opts.views) only6(opts.views)(o);
    opts.cfgFn?.(o);
  };
  const config = cfg6(viewsFn);
  const data = data6(config, opts.dataFn);
  return mkEngine(renderer, { config, data, clock: opts.clock ?? (() => new Date(NOW)) });
}

// --- contract functions that the ficha adds (read from the public entry) ---
const mod = engineModule as unknown as Record<string, unknown>;

export function stageOf(task: unknown): "todo" | "doing" | "done" {
  const fn = mod.stageOf;
  if (typeof fn !== "function") throw new Error("stageOf no está exportada por engine/index.ts");
  return fn(task);
}
export function staleLabel(
  readAt: Date | undefined,
  now: Date,
  timeZone: string,
): string | undefined {
  const fn = mod.staleLabel;
  if (typeof fn !== "function") throw new Error("staleLabel no está exportada por engine/index.ts");
  return fn(readAt, now, timeZone);
}
export function setSourceAt(
  engine: Engine,
  id: string,
  items: unknown,
  readAt?: Date,
): ReturnType<Engine["setSource"]> {
  const loose = engine as unknown as {
    setSource: (...args: unknown[]) => ReturnType<Engine["setSource"]>;
  };
  return loose.setSource(id, items, readAt ? { readAt } : undefined);
}

let seq = 0;
export const act6 = (view: string, zone: string, a: "toggle" | "open"): Action => ({
  id: `acc-f006-${String(++seq).padStart(6, "0")}`,
  view,
  zone,
  act: a,
  at: 1_790_000_000,
});

export const rect = (z: Zone): { x: number; y: number; w: number; h: number } => ({
  x: z.x,
  y: z.y,
  w: z.w,
  h: z.h,
});
/** Zone id of a task of the `tablero` source in a view. */
export const zid = (view: string, id: string): string => engineModule.zoneId(view, "tablero", id);
