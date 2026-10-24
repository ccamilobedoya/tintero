import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkImage,
  validateErrorBody,
  validateIndex,
  validateZones,
} from "../../../contract/src/index.ts";
import type { Engine } from "../../../server/src/engine/index.ts";
import { createApp } from "../../../server/src/index.ts";
import { API, P124, devHeaders, launchChromium, mkEngine, type TestChromium } from "./helpers.ts";

let cr: TestChromium;
let engine: Engine;
let app: ReturnType<typeof createApp>["app"];
beforeAll(async () => {
  cr = await launchChromium();
  engine = mkEngine(cr.renderer);
  app = createApp({ nextWakeS: 1800, headersTimeoutMs: 10_000, engine }).app;
}, 120_000);
afterAll(async () => {
  try {
    await engine.idle();
    await app.close();
    await engine.close();
  } finally {
    await cr.stop();
  }
}, 60_000);

const get = (url: string) =>
  app.inject({ method: "GET", url: `${API}${url}`, headers: devHeaders(P124) });

describe("CA18 huellas y errores por HTTP", () => {
  it("index válido con hoy, pendientes, agenda y current = hoy", async () => {
    const res = await get("/index");
    expect(res.statusCode).toBe(200);
    const v = validateIndex(res.body);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.views.map((x) => x.id)).toEqual(["hoy", "pendientes", "agenda"]);
    expect(v.value.current).toBe("hoy");
  }, 60_000);

  it("imagen y zonas de cada vista responden con su huella", async () => {
    const idx = validateIndex((await get("/index")).body);
    expect(idx.ok).toBe(true);
    if (!idx.ok) return;
    for (const view of idx.value.views) {
      const img = await get(`/views/${view.id}/image?h=${view.hash}`);
      expect(img.statusCode, view.id).toBe(200);
      expect(checkImage("raw1", img.rawPayload, P124, view.crc32).ok, view.id).toBe(true);
      const zones = await get(`/views/${view.id}/zones?h=${view.hash}`);
      expect(zones.statusCode, view.id).toBe(200);
      const z = validateZones(zones.body, P124);
      expect(z.ok, view.id).toBe(true);
      if (z.ok) {
        expect(z.value.view).toBe(view.id);
        expect(z.value.hash).toBe(view.hash);
      }
    }
  }, 60_000);

  it("huella vieja → 409 stale_view; vista nada → 404 unknown_view", async () => {
    const idx = validateIndex((await get("/index")).body);
    if (!idx.ok) throw new Error("index inválido");
    for (const kind of ["image", "zones"]) {
      const stale = await get(`/views/hoy/${kind}?h=0000000000000000`);
      expect(stale.statusCode, kind).toBe(409);
      const s = validateErrorBody(stale.body);
      expect(s.ok).toBe(true);
      if (s.ok) expect(s.value.error.code).toBe("stale_view");

      const none = await get(`/views/nada/${kind}?h=${idx.value.views[0]?.hash ?? ""}`);
      expect(none.statusCode, kind).toBe(404);
      const n = validateErrorBody(none.body);
      expect(n.ok).toBe(true);
      if (n.ok) expect(n.value.error.code).toBe("unknown_view");
    }
  }, 60_000);
});
