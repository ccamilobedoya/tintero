import { afterAll, describe, expect, it } from "vitest";
import { validateErrorBody, type Panel } from "../../../contract/src/index.ts";
import type { Engine, Renderer } from "../../../server/src/engine/index.ts";
import { createApp } from "../../../server/src/index.ts";
import {
  AFTER_MIDNIGHT,
  API,
  NOW,
  P124,
  devHeaders,
  fakeRenderer,
  index8,
  makeClock,
  mkEngine6,
} from "./helpers.ts";

const open: Engine[] = [];
function engine(renderer: Renderer, opts: Parameters<typeof mkEngine6>[1] = {}): Engine {
  const e = mkEngine6(renderer, opts);
  open.push(e);
  return e;
}
afterAll(async () => {
  for (const e of open) {
    try {
      await e.idle();
      await e.close();
    } catch {
      /* closing anyway */
    }
  }
});

/** A renderer that draws nothing and notes the HTML of each call, in the order they start. */
function recorder(): Renderer & { htmls: string[] } {
  const inner = fakeRenderer();
  const htmls: string[] = [];
  return {
    htmls,
    render: (html: string, panel: Panel, options?: Parameters<Renderer["render"]>[2]) => {
      htmls.push(html);
      return inner.render(html, panel, options);
    },
    blockedRequests: () => 0,
    close: () => Promise.resolve(),
  };
}
const drawn = (r: { htmls: string[] }): string[] => r.htmls.filter((h) => h.includes("data-fit="));

describe("CA8 full_refresh", () => {
  it("true en el primer index del día local de cada aparato; false el resto del día", async () => {
    const clk = makeClock(NOW);
    const e = engine(fakeRenderer(), { clock: clk.clock });
    expect((await index8(e, "local", P124)).fullRefresh).toBe(true);
    await e.idle();

    clk.set("2026-10-24T17:10:00Z");
    expect((await index8(e, "local", P124)).fullRefresh).toBe(false);

    // 23:59 del 24 en Lima (UTC−5): sigue siendo el mismo día local
    clk.set("2026-10-25T04:59:00Z");
    expect((await index8(e, "local", P124)).fullRefresh).toBe(false);

    // 00:01 del 25 en Lima
    clk.set(AFTER_MIDNIGHT);
    expect((await index8(e, "local", P124)).fullRefresh).toBe(true);
    clk.set("2026-10-25T05:30:00Z");
    expect((await index8(e, "local", P124)).fullRefresh).toBe(false);

    // otro aparato: su primer index del día
    expect((await index8(e, "otro", P124)).fullRefresh).toBe(true);
    expect((await index8(e, "otro", P124)).fullRefresh).toBe(false);
  }, 60_000);

  it("tras reiniciar (motor nuevo), el primer index vuelve a dar true", async () => {
    const a = engine(fakeRenderer());
    expect((await index8(a, "local", P124)).fullRefresh).toBe(true);
    await a.idle();
    await a.close();
    const b = engine(fakeRenderer());
    expect((await index8(b, "local", P124)).fullRefresh).toBe(true);
  }, 60_000);

  it("por HTTP: full_refresh del índice = fullRefresh (true, luego false)", async () => {
    const e = engine(fakeRenderer());
    const { app } = createApp({ nextWakeS: 1800, headersTimeoutMs: 10_000, engine: e });
    try {
      const get = async (): Promise<boolean> => {
        const res = await app.inject({
          method: "GET",
          url: `${API}/index`,
          headers: devHeaders(P124),
        });
        expect(res.statusCode).toBe(200);
        return (JSON.parse(res.body) as { full_refresh: boolean }).full_refresh;
      };
      expect(await get()).toBe(true);
      await e.idle();
      expect(await get()).toBe(false);
    } finally {
      await e.idle();
      await app.close();
    }
  }, 60_000);

  it("sin motor (modo demostración) sigue en false", async () => {
    const { app } = createApp({ nextWakeS: 1800, headersTimeoutMs: 10_000 });
    try {
      const res = await app.inject({
        method: "GET",
        url: `${API}/index`,
        headers: devHeaders(P124),
      });
      expect(res.statusCode).toBe(200);
      expect((JSON.parse(res.body) as { full_refresh: boolean }).full_refresh).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describe("CA9 Tintero-View", () => {
  it("current según options.view: tablero, desconocida → hoy, sin view → hoy", async () => {
    const e = engine(fakeRenderer());
    expect((await index8(e, "local", P124, "tablero")).current).toBe("tablero");
    expect((await index8(e, "local", P124, "nada")).current).toBe("hoy");
    expect((await index8(e, "local", P124)).current).toBe("hoy");
    expect((await index8(e, "local", P124, "hoy")).current).toBe("hoy");
  }, 60_000);

  it("con la caché vacía, la vista que manda el aparato se dibuja primero", async () => {
    // el HTML de cada vista, en motores aparte que solo la tienen a ella
    const rt = recorder();
    await index8(engine(rt, { views: ["tablero"] }), "local", P124);
    const rh = recorder();
    await index8(engine(rh, { views: ["hoy"] }), "local", P124);
    const htmlTablero = drawn(rt)[0];
    const htmlHoy = drawn(rh)[0];
    expect(htmlTablero).toBeDefined();
    expect(htmlHoy).toBeDefined();
    expect(htmlTablero).not.toBe(htmlHoy);

    const first = recorder();
    const e1 = engine(first);
    await index8(e1, "local", P124, "tablero");
    await e1.idle();
    expect(drawn(first)[0]).toBe(htmlTablero);
    expect(drawn(first)).toContain(htmlHoy);

    const plain = recorder();
    const e2 = engine(plain);
    await index8(e2, "local", P124);
    await e2.idle();
    expect(drawn(plain)[0]).toBe(htmlHoy);
  }, 60_000);

  it("por HTTP: Tintero-View: tablero → current tablero; Tablero! → 400 invalid_request", async () => {
    const e = engine(fakeRenderer());
    const { app } = createApp({ nextWakeS: 1800, headersTimeoutMs: 10_000, engine: e });
    try {
      const ok = await app.inject({
        method: "GET",
        url: `${API}/index`,
        headers: { ...devHeaders(P124), "Tintero-View": "tablero" },
      });
      expect(ok.statusCode).toBe(200);
      expect((JSON.parse(ok.body) as { current: string }).current).toBe("tablero");

      const bad = await app.inject({
        method: "GET",
        url: `${API}/index`,
        headers: { ...devHeaders(P124), "Tintero-View": "Tablero!" },
      });
      expect(bad.statusCode).toBe(400);
      const v = validateErrorBody(bad.body);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value.error.code).toBe("invalid_request");
    } finally {
      await e.idle();
      await app.close();
    }
  }, 60_000);
});
