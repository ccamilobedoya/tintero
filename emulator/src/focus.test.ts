import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Panel } from "../../contract/src/index.ts";
import { FakeServer, pattern } from "./fake-server.ts";
import { defaultConfig, press, renderScreen, runWake } from "./index.ts";

const PANEL: Panel = { w: 64, h: 48, dpi: 124, depth: 1 };
const stride = 8;
const blank = (): Uint8Array => new Uint8Array(stride * 48);
const inverted = (raw: Uint8Array, x: number, y: number): boolean =>
  (((raw[y * stride + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1) === 1;

describe("renderScreen ring rule (F-008)", () => {
  it("inverts the pixels less than `ring` from the border (solid)", () => {
    const zone = { id: "z", x: 8, y: 8, w: 40, h: 24, act: "open" as const };
    const out = renderScreen(blank(), PANEL, zone, 5, 0);
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 64; x++) {
        const inside = x >= 8 && x < 48 && y >= 8 && y < 32;
        const edge = x < 13 || x >= 43 || y < 13 || y >= 27;
        expect(inverted(out, x, y)).toBe(inside && edge);
      }
    }
  });

  it("keeps runs of `dash` px: even ones on the strips of the border", () => {
    const zone = { id: "z", x: 8, y: 8, w: 40, h: 24, act: "open" as const };
    const out = renderScreen(blank(), PANEL, zone, 3, 8);
    for (const [x, y] of [
      [8, 8],
      [15, 9],
      [24, 10],
      [9, 25],
    ] as const) {
      expect(inverted(out, x, y)).toBe(true);
    }
    for (const [x, y] of [
      [16, 8],
      [16, 31],
      [9, 16],
      [9, 20],
      [20, 20],
    ] as const) {
      expect(inverted(out, x, y)).toBe(false);
    }
  });
});

describe("Tintero-View and the focus that follows", () => {
  let server: FakeServer;
  let store: string;
  beforeEach(async () => {
    server = new FakeServer();
    await server.start();
    store = await mkdtemp(join(tmpdir(), "tintero-emu-f8-"));
  });
  afterEach(async () => {
    await server.stop();
    await rm(store, { recursive: true, force: true });
  });
  const config = () => defaultConfig(server.url, store);

  it("sends the view on screen in every request, but not before there is one", async () => {
    await runWake(config());
    expect(server.seen.length).toBeGreaterThan(0);
    expect(server.seen.every((seen) => seen.headers["tintero-view"] === undefined)).toBe(true);
    server.seen = [];
    await runWake(config());
    expect(server.seen.length).toBeGreaterThan(0);
    expect(server.seen.every((seen) => seen.headers["tintero-view"] === "todo")).toBe(true);
    server.seen = [];
    await press(config(), "long-tab");
    expect(server.seen.every((seen) => seen.headers["tintero-view"] === "todo")).toBe(true);
  });

  it("moves the focus to the zone of the same index when its id is gone", async () => {
    await runWake(config());
    await press(config(), "tab"); // t1
    await press(config(), "tab"); // t2
    server.indexChanged = true;
    server.views.set("todo", {
      raw1: pattern(5),
      zones: [
        { id: "n1", x: 24, y: 72, w: 752, h: 40, act: "toggle" },
        { id: "n2", x: 24, y: 120, w: 752, h: 40, act: "toggle" },
      ],
    });
    const same = await press(config(), "ok");
    expect(same.focus).toBe("n2");
    server.views.set("todo", {
      raw1: pattern(6),
      zones: [{ id: "m1", x: 24, y: 72, w: 752, h: 40, act: "toggle" }],
    });
    const last = await press(config(), "ok");
    expect(last.focus).toBe("m1");
  });
});
