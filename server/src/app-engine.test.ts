/* eslint-disable @typescript-eslint/unbound-method -- renders() is a closure, not a method */
// The app over the view engine, with a fake renderer (no Docker): routes, errors and `busy`.
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatPanelHeader,
  validateActionsResponse,
  validateErrorBody,
  validateIndex,
  validateZones,
  type Panel,
} from "../../contract/src/index.ts";
import { createApp } from "./index.ts";
import { loadDataFile, loadViewsConfig } from "./engine/config.ts";
import { createEngine, type Engine } from "./engine/engine.ts";
import { fakeRenderer } from "./engine/testing.ts";
import { zoneId } from "./engine/view.ts";

const REPO = resolve(import.meta.dirname, "../..");
const config = loadViewsConfig(join(REPO, "config/views.example.json"));
const data = loadDataFile(join(REPO, "config/data.example.json"), config);
const PANEL: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const server = { nextWakeS: 1800, headersTimeoutMs: 10_000 };
const clock = (): Date => new Date("2026-10-23T12:00:00Z");

const headers = (panel: Panel = PANEL): Record<string, string> => ({
  "Tintero-Protocol": "1",
  "Tintero-Firmware": "test-1",
  "Tintero-Power": "usb",
  "Tintero-Formats": "raw1",
  "Tintero-Panel": formatPanelHeader(panel),
});

const open: Engine[] = [];
function make(options: { delayMs?: number; renderWaitMs?: number } = {}) {
  const engine = createEngine({
    config,
    data,
    renderer: fakeRenderer(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
    clock,
    nextWakeS: 1800,
    ...(options.renderWaitMs === undefined ? {} : { renderWaitMs: options.renderWaitMs }),
  });
  open.push(engine);
  return { engine, ...createApp({ ...server, engine }) };
}

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const engine of open.splice(0)) await engine.close();
});

describe("with the engine", () => {
  it("serves a valid index, the images and the zones of each view", async () => {
    const { app, renders } = make();
    const res = await app.inject({ method: "GET", url: "/api/v1/index", headers: headers() });
    expect(res.statusCode).toBe(200);
    const parsed = validateIndex(res.body);
    if (!parsed.ok) throw new Error("invalid index");
    expect(parsed.value.views.map((v) => v.id)).toEqual(["hoy", "pendientes", "agenda"]);
    expect(parsed.value.current).toBe("hoy");
    expect(renders()).toBe(3);
    for (const view of parsed.value.views) {
      const url = `/api/v1/views/${view.id}`;
      const image = await app.inject({
        method: "GET",
        url: `${url}/image?h=${view.hash}`,
        headers: headers(),
      });
      expect(image.statusCode).toBe(200);
      expect(image.rawPayload.length).toBe(view.bytes);
      expect(image.headers.etag).toBe(`"${view.hash}"`);
      const cached = await app.inject({
        method: "GET",
        url: `${url}/image?h=${view.hash}`,
        headers: { ...headers(), "if-none-match": `"${view.hash}"` },
      });
      expect(cached.statusCode).toBe(304);
      const zones = await app.inject({
        method: "GET",
        url: `${url}/zones?h=${view.hash}`,
        headers: headers(),
      });
      const body = validateZones(zones.body, PANEL);
      expect(body.ok).toBe(true);
      if (body.ok) expect(body.value.hash).toBe(view.hash);
    }
    await app.close();
  });

  it("answers 409 for an old hash, 404 for an unknown view and 400 for a bad `h`", async () => {
    const { app } = make();
    await app.inject({ method: "GET", url: "/api/v1/index", headers: headers() });
    const stale = await app.inject({
      method: "GET",
      url: "/api/v1/views/hoy/image?h=0123456789abcdef",
      headers: headers(),
    });
    expect(stale.statusCode).toBe(409);
    expect(validateErrorBody(stale.body)).toMatchObject({
      ok: true,
      value: { error: { code: "stale_view" } },
    });
    const unknown = await app.inject({
      method: "GET",
      url: "/api/v1/views/nada/zones?h=0123456789abcdef",
      headers: headers(),
    });
    expect(unknown.statusCode).toBe(404);
    const unknownBadH = await app.inject({
      method: "GET",
      url: "/api/v1/views/nada/zones?h=zz",
      headers: headers(),
    });
    expect(unknownBadH.statusCode).toBe(404);
    const bad = await app.inject({
      method: "GET",
      url: "/api/v1/views/hoy/zones?h=zz",
      headers: headers(),
    });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it("answers 503 busy with Retry-After and an ErrorBody while drawing (CA17)", async () => {
    const { app, engine } = make({ delayMs: 300, renderWaitMs: 50 });
    const res = await app.inject({ method: "GET", url: "/api/v1/index", headers: headers() });
    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("5");
    expect(validateErrorBody(res.body)).toMatchObject({
      ok: true,
      value: { error: { code: "busy" } },
    });
    await engine.idle();
    const again = await app.inject({ method: "GET", url: "/api/v1/index", headers: headers() });
    expect(again.statusCode).toBe(200);
    await app.close();
  });

  it("applies actions through the engine and redraws", async () => {
    const { app, engine } = make();
    await app.inject({ method: "GET", url: "/api/v1/index", headers: headers() });
    const body = JSON.stringify({
      actions: [
        {
          id: "action-0001",
          view: "pendientes",
          zone: zoneId("pendientes", "tareas", "t-001"),
          act: "toggle",
          at: 1,
        },
        { id: "action-0002", view: "hoy", zone: "zffffffffff", act: "toggle", at: 1 },
      ],
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/actions",
      headers: { ...headers(), "content-type": "application/json" },
      payload: body,
    });
    const parsed = validateActionsResponse(res.body);
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        index_changed: true,
        results: [
          { id: "action-0001", status: "applied" },
          { id: "action-0002", status: "stale" },
        ],
      },
    });
    await engine.idle();
    expect(engine.renders()).toBe(5);
    await app.close();
  });
});
