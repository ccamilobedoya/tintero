// The view engine: which views each device has, what is drawn, the shared cache and the draw
// queue (D6). Drawing goes through a `Renderer`; the engine never knows which one.
import { createHash } from "node:crypto";
import {
  checkFocusBand,
  crc32Hex,
  LIMITS,
  type Action,
  type Panel,
  type Zone,
} from "../../../contract/src/index.ts";
import {
  ConfigError,
  parseItems,
  stageOf,
  type CalendarEvent,
  type DataFile,
  type Source,
  type Stage,
  type Task,
  type ViewDef,
  type ViewsConfig,
} from "./config.ts";
import type { Renderer } from "./chromium.ts";
import { dayKey, localParts, staleLabel, validDate } from "./dates.ts";
import { applyCorrections, type Holiday } from "./holidays.ts";
import { messages } from "./i18n/index.ts";
import { buildDetailView, buildView, zoneId, type BuiltView } from "./view.ts";
import { checkThemeGlyphs, themeMetrics } from "./theme.ts";

/** What a `toggle` changed in a task with a stage (F-009): the integration writes it back. */
export interface ToggleChange {
  sourceId: string;
  taskId: string;
  stage: Stage;
  previous: Stage;
}

export interface EngineOptions {
  config: ViewsConfig;
  data: DataFile;
  renderer: Renderer;
  clock?: () => Date;
  renderWaitMs?: number;
  nextWakeS: number;
  prewarmLeadS?: number;
  /** Receives one line per draw (no content), and the theme glyph problems. */
  log?: (line: Record<string, unknown>) => void;
  /** Called once after a `toggle` was applied to a task with a stage. */
  onToggle?: (change: ToggleChange) => void;
}

export interface RenderedView {
  id: string;
  parent?: string;
  raw1: Uint8Array;
  zones: Zone[];
  hash: string;
  crc32: string;
  hidden: Record<string, number>;
  overflow: string[];
  tooSmall: string[];
  /** Zones with ink in their blank band (F-008); it should always be empty. */
  bandInk: string[];
  /** The focus ring measures of the panel (sent in the zones response). */
  focus: { ring: number; pad: number; dash: number };
}

export type EngineError =
  | { status: 404; code: "unknown_view" }
  | { status: 409; code: "stale_view" }
  | { status: 503; code: "busy"; retryAfterS: 5 };
export type EngineResult<T> = { ok: true; value: T } | ({ ok: false } & EngineError);

export interface Engine {
  index(
    device: string,
    panel: Panel,
    options?: { view?: string; wakeS?: number },
  ): Promise<EngineResult<{ current: string; views: RenderedView[]; fullRefresh: boolean }>>;
  view(device: string, panel: Panel, id: string, hash: string): EngineResult<RenderedView>;
  apply(
    device: string,
    action: Action,
  ): { status: "applied" | "duplicate" | "stale"; changed: boolean };
  setSource(
    id: string,
    items: unknown,
    meta?: { readAt?: Date },
  ): { ok: true; changed: boolean } | { ok: false; error: string };
  /** Replaces the public holidays of the country (F-013); the owner's corrections are applied here. */
  setHolidays(
    items: unknown,
    meta?: { readAt?: Date },
  ): { ok: true; changed: boolean } | { ok: false; error: string };
  prewarm(): Promise<void>;
  idle(): Promise<void>;
  renders(): number;
  close(): Promise<void>;
}

const CACHE_LIMIT = 256;
const SEEN_LIMIT = 1000;
const BUSY = { ok: false, status: 503, code: "busy", retryAfterS: 5 } as const;

interface Descriptor {
  id: string;
  parent?: string;
  def: ViewDef;
  /** Only for a detail view. */
  detail?: { sourceId: string; itemId: string };
}

interface DeviceState {
  panels: Map<string, Panel>;
  open?: { viewId: string; sourceId: string; itemId: string };
  justOpened: boolean;
  lastIndexMs: number | undefined;
  /** Wake interval (s) the last `index` announced; none → `EngineOptions.nextWakeS`. */
  wakeS?: number | undefined;
  /** Local day of the last `index` that answered, for the daily `full_refresh`. */
  fullDay?: string;
}

