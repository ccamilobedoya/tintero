// `npm run server -- [--port N] [--host 127.0.0.1] [--next-wake-s N] [--headers-timeout-ms N]`
import { parseOptions, UsageError } from "./args.ts";
import { startServer } from "./index.ts";

let options;
try {
  options = parseOptions(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(
    `${error.message}\nusage: server [--port N] [--host 127.0.0.1] [--next-wake-s N] [--headers-timeout-ms N]`,
  );
  process.exit(2);
}

if (options.host !== "127.0.0.1") {
  console.error("the server only listens on 127.0.0.1 until F-004 (client certificate) exists");
  process.exit(2);
}

const running = await startServer(options.config, options.port);
console.log(JSON.stringify({ listening: running.url }));

const stop = (): void => {
  void running.close().then(() => {
    process.exit(0);
  });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
