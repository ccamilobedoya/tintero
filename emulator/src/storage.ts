/* eslint-disable security/detect-non-literal-fs-filename -- every path is built from the configured store and contract-validated view ids */
// The simulated flash (F-002): files under `config.store`, with a size cap.
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  validateActionsRequest,
  validateIndex,
  validateZones,
  type Action,
  type IndexResponse,
  type Panel,
  type ZonesResponse,
} from "../../contract/src/index.ts";

export interface ViewMeta {
  hash: string;
  crc32: string;
  bytes: number;
}
export interface DeviceState {
  current: string | null;
  focus: string | null;
}
export interface StoredView {
  raw1: Buffer;
  zones: ZonesResponse;
  meta: ViewMeta;
}

const SUFFIXES = [".raw1", ".zones.json", ".meta.json"] as const;
const MAX_LOCAL_JSON = 1_048_576; // local files are ours, but are still capped before parsing

export class Flash {
  private readonly root: string;
  private readonly flashBytes: number;

  constructor(root: string, flashBytes: number) {
    this.root = root;
    this.flashBytes = flashBytes;
  }

  private path(...parts: string[]): string {
    return join(this.root, ...parts);
  }

  private async readCapped(path: string, max: number): Promise<Buffer | null> {
    try {
      if ((await stat(path)).size > max) return null;
      return await readFile(path);
    } catch {
      return null;
    }
  }

  private async atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
    const tmp = `${path}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, path);
  }

  async init(): Promise<void> {
    await mkdir(this.path("views"), { recursive: true });
  }

  // --- index, state, screen ---------------------------------------------------------------

  async readIndex(): Promise<IndexResponse | null> {
    const raw = await this.readCapped(this.path("index.json"), 4096);
    if (!raw) return null;
    const result = validateIndex(raw.toString("utf8"));
    return result.ok ? result.value : null;
  }

  async writeIndex(index: IndexResponse): Promise<void> {
    await this.init();
    await this.atomicWrite(this.path("index.json"), JSON.stringify(index));
  }

  async readState(): Promise<DeviceState> {
    const empty: DeviceState = { current: null, focus: null };
    const raw = await this.readCapped(this.path("state.json"), 4096);
    if (!raw) return empty;
    try {
      const parsed = JSON.parse(raw.toString("utf8")) as Partial<DeviceState>;
      return {
        current: typeof parsed.current === "string" ? parsed.current : null,
        focus: typeof parsed.focus === "string" ? parsed.focus : null,
      };
    } catch {
      return empty;
    }
  }

  async writeState(state: DeviceState): Promise<void> {
    await this.init();
    await this.atomicWrite(this.path("state.json"), JSON.stringify(state));
  }

  async readScreen(): Promise<Buffer | null> {
    return this.readCapped(this.path("screen.raw1"), MAX_LOCAL_JSON);
  }

  async writeScreen(raw1: Uint8Array, png: Uint8Array): Promise<void> {
    await this.init();
    await this.atomicWrite(this.path("screen.raw1"), raw1);
    await this.atomicWrite(this.path("screen.png"), png);
  }

  // --- views ------------------------------------------------------------------------------

  /** Ids with all three files. */
  async listViews(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.path("views"));
    } catch {
      return [];
    }
    const set = new Set(names);
    return names
      .filter((name) => name.endsWith(".raw1"))
      .map((name) => name.slice(0, -".raw1".length))
      .filter((id) => SUFFIXES.every((suffix) => set.has(`${id}${suffix}`)));
  }

  async readMeta(id: string): Promise<ViewMeta | null> {
    const raw = await this.readCapped(this.path("views", `${id}.meta.json`), 4096);
    if (!raw) return null;
    try {
      const meta = JSON.parse(raw.toString("utf8")) as Partial<ViewMeta>;
      if (
        typeof meta.hash === "string" &&
        typeof meta.crc32 === "string" &&
        typeof meta.bytes === "number"
      ) {
        return { hash: meta.hash, crc32: meta.crc32, bytes: meta.bytes };
      }
    } catch {
      // falls through
    }
    return null;
  }

  async readView(id: string, panel: Panel): Promise<StoredView | null> {
    const meta = await this.readMeta(id);
    const raw1 = await this.readCapped(this.path("views", `${id}.raw1`), MAX_LOCAL_JSON);
    const zonesRaw = await this.readCapped(this.path("views", `${id}.zones.json`), 4096);
    if (!meta || !raw1 || !zonesRaw) return null;
    const zones = validateZones(zonesRaw.toString("utf8"), panel);
    return zones.ok ? { raw1, zones: zones.value, meta } : null;
  }

  async deleteView(id: string): Promise<void> {
    // The meta goes first, so a half-deleted view is never counted as stored.
    for (const suffix of [".meta.json", ".zones.json", ".raw1"]) {
      await rm(this.path("views", `${id}${suffix}`), { force: true });
    }
  }

  private async sizeOf(path: string): Promise<number> {
    try {
      return (await stat(path)).size;
    } catch {
      return 0;
    }
  }

  private async viewSize(id: string): Promise<number> {
    let total = 0;
    for (const suffix of SUFFIXES) total += await this.sizeOf(this.path("views", `${id}${suffix}`));
    return total;
  }

  /** Bytes used by `views/*` and `queue.json`. */
  async usedBytes(): Promise<number> {
    let total = await this.sizeOf(this.path("queue.json"));
    let names: string[] = [];
    try {
      names = await readdir(this.path("views"));
    } catch {
      // empty flash
    }
    for (const name of names) total += await this.sizeOf(this.path("views", name));
    return total;
  }