type Entry = Omit<RenderedView, "id" | "parent">;

interface Job {
  key: string;
  descriptor: Descriptor;
  panel: Panel;
  at: Date;
  sources: Record<string, Source>;
  holidays: ReadonlyMap<string, string>;
  stale: Record<string, string>;
  finish(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const panelKey = (panel: Panel): string => `${panel.w}x${panel.h}@${panel.dpi}`;
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

const DETAIL_DEF = (parent: ViewDef): ViewDef => ({
  id: `${parent.id}-d`,
  title: "Detalle",
  grid: { columns: [100], rows: [100], areas: [["detalle"]] },
  slots: {},
});

export function createEngine(options: EngineOptions): Engine {
  const { config, renderer } = options;
  const clock = options.clock ?? ((): Date => new Date());
  const renderWaitMs = options.renderWaitMs ?? 2000;
  const prewarmLeadMs = (options.prewarmLeadS ?? 60) * 1000;
  const log = options.log ?? ((): void => undefined);

  // Data: a source is replaced, never edited, so a snapshot of the record is stable.
  let sources: Record<string, Source> = { ...options.data.sources };
  const ownSource = (id: string): Source | undefined =>
    Object.hasOwn(sources, id)
      ? // eslint-disable-next-line security/detect-object-injection -- guarded by hasOwn
        sources[id]
      : undefined;
  const digests = new Map<string, string>();
  const digestOf = (id: string): string => {
    let found = digests.get(id);
    if (found === undefined) {
      found = sha(JSON.stringify(ownSource(id) ?? null));
      digests.set(id, found);
    }
    return found;
  };
  const replaceSource = (id: string, source: Source): void => {
    sources = { ...sources, [id]: source };
    digests.delete(id);
  };

  // Public holidays already corrected (F-013); replaced, never edited.
  let holidays: ReadonlyMap<string, string> = new Map();
  let holidaysDigest = sha(JSON.stringify([...holidays]));

  // Last good read of each source.
  const readAts = new Map<string, Date>();

  const deviceViews = new Map(Object.entries(config.devices));
  const defs = new Map(config.views.map((view) => [view.id, view]));
  const defJson = new Map(config.views.map((view) => [view.id, JSON.stringify(view)]));
  const devices = new Map<string, DeviceState>();
  const cache = new Map<string, Entry>();
  const lastGood = new Map<string, Entry>();
  const pending = new Map<string, Promise<void>>();
  const queue: Job[] = [];
  const waiters: (() => void)[] = [];
  const seen = new Set<string>();
  const glyphChecked = new Set<number>();
  let running = false;
  let closed = false;
  let drawn = 0;

  const stateOf = (device: string): DeviceState => {
    let found = devices.get(device);
    if (!found) {
      found = { panels: new Map(), justOpened: false, lastIndexMs: undefined };
      devices.set(device, found);
    }
    return found;
  };

  function descriptors(device: string): Descriptor[] {
    const entry = deviceViews.get(device) ?? deviceViews.get("*");
    const list: Descriptor[] = [];
    for (const id of entry?.views ?? []) {
      const def = defs.get(id);
      if (def) list.push({ id, def });
    }
    const open = devices.get(device)?.open;
    const parent = open === undefined ? undefined : defs.get(open.viewId);
    if (open && parent && list.some((d) => d.id === parent.id)) {
      list.push({
        id: `${parent.id}-d`,
        parent: parent.id,
        def: DETAIL_DEF(parent),
        detail: { sourceId: open.sourceId, itemId: open.itemId },
      });
    }
    return list;
  }

  const usedSources = (d: Descriptor): string[] =>
    d.detail
      ? [d.detail.sourceId]
      : [
          ...new Set(
            Object.values(d.def.slots).flatMap((slot) =>
              slot.source === undefined ? [] : [slot.source],
            ),
          ),
        ];

  const usesCalendar = (d: Descriptor): boolean =>
    !d.detail && Object.values(d.def.slots).some((slot) => slot.block === "month-calendar");

  /** The "sin datos desde" notice of each used source, as of `at`. */
  function staleFor(d: Descriptor, at: Date): Record<string, string> {
    const out = new Map<string, string>();
    for (const id of usedSources(d)) {
      const label = staleLabel(readAts.get(id), at, config.timezone, messages(config.locale));
      if (label !== undefined) out.set(id, label);
    }
    return Object.fromEntries(out);
  }

  function keyOf(d: Descriptor, panel: Panel, at: Date): string {
    const today = dayKey(localParts(at, config.timezone).day);
    const used = usedSources(d);
    const stale = staleFor(d, at);
    return sha(
      JSON.stringify([
        d.detail ? ["detail", d.parent, d.detail.itemId] : (defJson.get(d.id) ?? ""),
        "base",
        config.timezone,
        config.locale,
        used.map((id) => [id, digestOf(id), Object.hasOwn(stale, id) ? stale[id] : null]), // eslint-disable-line security/detect-object-injection -- guarded by hasOwn
        usesCalendar(d) ? holidaysDigest : null,
        today,
        [panel.w, panel.h, panel.dpi],
      ]),
    );
  }

  function touch(key: string): Entry | undefined {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key); // re-insert: the Map keeps the least recently used first
      cache.set(key, hit);
    }
    return hit;
  }

