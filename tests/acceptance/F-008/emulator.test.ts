import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Zone } from "../../../contract/src/index.ts";
import { press, runWake, type EmulatorConfig } from "../../../emulator/src/index.ts";
import { cfg } from "../F-002/helpers.ts";
import {
  PANEL,
  TestServer,
  makeImage,
  pixel,
  readStoreFile,
  rmStore,
  storeJson,
  tmpStore,
  withFocus,
} from "../F-002/testserver.ts";
import { renderScreen8 } from "./helpers.ts";

const zone = (id: string, x: number, y: number, w: number, h: number): Zone => ({
  id,
  x,
  y,
  w,
  h,
  act: "toggle",
});

/** The ring rule of the contract (F-008), written out pixel by pixel. */
function inverted(z: Zone, ring: number, dash: number, x: number, y: number): boolean {
  if (x < z.x || x >= z.x + z.w || y < z.y || y >= z.y + z.h) return false;
  const top = y - z.y < ring;
  const bottom = z.y + z.h - 1 - y < ring;
  const left = x - z.x < ring;
  const right = z.x + z.w - 1 - x < ring;
  if (!(top || bottom || left || right)) return false;
  if (dash === 0) return true;
  if (top || bottom) return Math.floor((x - z.x) / dash) % 2 === 0;
  return Math.floor((y - z.y) / dash) % 2 === 0;
}

describe("CA10 renderScreen con anillo", () => {
  const base = makeImage(3);
  const check = (z: Zone, ring: number | undefined, dash: number | undefined): void => {
    const out = renderScreen8(base, PANEL, z, ring, dash);
    const r = ring ?? 3;
    const d = dash ?? 0;
    let changed = 0;
    for (let y = 0; y < PANEL.h; y++)
      for (let x = 0; x < PANEL.w; x++) {
        const want = inverted(z, r, d, x, y);
        const got = pixel(out, x, y) !== pixel(base, x, y);
        if (got !== want) expect(got, `(${String(x)}, ${String(y)})`).toBe(want);
        if (want) changed++;
      }
    expect(changed).toBeGreaterThan(0);
  };

  it("ring = 5, dash = 0: invierte exactamente los píxeles a menos de 5 px del borde", () => {
    check(zone("z", 8, 8, 40, 24), 5, 0);
    check(zone("y", 24, 100, 120, 56), 5, 0);
  });

  it("ring = 3, dash = 8 en {8, 8, 40, 24}: los píxeles de la ficha", () => {
    const z = zone("z", 8, 8, 40, 24);
    const out = renderScreen8(base, PANEL, z, 3, 8);
    const flipped = (x: number, y: number): boolean => pixel(out, x, y) !== pixel(base, x, y);
    for (const [x, y] of [
      [8, 8],
      [15, 9],
      [24, 10],
      [9, 25],
    ] as const)
      expect(flipped(x, y), `invertido (${String(x)}, ${String(y)})`).toBe(true);
    for (const [x, y] of [
      [16, 8],
      [16, 31],
      [9, 16],
      [9, 20],
      [20, 20],
    ] as const)
      expect(flipped(x, y), `sin invertir (${String(x)}, ${String(y)})`).toBe(false);
    check(z, 3, 8);
  });

  it("sin ring ni dash: sólido de 3 px, como en F-002", () => {
    check(zone("z", 24, 72, 752, 40), undefined, undefined);
    const z = zone("z", 24, 72, 752, 40);
    expect(Buffer.from(renderScreen8(base, PANEL, z)).equals(Buffer.from(withFocus(base, z)))).toBe(
      true,
    );
  });
});

let srv: TestServer;
let store: string;
let c: EmulatorConfig;

beforeEach(async () => {
  srv = new TestServer();
  await srv.start();
  store = tmpStore();
});
afterEach(async () => {
  await srv.stop();
  rmStore(store);
});

async function ready(over: Partial<EmulatorConfig> = {}): Promise<void> {
  c = cfg(srv.url, store, { power: "usb", ...over });
  await runWake(c);
}

