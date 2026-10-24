// `npm run server -- [--port N] [--host 127.0.0.1] [--next-wake-s N] [--headers-timeout-ms N]
//   [--tls-cert F --tls-key F --client-ca F --devices F] [--max-panels N] [--max-connections N]
//   [--views F --data F [--chromium http://127.0.0.1:N]]`
import { accessSync, constants } from "node:fs";
import { parseOptions, UsageError } from "./args.ts";
import {
  ConfigError,
  chromiumRenderer,
  createEngine,
  loadDataFile,
  loadViewsConfig,
  startChromium,
  type Engine,
} from "./engine/index.ts";
import { startServer } from "./index.ts";
import { logEngine } from "./log.ts";

const USAGE =
  "usage: server [--port N] [--host 127.0.0.1] [--next-wake-s N] [--headers-timeout-ms N]\n" +
  "  [--tls-cert F --tls-key F --client-ca F --devices F] [--max-panels N] [--max-connections N]\n" +
  "  [--views F --data F [--chromium http://127.0.0.1:N]]";

let options;
try {
  options = parseOptions(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}

if (options.host !== "127.0.0.1") {
  console.error(
    "the server only listens on 127.0.0.1 ; outside access goes through Funnel --tcp with TLS and client certificates (F-004)",
  );
  process.exit(2);
}

// The view engine (F-005): only with --views and --data; without them the demonstration runs.
let engine: Engine | undefined;
let stopChromium: (() => Promise<void>) | undefined;
if (options.views !== undefined && options.data !== undefined) {
  let loaded;
  try {
    const config = loadViewsConfig(options.views);
    loaded = { config, data: loadDataFile(options.data, config) };
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(2);
  }
  try {
    let endpoint = options.chromium;
    if (endpoint === undefined) {
      const started = await startChromium();
      stopChromium = () => started.stop();
      endpoint = started.endpoint;
    }
    engine = createEngine({
      ...loaded,
      renderer: await chromiumRenderer(endpoint),
      nextWakeS: options.config.nextWakeS,
      log: logEngine,
    });
  } catch {
    await stopChromium?.();
    console.error("cannot start the view engine: Chromium is not available");
    process.exit(2);
  }
}

let running;
try {
  if (options.config.tls) accessSync(options.config.tls.devicesFile, constants.R_OK);
  running = await startServer(
    engine === undefined ? options.config : { ...options.config, engine },
    options.port,
  );
} catch {
  await engine?.close();
  await stopChromium?.();
  console.error(
    "cannot start: the TLS files or the device list cannot be read, or the port is busy",
  );
  process.exit(2);
}
console.log(JSON.stringify({ listening: running.url }));

const stop = (): void => {
  void running
    .close()
    .then(() => engine?.close())
    .then(() => stopChromium?.())
    .finally(() => {
      process.exit(0);
    });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
