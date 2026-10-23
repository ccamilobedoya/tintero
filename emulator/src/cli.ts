// Command line of the emulator: `npm run emulator -- --server <url> --store <folder> ...`.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parsePanelHeader } from "../../contract/src/index.ts";
import { MAX_PEM_BYTES, readCapped } from "./capped.ts";
import { defaultConfig } from "./config.ts";
import { press } from "./press.ts";
import type { EmulatorConfig, Key } from "./types.ts";
import { runWake } from "./wake.ts";

const USAGE = `usage: emulator --server <url> [--store <folder>] [--panel w=800,h=480,dpi=124,depth=1]
  [--formats raw1] [--power battery|usb] [--battery-mv N] [--rssi N] [--firmware txt]
  [--extra-views N] [--flash-bytes N] [--timeout-ms N] [--wakes N] [--keys tab,long-tab,ok,long-ok]
  [--ca F --cert F --key F]   (https only; the three together)`;

const KEYS: readonly string[] = ["tab", "long-tab", "ok", "long-ok"];

class UsageError extends Error {}

function integer(name: string, value: string, min: number, max: number): number {
  if (!/^-?\d{1,10}$/.test(value)) throw new UsageError(`${name} must be an integer`);
  const number = Number(value);
  if (number < min || number > max) throw new UsageError(`${name} is out of range`);
  return number;
}

function parse(argv: string[]): { config: EmulatorConfig; wakes: number; keys: Key[] } {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        server: { type: "string" },
        store: { type: "string" },
        panel: { type: "string" },
        formats: { type: "string" },
        power: { type: "string" },
        "battery-mv": { type: "string" },
        rssi: { type: "string" },
        firmware: { type: "string" },
        "extra-views": { type: "string" },
        "flash-bytes": { type: "string" },
        "timeout-ms": { type: "string" },
        wakes: { type: "string" },
        keys: { type: "string" },
        ca: { type: "string" },
        cert: { type: "string" },
        key: { type: "string" },
      },
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : "invalid options", {
      cause: error,
    });
  }
  if (values.server === undefined) throw new UsageError("--server is required");
  let protocol: string;
  try {
    protocol = new URL(values.server).protocol;
  } catch {
    throw new UsageError("--server must be a URL");
  }
  if (protocol !== "http:" && protocol !== "https:") {
    throw new UsageError("--server must be http or https");
  }

  const tlsGiven = [values.ca, values.cert, values.key].filter((v) => v !== undefined).length;
  if (tlsGiven !== 0 && tlsGiven !== 3) throw new UsageError("--ca, --cert and --key go together");
  if (tlsGiven === 3 && protocol !== "https:") throw new UsageError("--ca/--cert/--key need https");

  const config = defaultConfig(values.server, values.store ?? join(tmpdir(), "tintero-emulator"));
  if (values.ca !== undefined && values.cert !== undefined && values.key !== undefined) {
    config.tls = { caFile: values.ca, certFile: values.cert, keyFile: values.key };
    // Read now (capped), so a bad file stops the run before any request.
    for (const [option, file] of [
      ["--ca", values.ca],
      ["--cert", values.cert],
      ["--key", values.key],
    ] as const) {
      try {
        readCapped(file, MAX_PEM_BYTES);
      } catch {
        throw new UsageError(`${option} cannot be read (missing, not a file, or over 64 KiB)`);
      }
    }
  }
  if (values.panel !== undefined) {
    const panel = parsePanelHeader(values.panel);
    if (!panel.ok) throw new UsageError("--panel must look like w=800,h=480,dpi=124,depth=1");
    config.panel = panel.value;
  }
  if (values.formats !== undefined) {
    const formats = values.formats.split(",");
    if (!formats.every((format) => format === "raw1" || format === "png1")) {
      throw new UsageError("--formats accepts raw1 and png1");
    }
    config.formats = formats;
  }
  if (values.power !== undefined) {
    if (values.power !== "battery" && values.power !== "usb") {
      throw new UsageError("--power must be battery or usb");
    }
    config.power = values.power;
  }
  if (values["battery-mv"] !== undefined) {
    config.batteryMv = integer("--battery-mv", values["battery-mv"], 2500, 4500);
  }
  if (values.rssi !== undefined) config.rssi = integer("--rssi", values.rssi, -120, 0);
  if (values.firmware !== undefined) {
    if (values.firmware.length < 1 || values.firmware.length > 32) {
      throw new UsageError("--firmware must have 1 to 32 characters");
    }
    config.firmware = values.firmware;
  }
  if (values["extra-views"] !== undefined) {
    config.extraViewsPerWake = integer("--extra-views", values["extra-views"], 0, 16);
  }
  if (values["flash-bytes"] !== undefined) {
    config.flashBytes = integer("--flash-bytes", values["flash-bytes"], 0, 1_073_741_824);
  }
  if (values["timeout-ms"] !== undefined) {
    config.timeoutMs = integer("--timeout-ms", values["timeout-ms"], 1, 600_000);
  }
  const wakes = values.wakes === undefined ? 1 : integer("--wakes", values.wakes, 0, 1000);
  const keys = values.keys === undefined || values.keys === "" ? [] : values.keys.split(",");
  if (!keys.every((key) => KEYS.includes(key))) throw new UsageError("--keys has an unknown key");
  return { config, wakes, keys: keys as Key[] };
}

/** Runs the CLI; returns the exit code. Output is one JSON per line. */
export async function main(
  argv: string[],
  out: (line: string) => void,
  err: (line: string) => void,
): Promise<number> {
  let parsed;
  try {
    parsed = parse(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    err(`${error.message}\n${USAGE}`);
    return 2;
  }
  for (let i = 0; i < parsed.wakes; i++) out(JSON.stringify(await runWake(parsed.config)));
  for (const key of parsed.keys) out(JSON.stringify(await press(parsed.config, key)));
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main(
    process.argv.slice(2),
    (line) => {
      console.log(line);
    },
    (line) => {
      console.error(line);
    },
  );
}
