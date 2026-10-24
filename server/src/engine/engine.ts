// The view engine: which views each device has, what is drawn, the shared cache and the draw
// queue (D6). Drawing goes through a `Renderer`; the engine never knows which one.
import { createHash } from "node:crypto";
import {
  crc32Hex,
  LIMITS,
  type Action,
  type Panel,
  type Zone,
} from "../../../contract/src/index.ts";
import {
  ConfigError,
  parseItems,
  type CalendarEvent,
  type DataFile,
  type Source,
  type Task,
  type ViewDef,
  type ViewsConfig,
} from "./config.ts";
import type { Renderer } from "./chromium.ts";
import { dayKey, localParts } from "./dates.ts";
import { buildDetailView, buildView, zoneId, type BuiltView } from "./view.ts";
import { checkThemeGlyphs } from "./theme.ts";

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
  ): Promise<EngineResult<{ current: string; views: RenderedView[] }>>;
  view(device: string, panel: Panel, id: string, hash: string): EngineResult<RenderedView>;
  apply(
    device: string,
    action: Action,
  ): { status: "applied" | "duplicate" | "stale"; changed: boolean };
  setSource(
    id: string,
    items: unknown,
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
}

type Entry = Omit<RenderedView, "id" | "parent">;

interface Job {
  key: string;
  descriptor: Descriptor;
  panel: Panel;
  at: Date;
  sources: Record<string, Source>;
  finish(): void;
}

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

  function keyOf(d: Descriptor, panel: Panel, at: Date): string {
    const today = dayKey(localParts(at, config.timezone).day);
    const used = d.detail
      ? [d.detail.sourceId]
      : [...new Set(Object.values(d.def.slots).map((slot) => slot.source))];
    return sha(
      JSON.stringify([
        d.detail ? ["detail", d.parent, d.detail.itemId] : (defJson.get(d.id) ?? ""),
        "base",
        config.timezone,
        used.map((id) => [id, digestOf(id)]),
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
      const input = { panel, config, sources: job.sources, at: job.at };
      const built: BuiltView = d.detail
        ? buildDetailView({ ...input, ...d.detail })
        : buildView(d.def, input);
      const out = await renderer.render(built.html, panel);
      const zones: Zone[] = [];
      for (const spec of built.zones) {
        const box = out.boxes.find((candidate) => candidate.key === spec.id);
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
      const hash = createHash("sha256")
        .update(out.raw1)
        .update(JSON.stringify(zones))
        .digest("hex")
        .slice(0, 16);
      const entry: Entry = {
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
      queue.push({ key, descriptor: d, panel, at, sources, finish: resolve });
    });
    pending.set(key, done);
    void pump();
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
    const guarded: Renderer = {
      render: (html, p) =>
        closed ? Promise.reject(new Error("closed")) : renderer.render(html, p),
      blockedRequests: () => renderer.blockedRequests(),
      close: () => Promise.resolve(),
    };
    // After the pending draws, and outside the queue that `idle()` waits for.
    void idle()
      .then(() => checkThemeGlyphs(guarded, panel))
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

    if (action.act === "toggle" && target.block === "task-list" && !target.readonly) {
      const source = sources[target.sourceId];
      if (source?.type !== "tasks") return { status: "stale", changed: false } as const;
      replaceSource(target.sourceId, {
        ...source,
        items: source.items.map((task) =>
          task.id === target.itemId ? { ...task, done: !task.done } : task,
        ),
      });
      enqueueWhere((d) => usesSource(d, target.sourceId));
      return { status: "applied", changed: true } as const;
    }

    const opens =
      target.block === "agenda" ||
      target.block === "issue-list" ||
      (target.block === "task-list" && target.readonly);
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
    async index(device, panel) {
      const state = stateOf(device);
      const now = clock();
      state.lastIndexMs = now.getTime();
      state.panels.set(panelKey(panel), panel);
      const list = descriptors(device);
      const wanted = list.map((d) => ({ d, ...ensure(d, panel, now) }));
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
      const current = state.justOpened && detail ? detail.id : (first?.id ?? "");
      state.justOpened = false;
      return { ok: true, value: { current, views } };
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

    setSource(id, items) {
      const source = ownSource(id);
      if (!source) return { ok: false, error: "unknown source" };
      let parsed: Task[] | CalendarEvent[];
      try {
        parsed = parseItems("items", source.type, items, "");
      } catch (error) {
        // ConfigError carries only a pointer and a reason, never a value.
        return { ok: false, error: error instanceof ConfigError ? error.message : "invalid items" };
      }
      if (JSON.stringify(parsed) === JSON.stringify(source.items)) {
        return { ok: true, changed: false };
      }
      replaceSource(id, { ...source, items: parsed } as Source);
      enqueueWhere((d) => usesSource(d, id));
      return { ok: true, changed: true };
    },

    prewarm() {
      const now = clock();
      for (const [device, state] of devices) {
        if (state.lastIndexMs === undefined) continue;
        const wake = state.lastIndexMs + options.nextWakeS * 1000;
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
