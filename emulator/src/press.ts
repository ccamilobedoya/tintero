// The four key presses of the device (F-002, "Los toques").
import { randomInt } from "node:crypto";
import type { Action, IndexResponse } from "../../contract/src/index.ts";
import { HttpClient } from "./http.ts";
import { Flash } from "./storage.ts";
import {
  deleteGone,
  distancesFrom,
  downloadView,
  fetchIndex,
  paint,
  sendQueue,
  type Ctx,
} from "./sync.ts";
import type { EmulatorConfig, Key, PressReport } from "./types.ts";
import { runWake } from "./wake.ts";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function actionId(): string {
  let id = "";
  for (let i = 0; i < 12; i++) id += ALPHABET.charAt(randomInt(ALPHABET.length));
  return id;
}

/** Makes `id` the current view, downloading it first if it is not stored. */
async function showView(ctx: Ctx, index: IndexResponse, id: string): Promise<void> {
  const summary = index.views.find((view) => view.id === id);
  if (!summary) return;
  if (!(await ctx.flash.readMeta(id))) {
    const result = await downloadView(ctx, index, summary, id);
    if (result === "stale") ctx.errors.push({ code: "stale_view", view: id });
    if (result !== "ok") return;
  }
  await paint(ctx, { current: id, focus: null });
}

async function onOk(
  ctx: Ctx,
  index: IndexResponse,
  current: string,
  focus: string | null,
): Promise<void> {
  const stored = await ctx.flash.readView(current, ctx.config.panel);
  const zone = stored?.zones.zones.find((candidate) => candidate.id === focus);
  if (!zone) return;
  const action: Action = {
    id: actionId(),
    view: current,
    zone: zone.id,
    act: zone.act,
    at: Math.floor(Date.now() / 1000),
  };
  const queue = [...(await ctx.flash.readQueue()), action];
  if (!(await ctx.flash.writeQueue(queue, distancesFrom(index, current), current))) {
    ctx.errors.push({ code: "flash_full" });
    return;
  }
  const sent = await sendQueue(ctx);
  if (!sent.ok || !sent.changed) return;

  const again = await fetchIndex(ctx);
  if (again.kind !== "ok") return;
  await deleteGone(ctx, again.index);
  const summary = again.index.views.find((view) => view.id === again.index.current);
  if (!summary) return;
  const meta = await ctx.flash.readMeta(summary.id);
  if (meta?.hash !== summary.hash) {
    const result = await downloadView(ctx, again.index, summary, summary.id);
    if (result === "stale") ctx.errors.push({ code: "stale_view", view: summary.id });
    if (result !== "ok" && !meta) return;
  }
  const state = await ctx.flash.readState();
  await paint(ctx, {
    current: summary.id,
    focus: state.current === summary.id ? state.focus : null,
  });
}

export async function press(config: EmulatorConfig, key: Key): Promise<PressReport> {
  const flash = new Flash(config.store, config.flashBytes);
  await flash.init();
  const index = await flash.readIndex();
  const state = await flash.readState();

  if (key === "long-ok") {
    const parent = index?.views.find((view) => view.id === state.current)?.parent;
    if (parent === undefined) {
      // No parent: "refresh now".
      const wake = await runWake(config);
      const after = await flash.readState();
      return {
        key,
        current: after.current,
        focus: after.focus,
        requests: wake.requests,
        errors: wake.errors,
      };
    }
  }

  const client = new HttpClient(config);
  const ctx: Ctx = { config, client, flash, errors: [] };
  try {
    if (index !== null && state.current !== null) {
      const { current } = state;
      if (key === "tab") {
        const stored = await flash.readView(current, config.panel);
        const zones = stored?.zones.zones ?? [];
        if (zones.length > 0) {
          const at = zones.findIndex((zone) => zone.id === state.focus);
          await paint(ctx, { current, focus: zones[(at + 1) % zones.length]?.id ?? null });
        }
      } else if (key === "long-tab") {
        const at = index.views.findIndex((view) => view.id === current);
        const next = index.views[(at + 1) % index.views.length];
        if (next) await showView(ctx, index, next.id);
      } else if (key === "ok") {
        await onOk(ctx, index, current, state.focus);
      } else {
        const parent = index.views.find((view) => view.id === current)?.parent;
        if (parent !== undefined) await showView(ctx, index, parent);
      }
    }
    const after = await flash.readState();
    return {
      key,
      current: after.current,
      focus: after.focus,
      requests: client.records,
      errors: ctx.errors,
    };
  } finally {
    client.close();
  }
}
