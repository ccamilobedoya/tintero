// `npm run server -- [--port N] [--host 127.0.0.1] [--next-wake-s N] [--headers-timeout-ms N]
//   [--tls-cert F --tls-key F --client-ca F --devices F] [--max-panels N] [--max-connections N]`
import { accessSync, constants } from "node:fs";
import { parseOptions, UsageError } from "./args.ts";
import { startServer } from "./index.ts";

const USAGE =
  "usage: server [--port N] [--host 127.0.0.1] [--next-wake-s N] [--headers-timeout-ms N]\n" +
  "  [--tls-cert F --tls-key F --client-ca F --devices F] [--max-panels N] [--max-connections N]";

let options;
try {
  options = parseOptions(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}

if (options.host !== "127.0.0.1") {
  console.error("the server only listens on 127.0.0.1 (Funnel --tcp forwards to it)");
  process.exit(2);
}

let running;
try {
  if (options.config.tls) accessSync(options.config.tls.devicesFile, constants.R_OK);
  running = await startServer(options.config, options.port);
} catch {
  console.error(
    "cannot start: the TLS files or the device list cannot be read, or the port is busy",
  );
  process.exit(2);
}
console.log(JSON.stringify({ listening: running.url }));

const stop = (): void => {
  void running.close().then(() => {
    process.exit(0);
  });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
