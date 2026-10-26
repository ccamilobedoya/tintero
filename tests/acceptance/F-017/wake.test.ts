import { afterAll, afterEach, describe, expect, it } from "vitest";
import { validateIndex } from "../../../contract/src/index.ts";
import { createApp } from "../../../server/src/index.ts";
import { UsageError, parseOptions } from "../../../server/src/args.ts";
import type { ServerConfig as BaseConfig } from "../../../server/src/app.ts";
import type { Engine } from "../../../server/src/engine/index.ts";
import { API, devHeaders, getLocal, startCli, type Cli } from "../F-003/helpers.ts";
import {
  NOW15,
  P124,
  closeEngines15,
  fakeRenderer,
  hoyDataText,
  makeClock,
  mkEngine15,
  spyRenderer,
} from "./helpers.ts";

/** `ServerConfig` de F-017: gana `nextWakeUsbS`. */
type ServerConfig = BaseConfig & { nextWakeUsbS?: number };
const cfgOf = (argv: string[]): ServerConfig => parseOptions(argv).config;
const makeApp = (config: ServerConfig): ReturnType<typeof createApp> => createApp(config);

type IndexF17 = (d: string, p: typeof P124, o?: { wakeS: number }) => ReturnType<Engine["index"]>;
/** `Engine.index` de F-017: acepta `wakeS`. */
const indexWith = (e: Engine, wakeS: number | undefined): ReturnType<Engine["index"]> =>
  (e as unknown as { index: IndexF17 }).index(
    "p1",
    P124,
    wakeS === undefined ? undefined : { wakeS },
  );

afterAll(closeEngines15);

const wakeOf = (text: string): number => (JSON.parse(text) as { next_wake_s: number }).next_wake_s;

