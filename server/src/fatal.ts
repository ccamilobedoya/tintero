// Fatal errors (F-011 D4): log one line without content, shut down in order, exit with 1 so that
// systemd restarts the service with a clean state.
const SHUTDOWN_LIMIT_MS = 30_000;

export function installFatalHandlers(options: {
  log: (line: Record<string, unknown>) => void;
  shutdown: () => Promise<void>;
  exit: (code: number) => void;
  clock?: () => Date;
}): void {
  const clock = options.clock ?? ((): Date => new Date());
  let handled = false;
  const onFatal = (kind: "uncaughtException" | "unhandledRejection"): void => {
    if (handled) return;
    handled = true;
    // Neither the message nor the stack: they may carry content.
    try {
      options.log({ ts: clock().toISOString(), event: "fatal", kind });
    } catch {
      // the shutdown and the exit must happen anyway
    }
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SHUTDOWN_LIMIT_MS);
    });
    Promise.race([Promise.resolve().then(options.shutdown), limit])
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        options.exit(1);
      });
  };
  process.on("uncaughtException", () => {
    onFatal("uncaughtException");
  });
  process.on("unhandledRejection", () => {
    onFatal("unhandledRejection");
  });
}
