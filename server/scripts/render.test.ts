/* eslint-disable security/detect-non-literal-fs-filename -- temp folders of the test */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkImage, validateZones, type Panel } from "../../contract/src/index.ts";
import { fakeRenderer } from "../src/engine/testing.ts";
import { main, markZones, parseRenderArgs } from "./render.ts";

const REPO = resolve(import.meta.dirname, "../..");
const VIEWS = join(REPO, "config/views.example.json");
const DATA = join(REPO, "config/data.example.json");
const PANEL = "w=800,h=480,dpi=124,depth=1";
const P124: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "tintero-render-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const base = ["--views", VIEWS, "--data", DATA, "--panel", PANEL];

describe("parseRenderArgs", () => {
  it("reads the options", () => {
    const args = parseRenderArgs([
      ...base,
      "--out",
      "o",
      "--device",
      "p1",
      "--now",
      "2026-10-23T12:00:00Z",
      "--chromium",
      "http://127.0.0.1:9222",
    ]);
    expect(args).toMatchObject({
      out: "o",
      device: "p1",
      chromium: "http://127.0.0.1:9222",
      panel: P124,
    });
    expect(args.now?.toISOString()).toBe("2026-10-23T12:00:00.000Z");
    expect(parseRenderArgs([...base, "--out", "o"]).device).toBe("*");
  });

  it("rejects what is missing or invalid", () => {
    expect(() => parseRenderArgs(base)).toThrow("required");
    expect(() => parseRenderArgs(["--out", "o"])).toThrow("required");
    expect(() => parseRenderArgs([...base, "--out", "o", "--now", "yesterday"])).toThrow("--now");
    expect(() => parseRenderArgs([...base, "--out", "o", "--device", "A B"])).toThrow("--device");
    expect(() =>
      parseRenderArgs([...base, "--out", "o", "--chromium", "http://10.0.0.1:1"]),
    ).toThrow("--chromium");
    expect(() =>
      parseRenderArgs(["--views", "v", "--data", "d", "--panel", "w=1", "--out", "o"]),
    ).toThrow("--panel");
    expect(() => parseRenderArgs([...base, "--out", "o", "--nope"])).toThrow();
  });
});

describe("markZones", () => {
  it("inverts a 2 px border inside each zone and nothing else", () => {
    const raw = new Uint8Array((100 * 20) / 8);
    const marked = markZones(raw, { w: 100, h: 20, dpi: 124, depth: 1 }, [
      { x: 8, y: 2, w: 16, h: 10 },
    ]);
    const stride = Math.ceil(100 / 8);
    const bit = (x: number, y: number): number =>
      ((marked[y * stride + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
    expect(bit(8, 2)).toBe(1);
    expect(bit(9, 5)).toBe(1);
    expect(bit(10, 5)).toBe(0);
    expect(bit(23, 11)).toBe(1);
    expect(bit(7, 5)).toBe(0);
    expect(bit(24, 5)).toBe(0);
    expect(raw.every((byte) => byte === 0)).toBe(true);
  });
});

describe("main", () => {
  it("writes png, zones png and zones json for each view", async () => {
    const out = join(dir, "ok", "nested");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const code = await main([...base, "--now", "2026-10-23T12:00:00Z", "--out", out], {
      renderer: fakeRenderer(),
    });
    log.mockRestore();
    expect(code).toBe(0);
    expect(readdirSync(out).sort()).toEqual([
      "agenda.png",
      "agenda.zones.json",
      "agenda.zones.png",
      "hoy.png",
      "hoy.zones.json",
      "hoy.zones.png",
      "pendientes.png",
      "pendientes.zones.json",
      "pendientes.zones.png",
    ]);
    for (const id of ["hoy", "pendientes", "agenda"]) {
      const png = new Uint8Array(readFileSync(join(out, `${id}.png`)));
      expect(checkImage("png1", png, P124).ok).toBe(true);
      const zones = validateZones(readFileSync(join(out, `${id}.zones.json`), "utf8"), P124);
      expect(zones.ok).toBe(true);
      if (id === "hoy" && zones.ok) expect(zones.value.zones).toHaveLength(13);
    }
  });

  it("exits with 2 for bad options or files, and creates nothing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = join(dir, "never");
    expect(await main(["--views", VIEWS], { renderer: fakeRenderer() })).toBe(2);
    expect(
      await main(
        ["--views", join(dir, "missing.json"), "--data", DATA, "--panel", PANEL, "--out", out],
        {
          renderer: fakeRenderer(),
        },
      ),
    ).toBe(2);
    err.mockRestore();
    expect(existsSync(out)).toBe(false);
  });

  it("exits with 1 when a view overflows", async () => {
    const renderer = fakeRenderer();
    const draw = renderer.render.bind(renderer);
    renderer.render = async (html, panel) => ({
      ...(await draw(html, panel)),
      overflow: ["lista"],
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await main([...base, "--out", join(dir, "bad")], { renderer });
    log.mockRestore();
    expect(err).toHaveBeenCalledWith(expect.stringContaining("overflow"));
    err.mockRestore();
    expect(code).toBe(1);
  });
});