const viewHeader = (i: number): string | string[] | undefined =>
  srv.log[i]?.headers["tintero-view"];

describe("CA10 Tintero-View del emulador", () => {
  it("la primera despertada (sin current) no lo manda", async () => {
    c = cfg(srv.url, store, { power: "usb" });
    await runWake(c);
    expect(srv.log.length).toBeGreaterThan(0);
    for (let i = 0; i < srv.log.length; i++)
      expect(viewHeader(i), srv.log[i]?.path).toBeUndefined();
  });

  it("las siguientes lo mandan, igual a su current, en cada petición", async () => {
    await ready();
    srv.resetCounters();
    srv.bump("agenda", "cccc3333"); // fuerza también descargas
    await runWake(c);
    expect(srv.log.length).toBeGreaterThan(1);
    for (let i = 0; i < srv.log.length; i++) expect(viewHeader(i), srv.log[i]?.path).toBe("todo");
  });

  it("tras cambiar de vista con Mover largo, manda la vista nueva", async () => {
    await ready({ power: "battery", extraViewsPerWake: 1 });
    await press(c, "tab");
    const r = await press(c, "long-tab");
    expect(r.current).toBe("agenda");
    const t = await press(c, "tab");
    expect(t.focus).toBe("a1");
    srv.resetCounters();
    await press(c, "ok");
    expect(srv.log.map((l) => `${l.method} ${l.path.split("?")[0]}`)[0]).toBe(
      "POST /api/v1/actions",
    );
    for (let i = 0; i < srv.log.length; i++) expect(viewHeader(i), srv.log[i]?.path).toBe("agenda");
  });
});

describe("CA10 el foco sigue a la zona tras ok", () => {
  async function afterOk(newZones: Zone[]): Promise<{ focus: string | null }> {
    await ready();
    for (let i = 0; i < 4; i++) if ((await press(c, "tab")).focus === "t2") break;
    expect((storeJson(store, "state.json") as { focus: string }).focus).toBe("t2");
    srv.indexChanged = true;
    srv.bump("todo", "bbbb2222");
    const v = srv.views.find((x) => x.id === "todo");
    if (!v) throw new Error("todo");
    v.zones = newZones;
    const r = await press(c, "ok");
    const st = storeJson(store, "state.json") as { focus: string | null };
    expect(st.focus).toBe(r.focus);
    return { focus: r.focus ?? null };
  }

  it("el mismo id, aunque cambie de índice, conserva el foco (y el anillo se dibuja ahí)", async () => {
    const zones = [
      zone("t1", 24, 72, 752, 40),
      zone("ev1", 24, 120, 752, 40),
      zone("t2", 24, 400, 360, 56),
    ];
    const r = await afterOk(zones);
    expect(r.focus).toBe("t2");
    const img = srv.views.find((x) => x.id === "todo")?.image ?? new Uint8Array();
    const screen = readStoreFile(store, "screen.raw1");
    const moved = zone("t2", 24, 400, 360, 56);
    expect(Buffer.from(screen).equals(Buffer.from(withFocus(img, moved)))).toBe(true);
  });

  it("si el id ya no está, pasa a la zona del mismo índice", async () => {
    const zones = [
      zone("t1", 24, 72, 752, 40),
      zone("x2", 24, 120, 752, 40),
      zone("ev1", 24, 400, 360, 56),
    ];
    const r = await afterOk(zones);
    expect(r.focus).toBe("x2");
    const img = srv.views.find((x) => x.id === "todo")?.image ?? new Uint8Array();
    const screen = readStoreFile(store, "screen.raw1");
    const target = zone("x2", 24, 120, 752, 40);
    expect(Buffer.from(screen).equals(Buffer.from(withFocus(img, target)))).toBe(true);
  });

  it("si hay menos zonas que el índice, pasa a la última", async () => {
    const r = await afterOk([zone("t1", 24, 72, 752, 40)]);
    expect(r.focus).toBe("t1");
  });

  it("si ya no hay zonas, el foco es null", async () => {
    const r = await afterOk([]);
    expect(r.focus).toBeNull();
  });
});
