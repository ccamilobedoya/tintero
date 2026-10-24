import { describe, expect, it } from "vitest";
import { shutdown } from "./shutdown.ts";

describe("shutdown", () => {
  it("runs the steps in order", async () => {
    const calls: string[] = [];
    await shutdown([
      { name: "server", run: () => Promise.resolve(calls.push("server")), timeoutMs: 100 },
      { name: "engine", run: () => Promise.resolve(calls.push("engine")), timeoutMs: 100 },
      { name: "chromium", run: () => Promise.resolve(calls.push("chromium")), timeoutMs: 100 },
    ]);
    expect(calls).toEqual(["server", "engine", "chromium"]);
  });

  it("stops Chromium even if a step fails", async () => {
    const calls: string[] = [];
    await shutdown([
      { name: "server", run: () => Promise.reject(new Error("boom")), timeoutMs: 100 },
      {
        name: "engine",
        run: () => {
          throw new Error("sync boom");
        },
        timeoutMs: 100,
      },
      { name: "chromium", run: () => Promise.resolve(calls.push("chromium")), timeoutMs: 100 },
    ]);
    expect(calls).toEqual(["chromium"]);
  });

  it("stops Chromium even if a step hangs", async () => {
    const calls: string[] = [];
    const started = Date.now();
    await shutdown([
      { name: "server", run: () => new Promise(() => undefined), timeoutMs: 30 },
      { name: "chromium", run: () => Promise.resolve(calls.push("chromium")), timeoutMs: 100 },
    ]);
    expect(calls).toEqual(["chromium"]);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("accepts a step that returns nothing", async () => {
    await expect(
      shutdown([{ name: "none", run: () => undefined, timeoutMs: 10 }]),
    ).resolves.toBeUndefined();
  });
});
