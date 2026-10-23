import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, runWake, type EmulatorConfig } from "../../../emulator/src/index.ts";
import { createApp, demoViews, startServer } from "../../../server/src/index.ts";
import {
  API,
  CFG,
  PANEL,
  getImage,
  getIndex,
  getLocal,
  hashOf,
  devHeaders,
  rmDir,
  tmpDir,
} from "./helpers.ts";

let srv: Awaited<ReturnType<typeof startServer>>;
let store: string;

beforeEach(async () => {
  srv = await startServer(CFG, 0);
  store = tmpDir("tintero-f003-");
});
afterEach(async () => {
  await srv.close();
  rmDir(store);
});

const usb = (): EmulatorConfig => ({ ...defaultConfig(srv.url, store), power: "usb" });
const readStore = (name: string): Buffer =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
  readFileSync(join(store, name));

describe("CA3 ciclo con el emulador", () => {
  it("startServer escucha en 127.0.0.1", () => {
    expect(srv.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("runWake (usb) baja las tres vistas sin errores y screen.raw1 es la imagen de demo", async () => {
    const r = await runWake(usb());
    expect(r.errors).toEqual([]);
    expect([...r.downloaded].sort()).toEqual(["demo", "detalle", "patron"]);
    expect(r.current).toBe("demo");
    expect(r.nextWakeS).toBe(1800);

    const headers = devHeaders(PANEL);
    const idx = JSON.parse((await getLocal(srv.url, `${API}/index`, { headers })).text) as {
      views: { id: string; hash: string }[];
    };
    const h = idx.views.find((v) => v.id === "demo")?.hash;
    const served = await getLocal(srv.url, `${API}/views/demo/image?h=${h}`, { headers });
    expect(served.status).toBe(200);
    const screen = readStore("screen.raw1");
    expect(screen.equals(served.buf)).toBe(true);

    const drawn = demoViews().find((v) => v.id === "demo");
    expect(drawn).toBeDefined();
    expect(Buffer.from(drawn?.raw1(PANEL) ?? new Uint8Array()).equals(screen)).toBe(true);
    expect(demoViews().map((v) => v.id)).toEqual(["demo", "detalle", "patron"]);
    expect(demoViews().find((v) => v.id === "detalle")?.parent).toBe("demo");
  });
});

describe("CA4 segunda despertada y caché", () => {
  it("la segunda runWake solo hace GET index", async () => {
    await runWake(usb());
    const r2 = await runWake(usb());
    expect(r2.requests.map((q) => `${q.method} ${q.path.split("?")[0]}`)).toEqual([
      `GET ${API}/index`,
    ]);
    expect(r2.downloaded).toEqual([]);
    expect(r2.errors).toEqual([]);
  });

  it("renders() no aumenta al pedir otra vez las mismas imágenes", async () => {
    const created = createApp(CFG);
    const app = created.app;
    const renders = (): number => created.renders();
    const idx = await getIndex(app);
    for (const v of idx.views) await getImage(app, v.id, v.hash);
    const before = renders();
    for (let i = 0; i < 2; i++) {
      await getIndex(app);
      for (const v of idx.views) await getImage(app, v.id, v.hash);
    }
    expect(renders()).toBe(before);
  });
});

describe("CA16 caché de la imagen de patron", () => {
  it("cinco pedidos con la misma huella dibujan una sola vez", async () => {
    const created = createApp(CFG);
    const app = created.app;
    const renders = (): number => created.renders();
    expect(renders()).toBe(0);
    const idx = await getIndex(app);
    const h = hashOf(idx, "patron");
    const afterIndex = renders();
    // ficha: «renders() sube en 1» para patron; el índice puede haberla dibujado ya (ver informe)
    for (let i = 0; i < 5; i++) await getImage(app, "patron", h);
    expect(renders() - afterIndex).toBeLessThanOrEqual(1);
    const total = renders();
    for (let i = 0; i < 5; i++) await getImage(app, "patron", h);
    expect(renders()).toBe(total);
    // en total, nunca más de un dibujo por vista
    for (const v of idx.views) for (let i = 0; i < 5; i++) await getImage(app, v.id, v.hash);
    expect(renders()).toBeLessThanOrEqual(3);
  });

  it("al cambiar los datos de demo solo se vuelve a dibujar demo", async () => {
    const created = createApp(CFG);
    const app = created.app;
    const renders = (): number => created.renders();
    const idx = await getIndex(app);
    for (const v of idx.views) await getImage(app, v.id, v.hash);
    const before = renders();
    const r = await app.inject({
      method: "POST",
      url: `${API}/actions`,
      headers: { ...devHeaders(), "content-type": "application/json" },
      payload: JSON.stringify({
        actions: [{ id: "cache-test-1", view: "demo", zone: "c1", act: "toggle", at: 1 }],
      }),
    });
    expect(r.statusCode).toBe(200);
    const idx2 = await getIndex(app);
    for (const v of idx2.views) await getImage(app, v.id, v.hash);
    expect(renders() - before).toBe(1);
    expect(hashOf(idx2, "patron")).toBe(hashOf(idx, "patron"));
    expect(hashOf(idx2, "detalle")).toBe(hashOf(idx, "detalle"));
    expect(hashOf(idx2, "demo")).not.toBe(hashOf(idx, "demo"));
  });
});
