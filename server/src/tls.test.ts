/* eslint-disable security/detect-non-literal-fs-filename -- temp folders of the test */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { main as emulatorMain } from "../../emulator/src/cli.ts";
import { defaultConfig, runWake } from "../../emulator/src/index.ts";
import { pkiDevice, pkiInit, pkiServer } from "../scripts/pki.ts";
import { parseOptions, UsageError } from "./args.ts";
import { createApp, startServer, type ServerConfig, type TlsConfig } from "./index.ts";

interface Creds {
  cert: Buffer;
  key: Buffer;
}

let base: string;
let tlsConfig: TlsConfig;
let ca: Buffer;
let p1: Creds;
let p2: Creds;
let x1: Creds;
let p1Line: string;
let out: string[];

const read = (path: string): Buffer => readFileSync(path);
const creds = (dir: string, id: string): Creds => ({
  cert: read(join(dir, "devices", `${id}.crt`)),
  key: read(join(dir, "devices", `${id}.key`)),
});

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), "tintero-tlstest-"));
  const good = join(base, "good");
  const other = join(base, "other");
  await pkiInit(good);
  await pkiServer(good, "localhost");
  p1Line = await pkiDevice(good, "p1");
  await pkiDevice(good, "p2");
  await pkiInit(other);
  await pkiDevice(other, "x1");
  ca = read(join(good, "ca.crt"));
  p1 = creds(good, "p1");
  p2 = creds(good, "p2");
  x1 = creds(other, "x1");
  mkdirSync(join(base, "cfg"));
  tlsConfig = {
    certFile: join(good, "server.crt"),
    keyFile: join(good, "server.key"),
    clientCaFile: join(good, "ca.crt"),
    devicesFile: join(base, "cfg", "devices.txt"),
  };
});
afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});
beforeEach(() => {
  out = [];
  writeFileSync(tlsConfig.devicesFile, `${p1Line}\n`);
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const config = (extra: Partial<ServerConfig> = {}): ServerConfig => ({
  nextWakeS: 1800,
  headersTimeoutMs: 10_000,
  tls: tlsConfig,
  ...extra,
});
const portOf = (url: string): number => Number(new URL(url).port);
const logs = (): Record<string, unknown>[] =>
  out
    .join("")
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const HEADERS = {
  "Tintero-Protocol": "1",
  "Tintero-Firmware": "t",
  "Tintero-Power": "usb",
  "Tintero-Formats": "raw1",
  "Tintero-Panel": "w=800,h=480,dpi=124,depth=1",
};

function call(
  port: number,
  path: string,
  who: Creds | undefined,
  options: { method?: string; panel?: string; body?: string } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: "localhost",
        port,
        path,
        method: options.method ?? "GET",
        agent: false,
        ca,
        ...who,
        headers: {
          ...HEADERS,
          ...(options.panel === undefined ? {} : { "Tintero-Panel": options.panel }),
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

/** Opens a TLS connection, sends a request and reports how many bytes came back. */
function raw(port: number, who: Creds | undefined): Promise<{ bytes: number }> {
  return new Promise((resolve) => {
    let bytes = 0;
    const socket = tls.connect({ host: "127.0.0.1", port, servername: "localhost", ca, ...who });
    socket.on("secureConnect", () => {
      socket.write("GET /api/v1/index HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
    });
    socket.on("data", (chunk: Buffer) => (bytes += chunk.length));
    socket.on("error", () => undefined);
    socket.on("close", () => {
      resolve({ bytes });
    });
  });
}

describe("L1 handshake (CA1, CA2)", () => {
  it("serves https on 127.0.0.1 and shuts out clients without a good certificate", async () => {
    const server = await startServer(config(), 0);
    try {
      expect(server.url).toMatch(/^https:\/\/127\.0\.0\.1:\d+$/);
      const port = portOf(server.url);
      expect((await raw(port, undefined)).bytes).toBe(0);
      expect((await raw(port, x1)).bytes).toBe(0);
      expect((await raw(port, p1)).bytes).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });
});

describe("device list (CA3, CA5, CA6)", () => {
  it("answers 404 without body to a device that is not listed", async () => {
    const server = await startServer(config(), 0);
    try {
      const port = portOf(server.url);
      for (const [method, path] of [
        ["GET", "/api/v1/index"],
        ["POST", "/api/v1/actions"],
        ["GET", "/"],
      ] as const) {
        const reply = await call(port, path, p2, method === "POST" ? { method, body: "{}" } : {});
        expect(reply).toEqual({ status: 404, body: "" });
      }
      expect(logs().some((line) => line.device === null && line.status === 404)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("follows the list without restarting, and fails closed when it is invalid", async () => {
    const server = await startServer(config(), 0);
    try {
      const port = portOf(server.url);
      expect((await call(port, "/api/v1/index", p1)).status).toBe(200);
      writeFileSync(tlsConfig.devicesFile, "# nobody\n");
      expect((await call(port, "/api/v1/index", p1)).status).toBe(404);
      writeFileSync(tlsConfig.devicesFile, `${p1Line}\n`);
      expect((await call(port, "/api/v1/index", p1)).status).toBe(200);

      writeFileSync(tlsConfig.devicesFile, `${p1Line.slice(1)}\n`);
      expect((await call(port, "/api/v1/index", p1)).status).toBe(404);
      expect(logs().filter((line) => "devices_error" in line)).toHaveLength(1);
      expect(out.join("")).not.toContain(p1Line.slice(1));
      writeFileSync(tlsConfig.devicesFile, `${p1Line}\n`);
      expect((await call(port, "/api/v1/index", p1)).status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it("is fast: handshake plus index in under 100 ms (after warm-up)", async () => {
    const server = await startServer(config(), 0);
    try {
      const port = portOf(server.url);
      await call(port, "/api/v1/index", p1);
      const started = performance.now();
      await call(port, "/api/v1/index", p1);
      expect(performance.now() - started).toBeLessThan(100);
    } finally {
      await server.close();
    }
  });
});

describe("emulator with a certificate (CA4)", () => {
  it("runs a wake as p1 and the CLI exits 0", async () => {
    const server = await startServer(config(), 0);
    const store = mkdtempSync(join(tmpdir(), "tintero-tlsstore-"));
    try {
      const url = `https://localhost:${portOf(server.url)}`;
      const files = {
        caFile: join(base, "good", "ca.crt"),
        certFile: join(base, "good", "devices", "p1.crt"),
        keyFile: join(base, "good", "devices", "p1.key"),
      };
      const wake = await runWake({ ...defaultConfig(url, store), tls: files });
      expect(wake.errors).toEqual([]);
      expect(wake.downloaded.sort()).toEqual(["demo", "detalle", "patron"]);
      expect(logs().some((line) => line.device === "p1")).toBe(true);

      const code = await emulatorMain(
        [
          "--server", url, "--store", store, "--wakes", "1",
          "--ca", files.caFile, "--cert", files.certFile, "--key", files.keyFile,
        ], // prettier-ignore
        () => undefined,
        () => undefined,
      );
      expect(code).toBe(0);
    } finally {
      rmSync(store, { recursive: true, force: true });
      await server.close();
    }
  });
});

describe("panels per device and cache (CA8)", () => {
  async function listening(extra: Partial<ServerConfig>) {
    const made = createApp(config(extra));
    await made.app.listen({ host: "127.0.0.1", port: 0 });
    const port = (made.app.server.address() as net.AddressInfo).port;
    return { app: made.app, renders: () => made.renders(), port };
  }

  it("allows two panels and refuses a third without drawing", async () => {
    const { app, renders, port } = await listening({ maxPanelsPerDevice: 2 });
    try {
      const panel = (w: number): string => `w=${w},h=480,dpi=124,depth=1`;
      expect((await call(port, "/api/v1/index", p1, { panel: panel(800) })).status).toBe(200);
      expect((await call(port, "/api/v1/index", p1, { panel: panel(400) })).status).toBe(200);
      const before = renders();
      const third = await call(port, "/api/v1/index", p1, { panel: panel(200) });
      expect(third.status).toBe(400);
      expect(third.body).toContain("invalid_request");
      expect(renders()).toBe(before);
      expect((await call(port, "/api/v1/index", p1, { panel: panel(800) })).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("evicts only the least recently used entry when the cache is full", async () => {
    const { app, renders, port } = await listening({ maxPanelsPerDevice: 64 });
    try {
      const index = (i: number) =>
        call(port, "/api/v1/index", p1, { panel: `w=${100 + i * 8},h=80,dpi=124,depth=1` });
      for (let i = 0; i < 16; i++) await index(i); // 16 panels x 3 views = 48 entries
      const full = renders();
      expect(full).toBe(48);
      await index(0); // touches panel 0: now the most recently used
      expect(renders()).toBe(full);
      await index(16); // evicts panel 1's three entries, not panel 0's
      const after = renders();
      expect(after).toBe(full + 3);
      await index(0);
      expect(renders()).toBe(after);
      await index(1);
      expect(renders()).toBe(after + 3);
    } finally {
      await app.close();
    }
  });
});

describe("timeouts and connection limit (CA9)", () => {
  it("cuts a body sent one byte per second", async () => {
    const server = await startServer(
      { nextWakeS: 1800, headersTimeoutMs: 10_000, requestTimeoutMs: 1000 },
      0,
    );
    try {
      const started = Date.now();
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect(portOf(server.url), "127.0.0.1", () => {
          socket.write(
            "POST /api/v1/actions HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n" +
              "Content-Type: application/json\r\n\r\n",
          );
          const timer = setInterval(() => socket.write("x"), 1000);
          socket.on("close", () => {
            clearInterval(timer);
            resolve();
          });
        });
        socket.on("error", () => undefined);
        socket.on("data", () => undefined);
        setTimeout(() => {
          reject(new Error("not cut"));
          socket.destroy();
        }, 5000).unref();
      });
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      await server.close();
    }
  });

  it("closes a third simultaneous connection without an HTTP answer", async () => {
    const server = await startServer(
      { nextWakeS: 1800, headersTimeoutMs: 10_000, maxConnections: 2 },
      0,
    );
    const port = portOf(server.url);
    const open = (): Promise<net.Socket> =>
      new Promise((resolve) => {
        const socket = net.connect(port, "127.0.0.1", () => {
          resolve(socket);
        });
        socket.on("error", () => undefined);
      });
    const sockets: net.Socket[] = [];
    try {
      sockets.push(await open(), await open());
      const third = net.connect(port, "127.0.0.1");
      third.on("error", () => undefined);
      let bytes = 0;
      third.on("data", (chunk: Buffer) => (bytes += chunk.length));
      third.write("GET / HTTP/1.1\r\nHost: x\r\n\r\n");
      await new Promise<void>((resolve) => {
        third.on("close", () => {
          resolve();
        });
      });
      expect(bytes).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await server.close();
    }
  });

  it("closes a client that opens TCP and never greets", async () => {
    const server = await startServer(config({ handshakeTimeoutMs: 1000 }), 0);
    try {
      const started = Date.now();
      await new Promise<void>((resolve) => {
        const socket = net.connect(portOf(server.url), "127.0.0.1");
        socket.on("error", () => undefined);
        socket.on("close", () => {
          resolve();
        });
      });
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      await server.close();
    }
  });
});

describe("options (CA12)", () => {
  const all = [
    "--tls-cert", "c", "--tls-key", "k", "--client-ca", "a", "--devices", "d",
  ]; // prettier-ignore

  it("takes the four TLS options together", () => {
    expect(parseOptions(all).config.tls).toEqual({
      certFile: "c",
      keyFile: "k",
      clientCaFile: "a",
      devicesFile: "d",
    });
    expect(() => parseOptions(["--tls-cert", "c"])).toThrow(UsageError);
    expect(() => parseOptions(all.slice(0, 6))).toThrow(UsageError);
  });

  it("reads --max-panels and --max-connections", () => {
    const { config: parsed } = parseOptions(["--max-panels", "3", "--max-connections", "5"]);
    expect(parsed.maxPanelsPerDevice).toBe(3);
    expect(parsed.maxConnections).toBe(5);
    expect(() => parseOptions(["--max-connections", "0"])).toThrow(UsageError);
  });

  it("fails to start when a TLS file does not exist", async () => {
    await expect(
      startServer(config({ tls: { ...tlsConfig, keyFile: join(base, "missing.key") } }), 0),
    ).rejects.toThrow();
  });
});

describe("emulator options (CA12)", () => {
  it("exits 2 with --cert and an http URL, or with an incomplete set", async () => {
    const err = vi.fn();
    expect(
      await emulatorMain(
        ["--server", "http://127.0.0.1:1", "--ca", "a", "--cert", "b", "--key", "c"],
        () => undefined,
        err,
      ),
    ).toBe(2);
    expect(
      await emulatorMain(["--server", "https://localhost:1", "--cert", "b"], () => undefined, err),
    ).toBe(2);
  });
});
