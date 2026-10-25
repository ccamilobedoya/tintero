import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  CHROMIUM_LABEL,
  INSTANCE_NAME,
  cdpBase,
  chromiumDockerArgs,
  parseContainerIds,
  priorityQueue,
  removeOrphanChromium,
  stopContainer,
} from "./chromium.ts";

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
