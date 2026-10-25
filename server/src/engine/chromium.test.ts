import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHROMIUM_LABEL,
  INSTANCE_NAME,
  cdpBase,
  chromiumRenderer,
  chromiumDockerArgs,
  parseContainerIds,
  priorityQueue,
  removeOrphanChromium,
  startChromiumService,
  stopContainer,
  waitForDocker,
} from "./chromium.ts";

// A fake `docker` in a temporary folder: `version` fails the first FAKE_FAILS times (counted in a
// file), `image inspect` fails, everything else succeeds quietly. Every call is written down.
let fakeDir: string;
beforeEach(() => {
  fakeDir = mkdtempSync(join(tmpdir(), "tintero-fakedocker-"));
  /* eslint-disable security/detect-non-literal-fs-filename -- temporary test folder */
  writeFileSync(
    join(fakeDir, "docker"),
    [
      "#!/bin/bash",
      'echo "$*" >> "$FAKE_DIR/calls"',
      'if [ "$1" = version ]; then',
      '  n=$(cat "$FAKE_DIR/count" 2>/dev/null || echo 0)',
      '  echo $((n+1)) > "$FAKE_DIR/count"',
      '  [ "$n" -lt "$FAKE_FAILS" ] && exit 1',
      "  echo 29.0; exit 0",
      "fi",
      '[ "$1" = image ] && [ -z "$FAKE_IMAGE_OK" ] && exit 1',
      '[ "$1" = run ] && [ -n "$FAKE_RUN_FAILS" ] && exit 1',
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(join(fakeDir, "docker"), 0o755);
  /* eslint-enable security/detect-non-literal-fs-filename */
  vi.stubEnv("PATH", `${fakeDir}:${process.env.PATH ?? ""}`);
  vi.stubEnv("FAKE_DIR", fakeDir);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(fakeDir, { recursive: true, force: true });
});
const calls = (): string[] =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- temporary test folder
  readFileSync(join(fakeDir, "calls"), "utf8").trim().split("\n");

describe("waitForDocker", () => {
  it("retries with 1, 2 and 4 s waits and logs one failure and one recovery", async () => {
    vi.stubEnv("FAKE_FAILS", "3");
    const sleeps: number[] = [];
    const lines: Record<string, unknown>[] = [];
    await waitForDocker({
      log: (l) => lines.push(l),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    expect(calls().filter((c) => c.startsWith("version"))).toHaveLength(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(lines).toEqual([
      expect.objectContaining({ event: "docker", ok: false }),
      expect.objectContaining({ event: "docker", ok: true, waitedS: 0 }),
    ]);
  });

  it("caps the wait at 60 s, logs once per hour and ends with the signal", async () => {
    vi.stubEnv("FAKE_FAILS", "1000");
    const start = Date.parse("2026-10-25T10:00:00Z");
    let now = start;
    const sleeps: number[] = [];
    const lines: Record<string, unknown>[] = [];
    const controller = new AbortController();
    const done = waitForDocker({
      log: (l) => lines.push(l),
      clock: () => new Date(now),
      signal: controller.signal,
      sleep: (ms) => {
        sleeps.push(ms);
        now += ms;
        if (sleeps.length === 75) controller.abort();
        return Promise.resolve();
      },
    });
    await expect(done).rejects.toThrow();
    expect(sleeps.slice(0, 9)).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
    expect(Math.max(...sleeps)).toBe(60000);
    const fails = lines.filter((l) => l.ok === false);
    expect(fails).toHaveLength(2); // ~79 min of waiting: the first and one more after an hour
    expect(lines.some((l) => l.ok === true)).toBe(false);
  });
});

describe("startChromiumService without the image", () => {
  it("never pulls or runs: it says image-missing and waits", async () => {
    vi.stubEnv("FAKE_FAILS", "0");
    const lines: Record<string, unknown>[] = [];
    const image = "tintero-imagen-que-no-existe:0";
    let slept = 0;
    await expect(
      startChromiumService({
        image,
        log: (l) => lines.push(l),
        sleep: () => {
          if (++slept > 1) return Promise.reject(new Error("end of test"));
          return Promise.resolve();
        },
      }),
    ).rejects.toThrow("end of test");
    expect(lines).toContainEqual(
      expect.objectContaining({
        event: "chromium",
        action: "start",
        ok: false,
        code: "image-missing",
      }),
    );
    expect(lines.filter((l) => l.code === "image-missing")).toHaveLength(1); // once per hour
    const all = calls();
    expect(all.some((c) => c.startsWith("pull") || c.startsWith("run"))).toBe(false);
    expect(all.some((c) => c.startsWith("image inspect") && c.includes(image))).toBe(true);
  });
});

describe("startChromiumService with a failing run", () => {
  it("removes its own container (rm -f <name>) after every failed run", async () => {
    vi.stubEnv("FAKE_FAILS", "0");
    vi.stubEnv("FAKE_IMAGE_OK", "1");
    vi.stubEnv("FAKE_RUN_FAILS", "1");
    let slept = 0;
    await expect(
      startChromiumService({
        image: "img:0",
        sleep: () => {
          if (++slept > 2) return Promise.reject(new Error("end of test"));
          return Promise.resolve();
        },
      }),
    ).rejects.toThrow("end of test");
    const all = calls();
    const runs = all.filter((c) => c.startsWith("run"));
    expect(runs.length).toBeGreaterThanOrEqual(2);
    for (const run of runs) {
      const name = /--name (tintero-chromium-[0-9a-f]{8})/.exec(run)?.[1];
      expect(name).toBeDefined();
      expect(all).toContain(`rm -f ${name ?? ""}`);
    }
  });
});

describe("pull never", () => {
  it("is placed before the image", () => {
    const args = chromiumDockerArgs("tintero-chromium-x", 0, "/f", "img@sha256:abc");
    const at = args.indexOf("--pull");
    expect(at).toBeGreaterThan(-1);
    expect(args[at + 1]).toBe("never");
    expect(at + 1).toBeLessThan(args.indexOf("img@sha256:abc"));
  });
});

describe("priorityQueue", () => {
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  it("starts no `low` task while a `normal` one waits, one at a time", async () => {
    const enqueue = priorityQueue();
    const order: string[] = [];
    let running = 0;
    const task = (name: string) => async () => {
      running++;
      expect(running).toBe(1);
      order.push(name);
      await sleep(20);
      running--;
    };
    const all = [
      enqueue(task("low1"), "low"),
      enqueue(task("low2"), "low"),
      enqueue(task("low3"), "low"),
      enqueue(task("n1")),
      enqueue(task("n2"), "normal"),
    ];
    await Promise.all(all);
    expect(order).toEqual(["low1", "n1", "n2", "low2", "low3"]);
  });

  it("makes a `normal` arriving during a `low` wait only for that `low`", async () => {
    const enqueue = priorityQueue();
    const started: number[] = [];
    const t0 = Date.now();
    const slow = (ms: number) => async () => {
      started.push(Date.now() - t0);
      await sleep(ms);
    };
    const lows = [enqueue(slow(100), "low"), enqueue(slow(100), "low"), enqueue(slow(100), "low")];
    await sleep(30);
    await enqueue(slow(1));
    expect(started[1]).toBeLessThan(180); // right after the first `low`, before the other two
    await Promise.all(lows);
    expect(started).toHaveLength(4);
  });

  it("keeps going after a task fails", async () => {
    const enqueue = priorityQueue();
    const failing = enqueue(() => Promise.reject(new Error("x")));
    await expect(failing).rejects.toThrow("x");
    await expect(enqueue(() => Promise.resolve(7))).resolves.toBe(7);
  });
});

describe("chromiumDockerArgs", () => {
  const args = chromiumDockerArgs("tintero-chromium-x", 0, "/f", "img@sha256:abc");

  it("hardens the container", () => {
    for (const piece of [
      "-p",
      "127.0.0.1:0:9222",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--memory",
      "512m",
      "--pids-limit",
      "256",
      "--mount",
      "type=bind,source=/f,target=/tintero/fonts,readonly",
      "img@sha256:abc",
    ]) {
      expect(args).toContain(piece);
    }
  });

  it("has no volume, privilege, host network or open address", () => {
    for (const piece of ["-v", "--privileged", "--network", "host"]) {
      expect(args).not.toContain(piece);
    }
    expect(args.join(" ")).not.toContain("0.0.0.0");
  });

  it("puts the image before the browser flags, which come last", () => {
    expect(args.slice(args.indexOf("img@sha256:abc") + 1)).toEqual([
      "--font-render-hinting=full",
      "--disable-font-subpixel-positioning",
      "--disable-lcd-text",
    ]);
    expect(args.slice(0, 4)).toEqual(["run", "--rm", "-d", "--name"]);
  });
});

describe("chromium label", () => {
  it("is added before the image", () => {
    const args = chromiumDockerArgs("tintero-chromium-abcd1234", 0, "/f", "img@sha256:abc");
    const at = args.indexOf("--label");
    expect(CHROMIUM_LABEL).toBe("tintero.chromium=1");
    expect(at).toBeGreaterThan(-1);
    expect(args[at + 1]).toBe("tintero.chromium=1");
    expect(at + 1).toBeLessThan(args.indexOf("img@sha256:abc"));
    expect(args).not.toContain("tintero.instance=prueba-a");
  });

  it("adds the instance label before the image and rejects bad names", () => {
    const args = chromiumDockerArgs(
      "tintero-chromium-abcd1234",
      0,
      "/f",
      "img@sha256:abc",
      "prueba-a",
    );
    const at = args.indexOf("tintero.instance=prueba-a");
    expect(args[at - 1]).toBe("--label");
    expect(at).toBeLessThan(args.indexOf("img@sha256:abc"));
    expect(() =>
      chromiumDockerArgs("tintero-chromium-abcd1234", 0, "/f", "img@sha256:abc", "Prueba A"),
    ).toThrow();
  });

  it("removeOrphanChromium rejects a bad instance before calling docker", async () => {
    for (const bad of ["Prueba A", "", "a".repeat(33), "x;y"]) {
      await expect(removeOrphanChromium(bad)).rejects.toThrow("invalid instance name");
    }
    expect(INSTANCE_NAME.test("servicio")).toBe(true);
  });
});

describe("parseContainerIds", () => {
  it("accepts hex ids of 12 to 64 characters and empty output", () => {
    expect(parseContainerIds("")).toEqual([]);
    expect(parseContainerIds(`0123456789ab\n${"f".repeat(64)}\n`)).toEqual([
      "0123456789ab",
      "f".repeat(64),
    ]);
  });

  it("throws on anything else", () => {
    for (const bad of ["abc", "0123456789AB", "0123456789ab; rm", "g".repeat(12), "f".repeat(65)]) {
      expect(() => parseContainerIds(`0123456789ab\n${bad}\n`)).toThrow();
    }
  });
});

describe("stopContainer", () => {
  it("launches docker stop detached, without stdio or shell, and waits for it", async () => {
    const calls: unknown[][] = [];
    let unrefs = 0;
    const fake = ((...args: unknown[]) => {
      calls.push(args);
      const child = new EventEmitter() as EventEmitter & { unref(): void };
      child.unref = () => {
        unrefs++;
      };
      setTimeout(() => child.emit("exit", 0), 5);
      return child;
    }) as unknown as typeof spawn;
    await stopContainer("tintero-chromium-0123abcd", fake);
    expect(calls).toHaveLength(1);
    const [cmd, args, opts] = calls[0] ?? [];
    expect(cmd).toBe("docker");
    expect(args).toEqual(["stop", "--time", "2", "tintero-chromium-0123abcd"]);
    expect(opts).toMatchObject({ detached: true, stdio: "ignore" });
    expect(opts).not.toHaveProperty("shell");
    expect(unrefs).toBe(1);
  });

  it("does not launch anything for a name that is not ours", async () => {
    let launched = 0;
    const fake = (() => {
      launched++;
    }) as unknown as typeof spawn;
    await stopContainer("other; rm", fake);
    expect(launched).toBe(0);
  });
});

describe("chromiumRenderer with a frozen Chromium", () => {
  it("rejects a timed-out drawing even if closing the context never answers", async () => {
    const never = (): Promise<void> => new Promise(() => undefined);
    const context = {
      route: () => Promise.resolve(),
      newPage: () => Promise.resolve({ setContent: never }),
      close: never,
    };
    const browser = {
      isConnected: () => true,
      newContext: () => Promise.resolve(context),
      close: never,
    };
    const spy = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as never);
    try {
      const renderer = await chromiumRenderer("http://127.0.0.1:1", {
        timeoutMs: 50,
        closeTimeoutMs: 50,
      });
      const started = Date.now();
      await expect(renderer.render("<p>x</p>", { w: 10, h: 10 } as never)).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(2_000);
      await renderer.close();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("cdpBase", () => {
  it("accepts only http://127.0.0.1:<port>", () => {
    expect(cdpBase("http://127.0.0.1:9222")).toBe("http://127.0.0.1:9222");
    for (const bad of [
      "http://192.0.2.1:9222",
      "http://localhost:9222",
      "https://127.0.0.1:9222",
      "http://127.0.0.1",
      "http://127.0.0.1:0",
      "http://127.0.0.1:70000",
      "http://127.0.0.1:9222/",
      "http://127.0.0.1:9222@evil.example",
      "ws://127.0.0.1:9222",
      "",
    ]) {
      expect(() => cdpBase(bad)).toThrow();
    }
  });
});