  function store(key: string, entry: Entry): void {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  }

  async function draw(job: Job): Promise<void> {
    const { descriptor: d, panel } = job;
    const started = Date.now();
    drawn++;
    const lastKey = `${d.id}|${panelKey(panel)}`;
    try {
      const input = {
        panel,
        config,
        sources: job.sources,
        holidays: job.holidays,
        at: job.at,
        stale: job.stale,
      };
      const built: BuiltView = d.detail
        ? buildDetailView({ ...input, ...d.detail })
        : buildView(d.def, input);
      const out = await renderer.render(built.html, panel);
      const zones: Zone[] = [];
      let unaligned = false;
      for (const spec of built.zones) {
        const box = out.boxes.find((candidate) => candidate.key === spec.id);
        if (box && (box.x % LIMITS.zoneAlign !== 0 || box.w % LIMITS.zoneAlign !== 0)) {
          unaligned = true;
          continue;
        }
        if (
          box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.w <= panel.w &&
          box.y + box.h <= panel.h &&
          box.w >= LIMITS.minZoneSize &&
          box.h >= LIMITS.minZoneSize
        ) {
          zones.push({ id: spec.id, x: box.x, y: box.y, w: box.w, h: box.h, act: spec.act });
        }
      }
      const metrics = themeMetrics(panel);
      const bandInk = checkFocusBand(out.raw1, panel, zones, metrics.focusPad);
      if (unaligned) log({ event: "zone-unaligned", view: d.id });
      if (bandInk.length > 0) log({ event: "focus-band-ink", view: d.id, count: bandInk.length });
      const hash = createHash("sha256")
        .update(out.raw1)
        .update(JSON.stringify(zones))
        .digest("hex")
        .slice(0, 16);
      const entry: Entry = {
        bandInk,
        focus: { ring: metrics.focusRing, pad: metrics.focusPad, dash: metrics.focusDash },
        raw1: out.raw1,
        zones,
        hash,
        crc32: crc32Hex(out.raw1),
        hidden: built.hidden,
        overflow: out.overflow,
        tooSmall: built.tooSmall,
      };
      store(job.key, entry);
      lastGood.set(lastKey, entry);
      log({
        ts: new Date().toISOString(),
        render: drawn,
        ms: Date.now() - started,
        ok: true,
        ...(out.overflow.length > 0 ? { overflow: out.overflow } : {}),
        ...(built.tooSmall.length > 0 ? { tooSmall: built.tooSmall } : {}),
      });
    } catch {
      // A failed draw keeps the previous image of that view, if there was one.
      const previous = lastGood.get(lastKey);
      if (previous) store(job.key, previous);
      log({ ts: new Date().toISOString(), render: drawn, ms: Date.now() - started, ok: false });
    }
  }

