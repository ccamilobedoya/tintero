/* eslint-disable security/detect-non-literal-fs-filename -- temp folders of the test */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig, press, runWake } from "../../emulator/src/index.ts";
import { parseOptions, UsageError } from "./args.ts";
import { demoViews, startServer } from "./index.ts";

const PANEL = { w: 800, h: 480, dpi: 124, depth: 1 } as const;
let store: string;
beforeEach(async () => {
  store = await mkdtemp(join(tmpdir(), "tintero-srv-"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(store, { recursive: true, force: true });
});

const black = (raw: Uint8Array, x: number, y: number): boolean =>
  ((raw[y * 100 + (x >> 3)] ?? 0) & (0x80 >> (x & 7))) !== 0;

describe("cycle with the emulator", () => {
  it("downloads, caches, toggles and opens (CA3-CA6)", async () => {
    const server = await startServer({ nextWakeS: 1800, headersTimeoutMs: 10_000 }, 0);
    try {
      const config = { ...defaultConfig(server.url, store), power: "usb" as const };
      const first = await runWake(config);
      expect(first.errors).toEqual([]);
      expect(first.downloaded.sort()).toEqual(["demo", "detalle", "patron"]);
      const demo = demoViews()[0]?.raw1(PANEL) ?? new Uint8Array();
      expect(new Uint8Array(await readFile(join(store, "screen.raw1")))).toEqual(demo);

      const second = await runWake(config);
      expect(second.requests.map((r) => r.path)).toEqual(["/api/v1/index"]);

      // Tab focuses the first zone (c1), a second tab c2.
      await press(config, "tab");
      await press(config, "tab");
      const toggled = await press(config, "ok");
      expect(toggled.errors).toEqual([]);
      const screen = new Uint8Array(await readFile(join(store, "screen.raw1")));
      expect(black(screen, 80, 120)).toBe(true);
    } finally {
      await server.close();
    }
  });
});

describe("headers timeout (CA13)", () => {
  it("closes a connection that sends incomplete headers", async () => {
    const server = await startServer({ nextWakeS: 1800, headersTimeoutMs: 500 }, 0);
    try {
      const port = Number(new URL(server.url).port);
      const started = Date.now();
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1", () => {
          socket.write("GET /api/v1/index HTTP/1.1\r\nHost: x\r\n");
        });
        socket.on("close", () => {
          resolve();
        });
        socket.on("error", reject);
        socket.on("data", () => undefined);
      });
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      await server.close();
    }
  });
});

describe("chunked bodies (CA10)", () => {
  it("answers 413 for 5000 bytes sent in chunks without Content-Length", async () => {
    const server = await startServer({ nextWakeS: 1800, headersTimeoutMs: 10_000 }, 0);
    try {
      const port = Number(new URL(server.url).port);
      const reply = await new Promise<string>((resolve, reject) => {
        let text = "";
        const socket = net.connect(port, "127.0.0.1", () => {
          socket.write(
            "POST /api/v1/actions HTTP/1.1\r\nHost: x\r\nTintero-Protocol: 1\r\nTintero-Firmware: t\r\n" +
              "Tintero-Power: usb\r\nTintero-Formats: raw1\r\nTintero-Panel: w=800,h=480,dpi=124,depth=1\r\n" +
              "Content-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
          );
          for (let i = 0; i < 2; i++) socket.write(`9c4\r\n${"x".repeat(2500)}\r\n`);
          socket.write("0\r\n\r\n");
        });
        socket.on("data", (chunk) => {
          text += chunk.toString();
        });
        socket.on("close", () => {
          resolve(text);
        });
        socket.on("error", reject);
      });
      expect(reply.startsWith("HTTP/1.1 413")).toBe(true);
      expect(reply).toContain('"too_large"');
    } finally {
      await server.close();
    }
  });
});

describe("options", () => {
  it("has defaults and rejects bad values", () => {
    expect(parseOptions([])).toEqual({
      port: 8790,
      host: "127.0.0.1",
      config: { nextWakeS: 1800, nextWakeUsbS: 600, headersTimeoutMs: 10_000 },
    });
    expect(parseOptions(["--next-wake-usb-s", "900"]).config.nextWakeUsbS).toBe(900);
    for (const bad of ["29", "86401", "10m"]) {
      expect(() => parseOptions(["--next-wake-usb-s", bad])).toThrow(/--next-wake-usb-s/);
    }
    expect(parseOptions(["--port", "0", "--next-wake-s", "60"]).config.nextWakeS).toBe(60);
    expect(() => parseOptions(["--port", "99999"])).toThrow(UsageError);
    expect(() => parseOptions(["--bogus"])).toThrow(UsageError);
    expect(() => parseOptions(["--next-wake-s", "5"])).toThrow(UsageError);
  });
});
