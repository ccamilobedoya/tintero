// One wake of the device (F-002, "Una despertada").
import type { IndexResponse } from "../../contract/src/index.ts";
import { HttpClient } from "./http.ts";
import { Flash } from "./storage.ts";
import { deleteGone, downloadView, fetchIndex, paint, sendQueue, type Ctx } from "./sync.ts";
import type { EmulatorConfig, EmulatorError, WakeReport } from "./types.ts";

const MAX_LOG_MSG = 100;

/** Views whose stored hash differs, current first, then circular from after the current. */
async function plan(ctx: Ctx, index: IndexResponse): Promise<IndexResponse["views"]> {
  const start = Math.max(
    0,
    index.views.findIndex((view) => view.id === index.current),
  );
  const ordered = index.views.map((_, i) => index.views[(start + i) % index.views.length]);
  const pending: IndexResponse["views"] = [];
  for (const view of ordered) {
    if (view === undefined) continue;
    const meta = await ctx.flash.readMeta(view.id);
    if (meta?.hash !== view.hash) pending.push(view);
  }
  return pending;
}

async function postLog(ctx: Ctx): Promise<void> {
  // Only ids and codes go out: never content from views or zones (S6).
  const entries = ctx.errors.slice(0, 10).map((error) => ({
    at: Math.floor(Date.now() / 1000),
    level: error.code === "stale_view" || error.code === "flash_full" ? "warn" : "error",
    msg: `${error.code}${error.view === undefined ? "" : ` view=${error.view}`}`.slice(
      0,
      MAX_LOG_MSG,
    ),
  }));
  try {
    await ctx.client.post("/api/v1/log", { entries }, 4096);
  } catch {
    // the request is already in the record; a failed log changes nothing
  }
}

export async function runWake(config: EmulatorConfig): Promise<WakeReport> {
  const client = new HttpClient(config);
  const flash = new Flash(config.store, config.flashBytes);
  const errors: EmulatorError[] = [];
  const ctx: Ctx = { config, client, flash, errors };
  try {
    await flash.init();
    client.view = (await flash.readState()).current;
    const downloaded: string[] = [];
    const nextWakeS = await wake(ctx, downloaded);
    if (errors.some((error) => error.code !== "network")) await postLog(ctx);
    const state = await flash.readState();
    return {
      requests: client.records,
      downloaded,
      current: state.current,
      nextWakeS,
      errors,
      connections: client.connections,
    };
  } finally {
    client.close();
  }
}

/** Returns the seconds until the next wake. */
async function wake(ctx: Ctx, downloaded: string[]): Promise<number> {
  const { config, flash } = ctx;
  const first = await fetchIndex(ctx);
  if (first.kind === "fail") return config.fallbackWakeS;
  if (first.kind === "mismatch") return first.index.next_wake_s;
  let index = first.index;
  let nextWakeS = index.next_wake_s;
  await deleteGone(ctx, index);

  // Pending actions go before any download.
  const sent = await sendQueue(ctx);
  let go = sent.ok;
  if (go && sent.changed) {
    const again = await fetchIndex(ctx);
    if (again.kind === "ok") {
      index = again.index;
      nextWakeS = index.next_wake_s;
      await deleteGone(ctx, index);
    } else {
      go = false;
      nextWakeS = again.kind === "fail" ? config.fallbackWakeS : again.index.next_wake_s;
    }
  }

  let staleRetried = false;
  let extras = 0;
  while (go) {
    let restart = false;
    for (const summary of await plan(ctx, index)) {
      if (summary.id !== index.current && config.power === "battery") {
        if (extras >= config.extraViewsPerWake) continue;
        extras++;
      }
      const result = await downloadView(ctx, index, summary, index.current);
      if (result === "ok") {
        downloaded.push(summary.id);
      } else if (result === "abort") {
        go = false;
        break;
      } else if (result === "stale") {
        if (staleRetried) {
          ctx.errors.push({ code: "stale_view", view: summary.id });
          go = false;
          break;
        }
        staleRetried = true;
        const again = await fetchIndex(ctx);
        if (again.kind !== "ok") {
          go = false;
          nextWakeS = again.kind === "fail" ? config.fallbackWakeS : again.index.next_wake_s;
          break;
        }
        index = again.index;
        nextWakeS = index.next_wake_s;
        await deleteGone(ctx, index);
        restart = true;
        break;
      }
    }
    if (!restart) break;
  }

  // Screen: shows the server's current view if it is stored; otherwise nothing changes.
  const state = await flash.readState();
  if (await flash.readMeta(index.current)) {
    const keepFocus = state.current === index.current ? state.focus : null;
    await paint(ctx, { current: index.current, focus: keepFocus });
  }
  return nextWakeS;
}