  /**
   * Evicts stored views to make `needed` more bytes fit. Only views farther than `limit` (by
   * distance from the current view, in index order) go, farthest first; never `keep` ones.
   */
  private async makeRoom(
    needed: number,
    distances: Map<string, number>,
    limit: number,
    keep: string,
  ): Promise<boolean> {
    if ((await this.usedBytes()) + needed <= this.flashBytes) return true;
    const stored = await this.listViews();
    const victims = stored
      .filter((id) => id !== keep && (distances.get(id) ?? Infinity) > limit)
      .sort((a, b) => (distances.get(b) ?? Infinity) - (distances.get(a) ?? Infinity));
    for (const id of victims) {
      await this.deleteView(id);
      if ((await this.usedBytes()) + needed <= this.flashBytes) return true;
    }
    return (await this.usedBytes()) + needed <= this.flashBytes;
  }

  /**
   * Stores a view atomically. `distances` maps each view id to its distance from the current one;
   * returns false (nothing stored) when it cannot fit.
   */
  async saveView(
    id: string,
    raw1: Uint8Array,
    zones: ZonesResponse,
    meta: ViewMeta,
    distances: Map<string, number>,
  ): Promise<boolean> {
    await this.init();
    const zonesText = JSON.stringify(zones);
    const metaText = JSON.stringify(meta);
    const needed = raw1.length + Buffer.byteLength(zonesText) + Buffer.byteLength(metaText);
    // A view being replaced frees its own space.
    const own = await this.viewSize(id);
    const limit = distances.get(id) ?? Infinity;
    if (!(await this.makeRoom(needed - own, distances, limit, id))) return false;
    const base = this.path("views", id);
    await writeFile(`${base}.raw1.tmp`, raw1);
    await writeFile(`${base}.zones.json.tmp`, zonesText);
    await writeFile(`${base}.meta.json.tmp`, metaText);
    await rm(`${base}.meta.json`, { force: true });
    await rename(`${base}.raw1.tmp`, `${base}.raw1`);
    await rename(`${base}.zones.json.tmp`, `${base}.zones.json`);
    await rename(`${base}.meta.json.tmp`, `${base}.meta.json`);
    return true;
  }

  // --- queue ------------------------------------------------------------------------------

  async readQueue(): Promise<Action[]> {
    const raw = await this.readCapped(this.path("queue.json"), MAX_LOCAL_JSON);
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    // The contract validates up to 8 actions at a time; the queue itself can be longer.
    const actions: Action[] = [];
    for (let i = 0; i < parsed.length; i += 8) {
      const chunk = validateActionsRequest(JSON.stringify({ actions: parsed.slice(i, i + 8) }));
      if (chunk.ok) actions.push(...chunk.value.actions);
    }
    return actions;
  }

  /** Writes the queue; false when it cannot fit even after evicting every other view. */
  async writeQueue(
    actions: Action[],
    distances: Map<string, number>,
    current: string | null,
  ): Promise<boolean> {
    await this.init();
    const path = this.path("queue.json");
    if (actions.length === 0) {
      await rm(path, { force: true });
      return true;
    }
    const text = JSON.stringify(actions);
    const needed = Buffer.byteLength(text) - (await this.sizeOf(path));
    if (!(await this.makeRoom(needed, distances, -1, current ?? ""))) return false;
    await this.atomicWrite(path, text);
    return true;
  }
}