  function notifyIdle(): void {
    for (const resolve of waiters.splice(0)) resolve();
  }

  async function pump(): Promise<void> {
    if (running) return;
    running = true;
    try {
      for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
        if (!closed) await draw(job);
        pending.delete(job.key);
        job.finish();
      }
    } finally {
      running = false;
      notifyIdle();
    }
  }

  /** The cached entry, or the draw that will make it (queued once per key). */
  function ensure(
    d: Descriptor,
    panel: Panel,
    at: Date,
  ): { key: string; entry?: Entry; done?: Promise<void> } {
    const key = keyOf(d, panel, at);
    const hit = touch(key);
    if (hit) return { key, entry: hit };
    const waiting = pending.get(key);
    if (waiting) return { key, done: waiting };
    if (closed) return { key };
    const done = new Promise<void>((resolve) => {
      queue.push({
        key,
        descriptor: d,
        panel,
        at,
        sources,
        holidays,
        stale: staleFor(d, at),
        finish: resolve,
      });
    });
    pending.set(key, done);
    // pump handles its own failures; a rejection here must not stop the process.
    pump().catch(() => undefined);
    return { key, done };
  }

  /** Queues what a change affects, for every device and panel already seen. */
  function enqueueWhere(affects: (d: Descriptor) => boolean, at: Date = clock()): void {
    for (const [device, state] of devices) {
      for (const d of descriptors(device)) {
        if (!affects(d)) continue;
        for (const panel of state.panels.values()) ensure(d, panel, at);
      }
    }
  }

  const usesSource = (d: Descriptor, sourceId: string): boolean =>
    d.detail
      ? d.detail.sourceId === sourceId
      : Object.values(d.def.slots).some((slot) => slot.source === sourceId);

  function startGlyphCheck(panel: Panel): void {
    if (glyphChecked.has(panel.dpi)) return;
    glyphChecked.add(panel.dpi);
    // Probe draws are `low` priority in the renderer (view draws go first, from any engine);
    // after `close()` no further one is requested.
    const guarded: Renderer = {
      render: async (html, p) => {
        if (closed) throw new Error("closed");
        return renderer.render(html, p, { priority: "low" });
      },
      blockedRequests: () => renderer.blockedRequests(),
      close: () => Promise.resolve(),
    };
    void checkThemeGlyphs(guarded, panel)
      .then((problems) => {
        if (problems.length > 0) {
          log({ ts: new Date().toISOString(), theme_glyph_problems: problems.length });
        }
      })
      .catch(() => undefined);
  }

  function idle(): Promise<void> {
    if (!running && queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      waiters.push(resolve);
    });
  }

  const toView = (d: Descriptor, entry: Entry): RenderedView => ({
    id: d.id,
    ...(d.parent === undefined ? {} : { parent: d.parent }),
    ...entry,
  });

  // ---- actions ----

  interface Target {
    descriptor: Descriptor;
    sourceId: string;
    block: string;
    readonly: boolean;
    itemId: string;
  }

  /** Resolves a zone id over every item of the sources of the view (not only the visible ones). */
  function findTarget(device: string, viewId: string, zone: string): Target | undefined {
    const d = descriptors(device).find((candidate) => candidate.id === viewId && !candidate.detail);
    if (!d) return undefined;
    for (const slot of Object.values(d.def.slots)) {
      if (slot.source === undefined) continue;
      const source = Object.hasOwn(sources, slot.source) ? sources[slot.source] : undefined;
      if (!source) continue;
      const items: (Task | CalendarEvent)[] = source.items;
      for (const item of items) {
        if (zoneId(d.id, slot.source, item.id) === zone) {
          return {
            descriptor: d,
            sourceId: slot.source,
            block: slot.block,
            readonly: source.readonly,
            itemId: item.id,
          };
        }
      }
    }
    return undefined;
  }

  function apply(device: string, action: Action) {
    const seenKey = `${device}\n${action.id}`;
    if (seen.has(seenKey)) return { status: "duplicate", changed: false } as const;
    seen.add(seenKey);
    if (seen.size > SEEN_LIMIT) {
      const oldest = seen.values().next();
      if (!oldest.done) seen.delete(oldest.value);
    }
    const target = findTarget(device, action.view, action.zone);
    if (!target) return { status: "stale", changed: false } as const;

    const checkable = target.block === "task-list" || target.block === "task-board";
    if (action.act === "toggle" && checkable && !target.readonly) {
      const source = sources[target.sourceId];
      if (source?.type !== "tasks") return { status: "stale", changed: false } as const;
      const changes: ToggleChange[] = [];
      replaceSource(target.sourceId, {
        ...source,
        items: source.items.map((task) => {
          if (task.id !== target.itemId) return task;
          // F-005 data (no stage) keeps its plain flip in `task-list`.
          if (task.stage === undefined && target.block === "task-list") {
            return { ...task, done: !task.done };
          }
          // D3 (ADR-0055): todo -> doing -> done -> todo.
          const previous = stageOf(task);
          const next: Stage =
            previous === "todo" ? "doing" : previous === "doing" ? "done" : "todo";
          changes.push({ sourceId: target.sourceId, taskId: task.id, stage: next, previous });
          if (next === "done") {
            return { ...task, stage: next, done: true, doneAt: clock().toISOString() };
          }
          const moved: Task = { ...task, stage: next, done: false };
          delete moved.doneAt;
          return moved;
        }),
      });
      enqueueWhere((d) => usesSource(d, target.sourceId));
      const [change] = changes;
      if (change !== undefined && options.onToggle) {
        try {
          options.onToggle(change);
        } catch {
          log({ ts: new Date().toISOString(), event: "onToggle-error" });
        }
      }
      return { status: "applied", changed: true } as const;
    }

    const opens =
      target.block === "agenda" ||
      target.block === "issue-list" ||
      ((target.block === "task-list" || target.block === "task-board") && target.readonly);
    if (action.act === "open" && opens) {
      const state = stateOf(device);
      const before = state.open;
      const same =
        before?.viewId === target.descriptor.id &&
        before.sourceId === target.sourceId &&
        before.itemId === target.itemId;
      const changed = !same || !state.justOpened;
      state.open = {
        viewId: target.descriptor.id,
        sourceId: target.sourceId,
        itemId: target.itemId,
      };
      state.justOpened = true;
      const detailId = `${target.descriptor.id}-d`;
      const at = clock();
      for (const panel of state.panels.values()) {
        const d = descriptors(device).find((candidate) => candidate.id === detailId);
        if (d) ensure(d, panel, at);
      }
      return { status: "applied", changed } as const;
    }
    return { status: "stale", changed: false } as const;
  }

  // ---- public ----

  return {
    async index(device, panel, options) {
      const state = stateOf(device);
      const now = clock();
      state.lastIndexMs = now.getTime();
      state.wakeS = options?.wakeS;
      state.panels.set(panelKey(panel), panel);
      const list = descriptors(device);
      // The view the device shows is queued first; the answer keeps the configured order.
      const shown = options?.view;
      const ordered = [
        ...list.filter((d) => d.id === shown),
        ...list.filter((d) => d.id !== shown),
      ];
      const queued = ordered.map((d) => ({ d, ...ensure(d, panel, now) }));
      const wanted = list.flatMap((d) => queued.filter((w) => w.d === d));
      const dones = wanted.flatMap((w) => (w.done ? [w.done] : []));
      if (dones.length > 0) {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<"late">((resolve) => {
          timer = setTimeout(() => {
            resolve("late");
          }, renderWaitMs);
        });
        const outcome = await Promise.race([
          Promise.all(dones).then(() => "done" as const),
          timeout,
        ]);
        clearTimeout(timer);
        if (outcome === "late") return BUSY;
      }
      const views: RenderedView[] = [];
      for (const w of wanted) {
        const entry = w.entry ?? touch(w.key);
        if (!entry) return BUSY; // the draw failed and there was never an image
        views.push(toView(w.d, entry));
      }
      startGlyphCheck(panel);
      const first = list[0];
      const detail = list.find((d) => d.detail);
      const requested = shown === undefined ? undefined : list.find((d) => d.id === shown);
      const current = state.justOpened && detail ? detail.id : (requested?.id ?? first?.id ?? "");
      state.justOpened = false;
      // First answer of each local day for this device: the next image goes with the slow refresh.
      const day = dayKey(localParts(now, config.timezone).day);
      const fullRefresh = state.fullDay !== day;
      state.fullDay = day;
      return { ok: true, value: { current, views, fullRefresh } };
    },

    view(device, panel, id, hash) {
      const d = descriptors(device).find((candidate) => candidate.id === id);
      if (!d) return { ok: false, status: 404, code: "unknown_view" };
      const entry = touch(keyOf(d, panel, clock()));
      if (!entry) return { ok: false, status: 409, code: "stale_view" };
      // eslint-disable-next-line security/detect-possible-timing-attacks -- the hash is a public fingerprint, not a secret
      if (entry.hash !== hash) return { ok: false, status: 409, code: "stale_view" };
      return { ok: true, value: toView(d, entry) };
    },

    apply,

    setSource(id, items, meta) {
      const source = ownSource(id);
      if (!source) return { ok: false, error: "unknown source" };
      let parsed: Task[] | CalendarEvent[];
      try {
        parsed = parseItems("items", source.type, items, "");
      } catch (error) {
        // ConfigError carries only a pointer and a reason, never a value.
        return { ok: false, error: error instanceof ConfigError ? error.message : "invalid items" };
      }
      const readAt = meta?.readAt;
      if (readAt instanceof Date && !Number.isNaN(readAt.getTime())) readAts.set(id, readAt);
      const changed = JSON.stringify(parsed) !== JSON.stringify(source.items);
      if (changed) replaceSource(id, { ...source, items: parsed } as Source);
      // Queues the views whose key changed (data or notice); a cached key draws nothing.
      enqueueWhere((d) => usesSource(d, id));
      return { ok: true, changed };
    },

    setHolidays(items) {
      const MAX_HOLIDAYS = 400;
      if (!Array.isArray(items) || items.length > MAX_HOLIDAYS) {
        return { ok: false, error: "invalid holidays" };
      }
      const list: Holiday[] = [];
      for (const item of items as unknown[]) {
        const date: unknown = isRecord(item) ? item.date : undefined;
        const name: unknown = isRecord(item) ? item.name : undefined;
        if (
          typeof date !== "string" ||
          !validDate(date) ||
          typeof name !== "string" ||
          name.length < 1 ||
          name.length > 60
        ) {
          return { ok: false, error: "invalid holidays" };
        }
        list.push({ date, name });
      }
      const fixed = applyCorrections(
        list,
        config.holidays?.add ?? [],
        config.holidays?.remove ?? [],
      );
      const digest = sha(JSON.stringify(fixed));
      const changed = digest !== holidaysDigest;
      if (changed) {
        holidays = new Map(fixed.map((item) => [item.date, item.name]));
        holidaysDigest = digest;
        // Queues the views with a calendar; a cached key draws nothing.
        enqueueWhere(usesCalendar);
      }
      return { ok: true, changed };
    },

    prewarm() {
      const now = clock();
      for (const [device, state] of devices) {
        if (state.lastIndexMs === undefined) continue;
        const wake = state.lastIndexMs + (state.wakeS ?? options.nextWakeS) * 1000;
        if (wake - now.getTime() > prewarmLeadMs) continue;
        const at = new Date(Math.max(wake, now.getTime()));
        for (const d of descriptors(device)) {
          for (const panel of state.panels.values()) ensure(d, panel, at);
        }
      }
      return Promise.resolve();
    },

    idle,
    renders: () => drawn,

    async close() {
      closed = true;
      for (const job of queue.splice(0)) {
        pending.delete(job.key);
        job.finish();
      }
      await idle();
      await renderer.close();
    },
  };
}
