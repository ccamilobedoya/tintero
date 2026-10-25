import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFatalHandlers } from "../../../server/src/fatal.ts";
import type { Line } from "./helpers.ts";

type Evt = "unhandledRejection" | "uncaughtException";
const EVENTS: Evt[] = ["unhandledRejection", "uncaughtException"];
type Listener = (...args: unknown[]) => void;

let saved: Record<Evt, Listener[]>;

/** Vitest escucha estos eventos: se apartan sus oyentes para que no cuenten nuestro evento simulado. */
beforeEach(() => {
  saved = {
    unhandledRejection: process.listeners("unhandledRejection") as Listener[],
    uncaughtException: process.listeners("uncaughtException") as Listener[],
  };
  for (const e of EVENTS) process.removeAllListeners(e);
});
afterEach(() => {
  vi.useRealTimers();
  for (const e of EVENTS) {
    process.removeAllListeners(e);
    // eslint-disable-next-line security/detect-object-injection -- clave fija
    for (const l of saved[e]) process.on(e, l as never);
  }
});

interface Rig {
  lines: Line[];
  order: string[];
  shutdown: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
}

function install(shutdownImpl: () => Promise<void>): Rig {
  const lines: Line[] = [];
  const order: string[] = [];
  const shutdown = vi.fn(() => {
    order.push("shutdown");
    return shutdownImpl();
  });
  const exit = vi.fn((code: number) => {
    order.push(`exit:${String(code)}`);
  });
  installFatalHandlers({
    log: (l) => lines.push(l),
    shutdown,
    exit,
    clock: () => new Date("2026-10-25T10:00:00Z"),
  });
  return { lines, order, shutdown, exit };
}

const emit = (event: string, ...args: unknown[]): void => {
  (process as unknown as { emit: (e: string, ...a: unknown[]) => boolean }).emit(event, ...args);
};
const reject = (reason: unknown): void => {
  emit("unhandledRejection", reason, Promise.resolve());
};

describe("CA4 error fatal", () => {
  it("unhandledRejection: una línea ts/event/kind sin mensaje, shutdown una vez y luego exit(1)", async () => {
    const r = install(() => Promise.resolve());
    reject(new Error("mensaje-secreto-123"));
    await vi.waitFor(() => {
      expect(r.exit).toHaveBeenCalled();
    });
    expect(r.lines).toHaveLength(1);
    expect(Object.keys(r.lines[0] ?? {}).sort()).toEqual(["event", "kind", "ts"]);
    expect(r.lines[0]).toMatchObject({ event: "fatal", kind: "unhandledRejection" });
    expect(typeof r.lines[0]?.ts).toBe("string");
    expect(JSON.stringify(r.lines)).not.toContain("mensaje-secreto-123");
    expect(r.shutdown).toHaveBeenCalledTimes(1);
    expect(r.exit).toHaveBeenCalledTimes(1);
    expect(r.exit).toHaveBeenCalledWith(1);
    expect(r.order).toEqual(["shutdown", "exit:1"]);
  });

  it("un segundo evento (de cualquier tipo) no hace nada", async () => {
    const r = install(() => Promise.resolve());
    reject(new Error("a"));
    await vi.waitFor(() => {
      expect(r.exit).toHaveBeenCalled();
    });
    reject(new Error("b"));
    emit("uncaughtException", new Error("c"), "uncaughtException");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(r.lines).toHaveLength(1);
    expect(r.shutdown).toHaveBeenCalledTimes(1);
    expect(r.exit).toHaveBeenCalledTimes(1);
  });

  it("uncaughtException: kind uncaughtException, también sin mensaje", async () => {
    const r = install(() => Promise.resolve());
    emit("uncaughtException", new Error("otro-secreto-456"), "uncaughtException");
    await vi.waitFor(() => {
      expect(r.exit).toHaveBeenCalledWith(1);
    });
    expect(r.lines).toHaveLength(1);
    expect(Object.keys(r.lines[0] ?? {}).sort()).toEqual(["event", "kind", "ts"]);
    expect(r.lines[0]).toMatchObject({ event: "fatal", kind: "uncaughtException" });
    expect(JSON.stringify(r.lines)).not.toContain("otro-secreto-456");
  });

  it("exit(1) espera a que shutdown termine (si tarda menos de 30 s)", async () => {
    let finish: () => void = () => undefined;
    const r = install(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    reject(new Error("x"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(r.shutdown).toHaveBeenCalledTimes(1);
    expect(r.exit).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => {
      expect(r.exit).toHaveBeenCalledWith(1);
    });
  });

  it("si shutdown no termina en 30 s (reloj de prueba), igual exit(1)", async () => {
    vi.useFakeTimers();
    const r = install(() => new Promise<void>(() => undefined));
    reject(new Error("x"));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(r.shutdown).toHaveBeenCalledTimes(1);
    expect(r.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(r.exit).toHaveBeenCalledTimes(1);
    expect(r.exit).toHaveBeenCalledWith(1);
    expect(r.lines).toHaveLength(1);
  });
});
