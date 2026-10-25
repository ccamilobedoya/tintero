import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFatalHandlers } from "./fatal.ts";

let savedUncaught: NodeJS.UncaughtExceptionListener[] = [];
let savedRejection: NodeJS.UnhandledRejectionListener[] = [];

// The test runner listens to these events too: take its listeners out while we emit.
beforeEach(() => {
  savedUncaught = process.listeners("uncaughtException");
  savedRejection = process.listeners("unhandledRejection");
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");
});
afterEach(() => {
  vi.useRealTimers();
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");
  for (const fn of savedUncaught) process.on("uncaughtException", fn);
  for (const fn of savedRejection) process.on("unhandledRejection", fn);
});

describe("installFatalHandlers", () => {
  it("logs one line without content, shuts down once, exits 1 and ignores a second event", async () => {
    const lines: Record<string, unknown>[] = [];
    const exit = vi.fn();
    const shutdown = vi.fn(() => Promise.resolve());
    installFatalHandlers({
      log: (l) => lines.push(l),
      shutdown,
      exit,
      clock: () => new Date("2026-10-25T10:00:00Z"),
    });
    process.emit("unhandledRejection", new Error("secret content"), Promise.resolve());
    process.emit("uncaughtException", new Error("another"));
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledTimes(1);
    });
    expect(lines).toEqual([
      { ts: "2026-10-25T10:00:00.000Z", event: "fatal", kind: "unhandledRejection" },
    ]);
    expect(Object.keys(lines[0] ?? {}).sort()).toEqual(["event", "kind", "ts"]);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(shutdown.mock.invocationCallOrder[0]).toBeLessThan(
      exit.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("names an uncaught exception", async () => {
    const lines: Record<string, unknown>[] = [];
    const exit = vi.fn();
    installFatalHandlers({
      log: (l) => lines.push(l),
      shutdown: () => Promise.resolve(),
      exit,
    });
    process.emit("uncaughtException", new Error("x"));
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(1);
    });
    expect(lines[0]).toMatchObject({ event: "fatal", kind: "uncaughtException" });
  });

  it("exits with 1 even if the shutdown fails", async () => {
    const exit = vi.fn();
    installFatalHandlers({
      log: () => undefined,
      shutdown: () => Promise.reject(new Error("boom")),
      exit,
    });
    process.emit("uncaughtException", new Error("x"));
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(1);
    });
  });

  it("exits with 1 after 30 s if the shutdown never ends", async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    installFatalHandlers({
      log: () => undefined,
      shutdown: () => new Promise<void>(() => undefined),
      exit,
    });
    process.emit("uncaughtException", new Error("x"));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
