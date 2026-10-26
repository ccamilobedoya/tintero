// `npm run server -- [--port N] [--host 127.0.0.1] [--next-wake-s N] [--headers-timeout-ms N]
//   [--tls-cert F --tls-key F --client-ca F --devices F] [--max-panels N] [--max-connections N]
//   [--views F --data F [--chromium http://127.0.0.1:N] [--integrations F]]
//   [--instance NAME]`
import { accessSync, constants, statSync } from "node:fs";
import { dirname } from "node:path";
import { parseOptions, UsageError } from "./args.ts";
import { checkAgainstData, loadCalendars, loadIntegrations } from "./integrations/config.ts";
import {
  createIcalCalendars,
  ICAL_HTTP_LIMITS,
  type IcalCalendars,
} from "./integrations/ical-calendar.ts";
import {
  createHolidays,
  HOLIDAYS_HTTP_LIMITS,
  type Holidays,
} from "./integrations/holidays-nager.ts";
import { guardedHttp, IntegrationHttpError, parseBase } from "./integrations/http.ts";
import { holidaysManifest, icalManifest, triliumTasksManifest } from "./integrations/manifest.ts";
import { createTriliumTasks, type TriliumTasks } from "./integrations/trilium-tasks.ts";
import {
  ConfigError,
  chromiumRenderer,
  createEngine,
  loadDataFile,
  loadViewsConfig,
  startChromiumService,
  type Engine,
} from "./engine/index.ts";
import { startServer } from "./index.ts";
import { installFatalHandlers } from "./fatal.ts";
import { logEngine } from "./log.ts";
import { shutdown, type ShutdownStep } from "./shutdown.ts";

const USAGE =
  "usage: server [--port N] [--host 127.0.0.1] [--next-wake-s N] [--headers-timeout-ms N]\n" +
  "  [--tls-cert F --tls-key F --client-ca F --devices F] [--max-panels N] [--max-connections N]\n" +
  "  [--views F --data F [--chromium http://127.0.0.1:N] [--integrations F]]\n" +
  "  [--instance NAME]";