describe("CA4 opción --next-wake-usb-s", () => {
  it("por defecto: nextWakeUsbS 600 y nextWakeS 1800", () => {
    const config = cfgOf([]);
    expect(config.nextWakeUsbS).toBe(600);
    expect(config.nextWakeS).toBe(1800);
  });

  it("--next-wake-usb-s 900 → 900 (y --next-wake-s sigue igual)", () => {
    const config = cfgOf(["--next-wake-usb-s", "900"]);
    expect(config.nextWakeUsbS).toBe(900);
    expect(config.nextWakeS).toBe(1800);
    expect(parseOptions(["--next-wake-s", "1200"]).config.nextWakeS).toBe(1200);
  });

  it("los extremos 30 y 86400 valen", () => {
    expect(cfgOf(["--next-wake-usb-s", "30"]).nextWakeUsbS).toBe(30);
    expect(cfgOf(["--next-wake-usb-s", "86400"]).nextWakeUsbS).toBe(86_400);
  });

  for (const bad of ["29", "86401", "10m"]) {
    it(`--next-wake-usb-s ${bad} → UsageError que nombra la opción`, () => {
      let error: unknown;
      try {
        parseOptions(["--next-wake-usb-s", bad]);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(UsageError);
      expect((error as Error).message).toContain("--next-wake-usb-s");
    });
  }
});

describe("CA5 modo demostración", () => {
  let cli: Cli | undefined;
  afterEach(async () => {
    await cli?.stop();
    cli = undefined;
  });

  async function wake(c: Cli, power: "battery" | "usb"): Promise<number> {
    const r = await getLocal(c.url, `${API}/index`, {
      headers: devHeaders(P124, { "Tintero-Power": power }),
    });
    expect(r.status).toBe(200);
    expect(validateIndex(r.text).ok).toBe(true);
    return wakeOf(r.text);
  }

  it("por defecto: battery → 1800 y usb → 600", async () => {
    cli = await startCli();
    expect(await wake(cli, "battery")).toBe(1800);
    expect(await wake(cli, "usb")).toBe(600);
  }, 60_000);

  it("--next-wake-s 1200 --next-wake-usb-s 300: battery → 1200 y usb → 300", async () => {
    cli = await startCli(["--next-wake-s", "1200", "--next-wake-usb-s", "300"]);
    expect(await wake(cli, "battery")).toBe(1200);
    expect(await wake(cli, "usb")).toBe(300);
  }, 60_000);

  it("ServerConfig armado por código sin nextWakeUsbS y nextWakeS 1800: usb → 1800", async () => {
    const config: ServerConfig = { nextWakeS: 1800, headersTimeoutMs: 10_000 };
    const { app } = makeApp(config);
    try {
      for (const power of ["usb", "battery"]) {
        const r = await app.inject({
          method: "GET",
          url: `${API}/index`,
          headers: devHeaders(P124, { "Tintero-Power": power }),
        });
        expect(r.statusCode).toBe(200);
        expect(wakeOf(r.body)).toBe(1800);
      }
    } finally {
      await app.close();
    }
  });

  it("ServerConfig por código con nextWakeUsbS 600: usb → 600, battery → 1800", async () => {
    const { app } = makeApp({ nextWakeS: 1800, nextWakeUsbS: 600, headersTimeoutMs: 10_000 });
    try {
      const get = async (power: string): Promise<number> =>
        wakeOf(
          (
            await app.inject({
              method: "GET",
              url: `${API}/index`,
              headers: devHeaders(P124, { "Tintero-Power": power }),
            })
          ).body,
        );
      expect(await get("usb")).toBe(600);
      expect(await get("battery")).toBe(1800);
    } finally {
      await app.close();
    }
  });
});

describe("CA6 con motor", () => {
  it("los ejemplos de hoy: battery → 1800, usb → 600, los dos índices válidos", async () => {
    const engine = mkEngine15(fakeRenderer(), { views: ["hoy"] });
    const { app } = makeApp({
      nextWakeS: 1800,
      nextWakeUsbS: 600,
      headersTimeoutMs: 10_000,
      engine,
    });
    try {
      const results = new Map<string, number>();
      for (const power of ["battery", "usb"]) {
        const r = await app.inject({
          method: "GET",
          url: `${API}/index`,
          headers: devHeaders(P124, { "Tintero-Power": power }),
        });
        expect(r.statusCode, r.body).toBe(200);
        const v = validateIndex(r.body);
        expect(v.ok, r.body).toBe(true);
        results.set(power, wakeOf(r.body));
      }
      expect([...results]).toEqual([
        ["battery", 1800],
        ["usb", 600],
      ]);
    } finally {
      await app.close();
    }
  }, 60_000);
});

describe("CA7 dibujo por adelantado con el intervalo de la pantalla", () => {
  const t0 = new Date(NOW15).getTime();
  const at = (s: number): string => new Date(t0 + s * 1000).toISOString();
  const tablero = (): unknown[] =>
    (JSON.parse(hoyDataText()) as { sources: { tablero: { items: unknown[] } } }).sources.tablero
      .items;

  /** Motor de `hoy` con un renderer falso; `index` en t0 con `wakeS`; devuelve cuántos dibujos hizo. */
  async function setup(wakeS: number | undefined) {
    const spy = spyRenderer(fakeRenderer());
    // Solo cuentan los dibujos de vistas completas (no la sonda de letras de un solo uso).
    const renderer = {
      get count(): number {
        return spy.calls.filter((c) => c.html.includes("data-fit=")).length;
      },
    };
    const clk = makeClock(NOW15);
    const engine = mkEngine15(spy, { clock: clk.clock });
    const set = engine.setSource("tablero", tablero(), { readAt: new Date(t0) });
    expect(set.ok).toBe(true);
    const r = await indexWith(engine, wakeS);
    expect(r.ok).toBe(true);
    await engine.idle();
    return { renderer, clk, engine, base: renderer.count, spy };
  }

  it("wakeS 600: en t0+539 s no dibuja; en t0+541 s sí", async () => {
    const { renderer, clk, engine, base, spy } = await setup(600);
    expect(base).toBeGreaterThan(0);
    clk.set(at(539));
    await engine.prewarm();
    await engine.idle();
    expect(renderer.count).toBe(base);
    clk.set(at(541));
    await engine.prewarm();
    await engine.idle();
    expect(renderer.count).toBeGreaterThan(base);
    const fresh = spy.calls
      .map((c) => c.html)
      .filter((h) => h.includes("data-fit="))
      .slice(base);
    expect(fresh.some((h) => h.includes("sin datos desde 08:00"))).toBe(true);
  }, 60_000);

  it("wakeS 1800: en t0+541 s no dibuja nada", async () => {
    const { renderer, clk, engine, base } = await setup(1800);
    clk.set(at(541));
    await engine.prewarm();
    await engine.idle();
    expect(renderer.count).toBe(base);
  }, 60_000);

  it("sin wakeS (nextWakeS 1800 del motor): en t0+541 s no dibuja nada", async () => {
    const { renderer, clk, engine, base } = await setup(undefined);
    clk.set(at(541));
    await engine.prewarm();
    await engine.idle();
    expect(renderer.count).toBe(base);
  }, 60_000);
});
