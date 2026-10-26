// Preview of the views: `npm run render -- --views F --data F --panel w=800,h=480,dpi=124,depth=1
//   --out DIR [--device ID] [--now RFC3339] [--chromium http://127.0.0.1:N]`
// Writes, for each view of the device, `<id>.png` (the image the device gets), `<id>.zones.png`
// (zones outlined, 2 px, inverted) and `<id>.zones.json` (a ZonesResponse).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parsePanelHeader, type Panel, type ZonesResponse } from "../../contract/src/index.ts";
import { encodePng1 } from "../../emulator/src/png.ts";
import { cdpBase } from "../src/engine/chromium.ts";
import { readCapped } from "../src/tls.ts";
import { validDateTime } from "../src/engine/dates.ts";
import {
  ConfigError,
  chromiumRenderer,
  createEngine,
  loadDataFile,
  loadViewsConfig,
  startChromium,
  type Renderer,
} from "../src/engine/index.ts";

class UsageError extends Error {}

const USAGE =
  "usage: render --views F --data F --panel w=800,h=480,dpi=124,depth=1 --out DIR\n" +
  "  [--device ID] [--now RFC3339] [--chromium http://127.0.0.1:N] [--holidays F]";
const MAX_HOLIDAYS_BYTES = 65_536;
const BORDER = 2;
const DEVICE = /^(\*|[a-z0-9-]{1,32})$/;

export interface RenderArgs {
  views: string;
  data: string;
  panel: Panel;
  out: string;
  device: string;
  now?: Date;
  chromium?: string;
  /** JSON file with `{date, name}` entries, shown as the public holidays. */
  holidays?: string;
}

export function parseRenderArgs(argv: string[]): RenderArgs {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        views: { type: "string" },
        data: { type: "string" },
        panel: { type: "string" },
        out: { type: "string" },
        device: { type: "string" },
        now: { type: "string" },
        chromium: { type: "string" },
        holidays: { type: "string" },
      },
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : "invalid options", {
      cause: error,
    });
  }
  const { views, data, panel: panelText, out, device = "*", now, chromium, holidays } = values;
  if (views === undefined || data === undefined || panelText === undefined || out === undefined) {
    throw new UsageError("--views, --data, --panel and --out are required");
  }
  const panel = parsePanelHeader(panelText);
  if (!panel.ok) throw new UsageError("--panel must look like w=800,h=480,dpi=124,depth=1");
  if (!DEVICE.test(device)) throw new UsageError("--device is not a valid device id");
  if (now !== undefined && (now.length > 40 || !validDateTime(now))) {
    throw new UsageError("--now must be an RFC 3339 date and time");
  }
  if (chromium !== undefined) {
    try {
      cdpBase(chromium);
    } catch (error) {
      throw new UsageError("--chromium must be http://127.0.0.1:<port>", { cause: error });
    }
  }
  return {
    views,
    data,
    panel: panel.value,
    out,
    device,
    ...(now === undefined ? {} : { now: new Date(now) }),
    ...(chromium === undefined ? {} : { chromium: cdpBase(chromium) }),
    ...(holidays === undefined ? {} : { holidays }),
  };
}

/** The image with the border of each zone inverted (2 px, kept inside the zone). */
export function markZones(
  raw1: Uint8Array,
  panel: Panel,
  zones: { x: number; y: number; w: number; h: number }[],
): Uint8Array {
  const out = Uint8Array.from(raw1);
  const stride = Math.ceil(panel.w / 8);
  const flip = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= panel.w || y >= panel.h) return;
    const at = y * stride + (x >> 3);
    // eslint-disable-next-line security/detect-object-injection -- inside the panel, checked above
    out[at] = (out[at] ?? 0) ^ (0x80 >> (x & 7));
  };
  for (const zone of zones) {
    for (let y = zone.y; y < zone.y + zone.h; y++) {
      for (let x = zone.x; x < zone.x + zone.w; x++) {
        const edge =
          x < zone.x + BORDER ||
          x >= zone.x + zone.w - BORDER ||
          y < zone.y + BORDER ||
          y >= zone.y + zone.h - BORDER;
        if (edge) flip(x, y);
      }
    }
  }
  return out;
}

export async function main(argv: string[], injected?: { renderer?: Renderer }): Promise<number> {
  let args: RenderArgs;
  try {
    args = parseRenderArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${error.message}\n${USAGE}`);
    return 2;
  }
  let loaded;
  try {
    const config = loadViewsConfig(args.views);
    loaded = { config, data: loadDataFile(args.data, config) };
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    return 2;
  }

  // The holidays file is capped before it is parsed; any problem ends with code 2.
  let holidays: unknown;
  if (args.holidays !== undefined) {
    try {
      holidays = JSON.parse(readCapped(args.holidays, MAX_HOLIDAYS_BYTES).toString("utf8"));
    } catch (error) {
      const big = error instanceof Error && error.message === "file too large";
      console.error(`holidays: ${big ? "file too large" : "cannot be read or is not valid JSON"}`);
      return 2;
    }
  }

  let stopChromium: (() => Promise<void>) | undefined;
  let engine;
  try {
    let renderer = injected?.renderer;
    if (renderer === undefined) {
      let endpoint = args.chromium;
      if (endpoint === undefined) {
        const started = await startChromium();
        stopChromium = () => started.stop();
        endpoint = started.endpoint;
      }
      renderer = await chromiumRenderer(endpoint);
    }
    const now = args.now;
    engine = createEngine({
      ...loaded,
      renderer,
      nextWakeS: 1800,
      renderWaitMs: 60_000,
      ...(now === undefined ? {} : { clock: () => now }),
    });
    if (args.holidays !== undefined) {
      const set = engine.setHolidays(holidays);
      if (!set.ok) {
        console.error(`holidays: ${set.error}`);
        return 2;
      }
    }
    const result = await engine.index(args.device, args.panel);
    if (!result.ok) {
      console.error("could not draw the views");
      return 2;
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the folder comes from the command line of the owner
    mkdirSync(args.out, { recursive: true });
    const put = (name: string, data: string | Uint8Array): void => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- inside the folder of the owner; the name is a view id
      writeFileSync(join(args.out, name), data);
    };
    const bad: string[] = [];
    for (const view of result.value.views) {
      put(`${view.id}.png`, encodePng1(view.raw1, args.panel));
      put(
        `${view.id}.zones.png`,
        encodePng1(markZones(view.raw1, args.panel, view.zones), args.panel),
      );
      const body: ZonesResponse = { view: view.id, hash: view.hash, zones: view.zones };
      put(`${view.id}.zones.json`, `${JSON.stringify(body, null, 2)}\n`);
      if (view.overflow.length > 0) bad.push(`${view.id}: ${view.overflow.join(", ")}`);
    }
    console.log(`wrote ${result.value.views.length} views to ${args.out}`);
    if (bad.length > 0) {
      console.error(`overflow in: ${bad.join("; ")}`);
      return 1;
    }
    return 0;
  } catch {
    console.error("cannot draw: Chromium is not available or the output folder is not writable");
    return 2;
  } finally {
    await engine?.close();
    await stopChromium?.();
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