/** The folder of the state file must exist and be writable (ADR-0044); exits like any config error. */
function checkStateFolder(stateFile: string, pointer: string): void {
  const folder = dirname(stateFile);
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the owner's configuration
    if (!statSync(folder).isDirectory()) throw new Error("not a folder");
    accessSync(folder, constants.W_OK | constants.X_OK);
  } catch {
    throw new ConfigError(`integrations: ${pointer}: folder must exist and be writable`);
  }
}

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
let tasks: TriliumTasks | undefined;
let holidays: Holidays | undefined;
let calendars: IcalCalendars | undefined;
// Integrations, then the engine, then the container: the container always gets its turn.
const steps = (): ShutdownStep[] => [
  { name: "integrations", run: () => tasks?.stop(), timeoutMs: 6000 },
  { name: "holidays", run: () => holidays?.stop(), timeoutMs: 6000 },
  { name: "calendars", run: () => calendars?.stop(), timeoutMs: 6000 },
  { name: "engine", run: () => engine?.close(), timeoutMs: 5000 },
  { name: "chromium", run: () => stopChromium?.(), timeoutMs: 25_000 },
];
const server: { close?: () => Promise<void> } = {};
const allSteps = (): ShutdownStep[] => [
  { name: "server", run: () => server.close?.(), timeoutMs: 3000 },
  ...steps(),
];
// An error nobody caught: one line, ordered shutdown, exit 1 (systemd restarts the service).
installFatalHandlers({
  log: logEngine,
  shutdown: () => shutdown(allSteps()),
  exit: (code) => process.exit(code),
});
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
  // Integrations are checked before Chromium starts: their errors need no Docker.
  let integration;
  let festivos;
  let ical;
  const country = loaded.config.holidays?.country;
  if (options.integrations === undefined && country !== undefined) {
    logEngine({ ts: new Date().toISOString(), msg: "holidays: festivos integration is off" });
  }
  if (options.integrations !== undefined) {
    try {
      const file = loadIntegrations(options.integrations);
      checkAgainstData(file, loaded.data);
      const config = file.integrations["trilium-tareas"];
      if (config !== undefined) {
        if (config.stateFile !== undefined)
          checkStateFolder(config.stateFile, "/integrations/trilium-tareas/stateFile");
        const http = guardedHttp(parseBase(config.baseUrl), config.keyFile, triliumTasksManifest, {
          allowWrite: config.allowWrite,
          log: logEngine,
        });
        integration = { config, http };
      }
      const nager = file.integrations.festivos;
      if (nager === undefined && country !== undefined) {
        logEngine({ ts: new Date().toISOString(), msg: "holidays: festivos integration is off" });
      } else if (nager !== undefined && country === undefined) {
        logEngine({ ts: new Date().toISOString(), msg: "festivos: no country in views" });
      } else if (nager !== undefined && country !== undefined) {
        if (nager.stateFile !== undefined) {
          checkStateFolder(nager.stateFile, "/integrations/festivos/stateFile");
        }
        const http = guardedHttp(parseBase(nager.baseUrl), undefined, holidaysManifest, {
          ...HOLIDAYS_HTTP_LIMITS,
          log: logEngine,
        });
        festivos = { config: nager, http, country };
      }
      const owned = file.integrations["ical-calendario"];
      if (owned !== undefined) {
        if (owned.stateFile !== undefined) {
          checkStateFolder(owned.stateFile, "/integrations/ical-calendario/stateFile");
        }
        // Each address is a secret: it is split into origin and path here and goes no further.
        const list = loadCalendars(owned.calendarsFile).map((entry) => {
          const url = new URL(entry.url);
          return {
            id: entry.id,
            icon: entry.icon,
            path: url.pathname,
            http: guardedHttp(new URL(url.origin), undefined, icalManifest, {
              ...ICAL_HTTP_LIMITS,
              log: logEngine,
            }),
          };
        });
        ical = { config: owned, list };
      }
    } catch (error) {
      if (error instanceof ConfigError) console.error(error.message);
      else if (error instanceof IntegrationHttpError) console.error(`integrations: ${error.code}`);
      else throw error;
      process.exit(2);
    }
  }
  try {
    let renderer;
    if (options.chromium !== undefined) renderer = await chromiumRenderer(options.chromium);
    else {
      // Waits for Docker and for a Chromium that answers; relaunches it if it dies (F-011).
      const service = await startChromiumService({
        log: logEngine,
        ...(options.instance === undefined ? {} : { instance: options.instance }),
      });
      stopChromium = () => service.stop();
      renderer = service.renderer;
    }
    engine = createEngine({
      ...loaded,
      renderer,
      nextWakeS: options.config.nextWakeS,
      log: logEngine,
      onToggle: (change) => tasks?.onToggle(change),
    });
    if (integration !== undefined) {
      tasks = createTriliumTasks({
        ...integration,
        manifest: triliumTasksManifest,
        engine,
        log: logEngine,
      });
      tasks.start();
    }
    if (festivos !== undefined) {
      holidays = createHolidays({
        http: festivos.http,
        country: festivos.country,
        engine,
        ...(festivos.config.stateFile === undefined
          ? {}
          : { stateFile: festivos.config.stateFile }),
        timeZone: loaded.config.timezone,
        log: logEngine,
      });
      holidays.start();
    }
    if (ical !== undefined) {
      calendars = createIcalCalendars({
        calendars: ical.list,
        source: ical.config.source,
        engine,
        timeZone: loaded.config.timezone,
        ...(ical.config.stateFile === undefined ? {} : { stateFile: ical.config.stateFile }),
        log: logEngine,
      });
      calendars.start();
    }
  } catch {
    await shutdown(steps());
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
  await shutdown(steps());
  console.error(
    "cannot start: the TLS files or the device list cannot be read, or the port is busy",
  );
  process.exit(2);
}
server.close = () => running.close();
console.log(JSON.stringify({ listening: running.url }));

let stopping = false;
const stop = (): void => {
  if (stopping) return;
  stopping = true;
  shutdown(allSteps())
    .catch(() => undefined) // shutdown does not reject; exit either way
    .finally(() => {
      process.exit(0);
    });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
