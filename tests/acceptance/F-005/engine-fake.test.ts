/* eslint-disable @typescript-eslint/no-unsafe-member-access -- JSON de prueba */
import { describe, expect, it } from "vitest";
import { validateErrorBody } from "../../../contract/src/index.ts";
import { createApp } from "../../../server/src/index.ts";
import {
  API,
  P124,
  P200,
  cfgFrom,
  dataFrom,
  devHeaders,
  fakeRenderer,
  getViews,
  mkEngine,
  only,
  orderedRenderer,
  viewOf,
  type Loose,
} from "./helpers.ts";

describe("CA15 caché compartida", () => {
  it("dos aparatos con la misma vista no la dibujan dos veces; otro panel sí", async () => {
    const config = cfgFrom((o: Loose) => {
      o.devices["*"].views = ["hoy", "pendientes", "agenda"];
      o.devices.p2 = { views: ["agenda"] };
    });
    const r = fakeRenderer();
    const e = mkEngine(r, { config, data: dataFrom(config) });
    try {
      const p1 = await getViews(e, "p1", P124);
      expect(p1.views.map((v) => v.id)).toEqual(["hoy", "pendientes", "agenda"]);
      expect(e.renders()).toBe(3);

      const p2 = await getViews(e, "p2", P124);
      expect(p2.views.map((v) => v.id)).toEqual(["agenda"]);
      expect(e.renders()).toBe(3);

      const hash = viewOf(p1.views, "pendientes").hash;
      expect(e.view("p2", P124, "pendientes", hash)).toMatchObject({
        ok: false,
        status: 404,
        code: "unknown_view",
      });

      await getViews(e, "p1", P200);
      expect(e.renders()).toBe(6);
    } finally {
      await e.idle();
      await e.close();
    }
  }, 60_000);
});

describe("CA17 espera y busy", () => {
  const oneView = () => {
    const config = cfgFrom(only(["agenda"]));
    return { config, data: dataFrom(config) };
  };

  it("un dibujo de 3000 ms → busy en menos de 2,5 s; tras idle(), responde sin dibujar", async () => {
    const r = fakeRenderer(3000);
    const e = mkEngine(r, oneView());
    try {
      const t0 = Date.now();
      const first = await e.index("local", P124);
      expect(Date.now() - t0).toBeLessThan(2500);
      expect(first).toMatchObject({ ok: false, status: 503, code: "busy", retryAfterS: 5 });

      await e.idle();
      const n = e.renders();
      const second = await e.index("local", P124);
      expect(second.ok).toBe(true);
      expect(e.renders()).toBe(n);
    } finally {
      await e.idle();
      await e.close();
    }
  }, 60_000);

  it("por HTTP: 503, Retry-After: 5 y ErrorBody busy", async () => {
    const e = mkEngine(fakeRenderer(3000), oneView());
    const { app } = createApp({ nextWakeS: 1800, headersTimeoutMs: 10_000, engine: e });
    try {
      const res = await app.inject({
        method: "GET",
        url: `${API}/index`,
        headers: devHeaders(P124),
      });
      expect(res.statusCode).toBe(503);
      expect(res.headers["retry-after"]).toBe("5");
      const v = validateErrorBody(res.body);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value.error.code).toBe("busy");
    } finally {
      await e.idle();
      await app.close();
      await e.close();
    }
  }, 60_000);
});

describe("CA27 orden de prioridad con un Renderer falso de 300 ms", () => {
  it("ningún dibujo low empieza mientras hay dibujos normal esperando", async () => {
    const r = orderedRenderer(300);
    const engines = [0, 1, 2].map(() => mkEngine(r, { renderWaitMs: 30_000 }));
    try {
      const results = await Promise.all(engines.map((e) => e.index("local", P124)));
      for (const x of results) expect(x.ok).toBe(true);
      await new Promise((res) => setTimeout(res, 700));
      expect(r.started.filter((s) => s.priority === "normal")).toHaveLength(9);
      const lows = r.started.filter((s) => s.priority === "low");
      expect(lows.length).toBeGreaterThan(0);
      for (const s of lows) {
        expect(s.normalWaiting).toBe(0);
        expect(s.panel).toEqual(P124);
      }
    } finally {
      for (const e of engines) await e.close();
    }
  }, 120_000);
});
