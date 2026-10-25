// F-008 with a fake renderer: full_refresh each local day, Tintero-View, the zone guards.
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatPanelHeader, validateIndex, validateZones } from "../../../contract/src/index.ts";
import type { Panel } from "../../../contract/src/index.ts";
import { createApp } from "../index.ts";
import { loadDataFile, loadViewsConfig } from "./config.ts";
import type { Renderer } from "./chromium.ts";
import { createEngine, type Engine } from "./engine.ts";
import { fakeRenderer } from "./testing.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const config = loadViewsConfig(join(REPO, "config/tablero.views.example.json"));
const data = loadDataFile(join(REPO, "config/tablero.data.example.json"), config);
const P124: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const clock = { now: new Date("2026-10-24T17:00:00Z") };
const open: Engine[] = [];

function make(renderer: Renderer = fakeRenderer(), log?: (line: Record<string, unknown>) => void) {
  const engine = createEngine({
    config,
    data,
    renderer,
    clock: () => clock.now,
    nextWakeS: 1800,
    ...(log === undefined ? {} : { log }),
  });
  open.push(engine);
  return engine;
}

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(async () => {
  clock.now = new Date("2026-10-24T17:00:00Z");
  vi.restoreAllMocks();
  for (const engine of open.splice(0)) await engine.close();
});

async function index(engine: Engine, device = "local", view?: string) {
  const result = await engine.index(device, P124, view === undefined ? {} : { view });
  if (!result.ok) throw new Error("busy");
  return result.value;
}

describe("full_refresh once per local day and device", () => {
  it("is true on the first index, false later the same day, true on the next local day", async () => {
    const engine = make();
    expect((await index(engine)).fullRefresh).toBe(true);
    clock.now = new Date("2026-10-24T17:10:00Z");
    expect((await index(engine)).fullRefresh).toBe(false);
    clock.now = new Date("2026-10-25T05:01:00Z"); // 00:01 of the 25th in Lima
    expect((await index(engine)).fullRefresh).toBe(true);
    expect((await index(engine, "otro")).fullRefresh).toBe(true);
  });
});

describe("Tintero-View", () => {
  it("picks `current` from the view the device shows, ignoring unknown ones", async () => {
    const engine = make();
    expect((await index(engine, "local", "tablero")).current).toBe("tablero");
    expect((await index(engine, "local", "nada")).current).toBe("hoy");
    expect((await index(engine)).current).toBe("hoy");
  });

  it("draws the view on screen first", async () => {
    const renderer = fakeRenderer();
    const engine = make(renderer);
    await index(engine, "local", "tablero");
    expect(renderer.calls[0]).toContain("Tablero");
    expect(renderer.calls[0]).not.toContain(">Hoy<");
  });

  it("is read over HTTP: valid value, 400 for a bad one, and full_refresh", async () => {
    const engine = make();
    const { app } = createApp({ nextWakeS: 1800, headersTimeoutMs: 10_000, engine });
    const base = {
      "Tintero-Protocol": "1",
      "Tintero-Firmware": "t",
      "Tintero-Power": "usb",
      "Tintero-Formats": "raw1",
      "Tintero-Panel": formatPanelHeader(P124),
    };
    const good = await app.inject({
      method: "GET",
      url: "/api/v1/index",
      headers: { ...base, "Tintero-View": "tablero" },
    });
    const parsed = validateIndex(good.body);
    expect(parsed.ok && parsed.value.current).toBe("tablero");
    expect(parsed.ok && parsed.value.full_refresh).toBe(true);
    const bad = await app.inject({
      method: "GET",
      url: "/api/v1/index",
      headers: { ...base, "Tintero-View": "Tablero!" },
    });
    expect(bad.statusCode).toBe(400);
    const again = validateIndex(
      (await app.inject({ method: "GET", url: "/api/v1/index", headers: base })).body,
    );
    expect(again.ok && again.value.full_refresh).toBe(false);
    if (!parsed.ok) throw new Error("invalid index");
    const view = parsed.value.views[0];
    const zones = await app.inject({
      method: "GET",
      url: `/api/v1/views/${view?.id ?? ""}/zones?h=${view?.hash ?? ""}`,
      headers: base,
    });
    const checked = validateZones(zones.body, P124);
    expect(checked.ok && checked.value.focus).toEqual({ ring: 3, pad: 6, dash: 8 });
    await app.close();
  });
});

describe("guards on zones", () => {
  const wrapped = (change: (out: Awaited<ReturnType<Renderer["render"]>>) => void): Renderer => {
    const inner = fakeRenderer();
    return {
      ...inner,
      render: async (html, panel, options) => {
        const out = await inner.render(html, panel, options);
        change(out);
        return out;
      },
    };
  };

  it("leaves out an unaligned zone and logs it without text", async () => {
    const lines: Record<string, unknown>[] = [];
    const renderer = wrapped((out) => {
      out.boxes.forEach((box, i) => {
        if (i === 0) box.x = 10;
      });
    });
    const engine = make(renderer, (line) => lines.push(line));
    const { views } = await index(engine);
    const first = fakeRenderer();
    const reference = await make(first).index("ref", P124);
    expect(reference.ok && reference.value.views[0]?.zones.length).toBe(
      (views[0]?.zones.length ?? 0) + 1,
    );
    expect(lines).toContainEqual({ event: "zone-unaligned", view: "hoy" });
  });

  it("lists the zones with ink in the band and logs only a count", async () => {
    const lines: Record<string, unknown>[] = [];
    const renderer = wrapped((out) => {
      out.raw1.fill(0);
      // One black pixel (a 1 bit) at the left edge of the first zone (x = 8, y = 20): in its band.
      out.raw1.set([0x80], 20 * 100 + 1);
    });
    const engine = make(renderer, (line) => lines.push(line));
    const { views } = await index(engine);
    expect(views[0]?.bandInk).toHaveLength(1);
    expect(lines).toContainEqual({ event: "focus-band-ink", view: "hoy", count: 1 });
    expect(JSON.stringify(lines)).not.toContain("reciclaje");
  });
});
