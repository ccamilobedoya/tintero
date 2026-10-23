// Steps shared by wakes and key presses: index, queue, downloads and the screen.
import {
  checkImage,
  LIMITS,
  validateActionsResponse,
  validateIndex,
  validateZones,
  type IndexResponse,
  type ViewSummary,
} from "../../contract/src/index.ts";
import { HttpFailure, type HttpClient } from "./http.ts";
import { encodePng1 } from "./png.ts";
import { renderScreen } from "./screen.ts";
import type { DeviceState, Flash } from "./storage.ts";
import type { EmulatorConfig, EmulatorError } from "./types.ts";

export interface Ctx {
  config: EmulatorConfig;
  client: HttpClient;
  flash: Flash;
  errors: EmulatorError[];
}

const SMALL_BODY = 4096; // answers to actions and logs
const INDEX_PATH = "/api/v1/index";

export type IndexResult =
  | { kind: "ok"; index: IndexResponse }
  | { kind: "mismatch"; index: IndexResponse }
  | { kind: "fail" };

/** Distance of each view from `center` going forward in index order (circular). */
export function distancesFrom(index: IndexResponse, center: string): Map<string, number> {
  const count = index.views.length;
  const start = Math.max(
    0,
    index.views.findIndex((view) => view.id === center),
  );
  const distances = new Map<string, number>();
  index.views.forEach((view, i) => {
    distances.set(view.id, (i - start + count) % count);
  });
  return distances;
}

/** GET index with the size cap applied before parsing; reports its own errors. */
export async function fetchIndex(ctx: Ctx): Promise<IndexResult> {
  let res;
  try {
    res = await ctx.client.get(INDEX_PATH, LIMITS.maxIndexBytes);
  } catch (error) {
    ctx.errors.push({ code: error instanceof HttpFailure ? error.code : "network" });
    return { kind: "fail" };
  }
  if (res.status !== 200) {
    ctx.errors.push({ code: "network" });
    return { kind: "fail" };
  }
  const parsed = validateIndex(res.body.toString("utf8"));
  if (!parsed.ok) {
    ctx.errors.push({ code: "index_invalid" });
    return { kind: "fail" };
  }
  const index = parsed.value;
  const [a, b] = [index.panel, ctx.config.panel];
  const same = a.w === b.w && a.h === b.h && a.dpi === b.dpi;
  if (!same) {
    ctx.errors.push({ code: "panel_mismatch" });
    return { kind: "mismatch", index };
  }
  await ctx.flash.writeIndex(index);
  return { kind: "ok", index };
}

/** Step 4: forget the views that are no longer in the index. */
export async function deleteGone(ctx: Ctx, index: IndexResponse): Promise<void> {
  const wanted = new Set(index.views.map((view) => view.id));
  for (const id of await ctx.flash.listViews()) {
    if (!wanted.has(id)) await ctx.flash.deleteView(id);
  }
}

/** Sends the queue in batches of 8. `ok` is false when the network failed. */
export async function sendQueue(ctx: Ctx): Promise<{ ok: boolean; changed: boolean }> {
  let changed = false;
  let queue = await ctx.flash.readQueue();
  while (queue.length > 0) {
    const batch = queue.slice(0, LIMITS.maxActions);
    let res;
    try {
      res = await ctx.client.post("/api/v1/actions", { actions: batch }, SMALL_BODY);
    } catch (error) {
      ctx.errors.push({ code: error instanceof HttpFailure ? error.code : "network" });
      return { ok: false, changed };
    }
    const parsed = res.status === 200 ? validateActionsResponse(res.body.toString("utf8")) : null;
    if (!parsed?.ok) {
      ctx.errors.push({ code: "network" });
      return { ok: false, changed };
    }
    const done = new Set(parsed.value.results.map((result) => result.id));
    if (parsed.value.index_changed) changed = true;
    const before = queue.length;
    queue = queue.filter((action) => !done.has(action.id));
    await ctx.flash.writeQueue(queue, new Map(), null);
    if (queue.length === before) break; // the server answered nothing useful; do not loop
  }
  return { ok: true, changed };
}

export type DownloadResult = "ok" | "stale" | "failed" | "abort";

/** Image then zones of one view; reports its own errors (except a 409, left to the caller). */
export async function downloadView(
  ctx: Ctx,
  index: IndexResponse,
  summary: ViewSummary,
  center: string,
): Promise<DownloadResult> {
  const { panel } = ctx.config;
  const view = summary.id;
  const fail = (code: EmulatorError["code"]): "failed" => {
    ctx.errors.push({ code, view });
    return "failed";
  };
  if (summary.format !== "raw1") return fail("bad_image");
  const query = `?h=${summary.hash}`;
  let image;
  try {
    image = await ctx.client.get(
      `/api/v1/views/${view}/image${query}`,
      Math.min(summary.bytes, LIMITS.maxImageBytes),
    );
  } catch (error) {
    const code = error instanceof HttpFailure ? error.code : "network";
    ctx.errors.push({ code, view });
    return code === "network" ? "abort" : "failed";
  }
  if (image.status === 409) return "stale";
  if (image.status !== 200) {
    ctx.errors.push({ code: "network", view });
    return "abort";
  }
  const checked = checkImage("raw1", image.body, panel, summary.crc32);
  if (!checked.ok) {
    const codes = checked.errors.map((error) => error.code);
    return fail(
      codes.includes("crc_mismatch") && codes.length === 1 ? "crc_mismatch" : "bad_image",
    );
  }
  let zonesRes;
  try {
    zonesRes = await ctx.client.get(`/api/v1/views/${view}/zones${query}`, LIMITS.maxZonesBytes);
  } catch (error) {
    const code = error instanceof HttpFailure ? error.code : "network";
    ctx.errors.push({ code, view });
    return code === "network" ? "abort" : "failed";
  }
  if (zonesRes.status === 409) return "stale";
  if (zonesRes.status !== 200) {
    ctx.errors.push({ code: "network", view });
    return "abort";
  }
  const zones = validateZones(zonesRes.body.toString("utf8"), panel);
  if (!zones.ok) return fail("zones_invalid");
  const saved = await ctx.flash.saveView(
    view,
    image.body,
    zones.value,
    { hash: summary.hash, crc32: summary.crc32, bytes: summary.bytes },
    distancesFrom(index, center),
  );
  return saved ? "ok" : fail("flash_full");
}

/** Draws `state.current` (with its focus frame) into screen.raw1 / screen.png and saves state. */
export async function paint(ctx: Ctx, state: DeviceState): Promise<DeviceState> {
  const { panel } = ctx.config;
  const view = state.current === null ? null : await ctx.flash.readView(state.current, panel);
  if (!view) {
    await ctx.flash.writeState(state);
    return state;
  }
  const zone = view.zones.zones.find((candidate) => candidate.id === state.focus);
  const next: DeviceState = { current: state.current, focus: zone?.id ?? null };
  const raw1 = renderScreen(view.raw1, panel, zone);
  await ctx.flash.writeScreen(raw1, encodePng1(raw1, panel));
  await ctx.flash.writeState(next);
  return next;
}
