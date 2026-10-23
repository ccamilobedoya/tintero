import { spawn, type ChildProcess } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { vi } from "vitest";
import { formatPanelHeader, type Panel } from "../../../contract/src/index.ts";
import { pkiDevice, pkiInit, pkiServer } from "../../../server/scripts/pki.ts";
import { fingerprint, startServer, type ServerConfig } from "../../../server/src/index.ts";

export const ROOT = new URL("../../../", import.meta.url).pathname;
export const API = "/api/v1";
export const PANEL: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };

export function devHeaders(panel: Panel = PANEL): Record<string, string> {
  return {
    "Tintero-Protocol": "1",
    "Tintero-Firmware": "test-0.1.0",
    "Tintero-Power": "battery",
    "Tintero-Formats": "raw1",
    "Tintero-Panel": formatPanelHeader(panel),
  };
}

export function tmpDir(prefix = "tintero-f004-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
export function rmDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export interface Creds {
  cert: string;
  key: string;
}
export interface DeviceFiles extends Creds {
  certFile: string;
  keyFile: string;
}

export interface Pki {
  root: string;
  goodDir: string;
  otherDir: string;
  caFile: string;
  serverCert: string;
  serverKey: string;
  p1: DeviceFiles;
  p2: DeviceFiles;
  x1: DeviceFiles;
  p1Line: string;
  devicesFile: string;
}

/** Two CAs (good: server `localhost`, devices p1 listed and p2 not; other: device x1) outside the repo. */
export async function makePki(): Promise<Pki> {
  const root = tmpDir();
  const goodDir = join(root, "good");
  const otherDir = join(root, "other");
  await pkiInit(goodDir);
  await pkiServer(goodDir, "localhost");
  const p1Line = await pkiDevice(goodDir, "p1");
  await pkiDevice(goodDir, "p2");
  await pkiInit(otherDir);
  await pkiDevice(otherDir, "x1");
  const dev = (dir: string, id: string): DeviceFiles => {
    const certFile = join(dir, "devices", `${id}.crt`);
    const keyFile = join(dir, "devices", `${id}.key`);
    return {
      cert: readFileSync(certFile, "utf8"),
      key: readFileSync(keyFile, "utf8"),
      certFile,
      keyFile,
    };
  };
  const devicesFile = join(root, "devices.txt");
  writeFileSync(devicesFile, `${p1Line}\n`);
  return {
    root,
    goodDir,
    otherDir,
    caFile: join(goodDir, "ca.crt"),
    serverCert: join(goodDir, "server.crt"),
    serverKey: join(goodDir, "server.key"),
    p1: dev(goodDir, "p1"),
    p2: dev(goodDir, "p2"),
    x1: dev(otherDir, "x1"),
    p1Line,
    devicesFile,
  };
}

export function tlsConfig(
  pki: Pki,
  over: Partial<ServerConfig> = {},
  devicesFile: string = pki.devicesFile,
): ServerConfig {
  return {
    nextWakeS: 1800,
    headersTimeoutMs: 10_000,
    tls: {
      certFile: pki.serverCert,
      keyFile: pki.serverKey,
      clientCaFile: pki.caFile,
      devicesFile,
    },
    ...over,
  };
}

export async function startTls(
  pki: Pki,
  over: Partial<ServerConfig> = {},
): Promise<{ url: string; port: number; close(): Promise<void> }> {
  const srv = await startServer(tlsConfig(pki, over), 0);
  return { ...srv, port: Number(new URL(srv.url).port) };
}

export const fpOf = (pem: string): string => fingerprint(new X509Certificate(pem).raw);

export interface Reply {
  status: number;
  body: string;
}

/** HTTPS request to 127.0.0.1 validating the server with `ca` (name `localhost`). */
export function httpsCall(
  port: number,
  ca: string,
  creds: Creds | undefined,
  method: "GET" | "POST",
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        servername: "localhost",
        method,
        path,
        ca,
        cert: creds?.cert,
        key: creds?.key,
        agent: false,
        headers: {
          Host: "localhost",
          Connection: "close",
          ...headers,
          ...(body !== undefined ? { "Content-Length": String(Buffer.byteLength(body)) } : {}),
        },
        timeout: 8000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (d: Buffer) => chunks.push(d));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export interface Attempt {
  received: string;
  errored: boolean;
  timedOut: boolean;
}

/** TLS client: tries to talk HTTP; reports every byte received after the handshake. */
export function tlsAttempt(
  port: number,
  ca: string,
  creds?: Creds,
  maxMs = 4000,
): Promise<Attempt> {
  return new Promise((resolve) => {
    let received = "";
    let errored = false;
    let done = false;
    const finish = (timedOut: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      resolve({ received, errored, timedOut });
    };
    const sock = tlsConnect({
      host: "127.0.0.1",
      port,
      servername: "localhost",
      ca,
      cert: creds?.cert,
      key: creds?.key,
    });
    const timer = setTimeout(() => {
      finish(true);
    }, maxMs);
    sock.on("secureConnect", () => {
      sock.write(`GET ${API}/index HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    });
    sock.on("data", (d: Buffer) => {
      received += d.toString("latin1");
    });
    sock.on("error", () => {
      errored = true;
      finish(false);
    });
    sock.on("close", () => {
      finish(false);
    });
  });
}

/** Raw TCP connection to loopback; resolves when the server closes it (or after `maxMs`). */
export function rawTcp(
  port: number,
  onConnect: (write: (s: string) => void) => void,
  maxMs: number,
): Promise<{ data: string; closed: boolean; ms: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let data = "";
    let done = false;
    const finish = (closed: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      resolve({ data, closed, ms: Date.now() - t0 });
    };
    const sock = netConnect({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      finish(false);
    }, maxMs);
    sock.on("connect", () => {
      onConnect((s) => {
        if (!sock.destroyed) sock.write(s);
      });
    });
    sock.on("data", (d: Buffer) => {
      data += d.toString("latin1");
    });
    sock.on("error", () => {
      finish(true);
    });
    sock.on("close", () => {
      finish(true);
    });
  });
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

export type LogLine = Record<string, unknown>;

/** Captures the JSON log lines written to stdout (S6). */
export function captureLog(): {
  lines: LogLine[];
  waitFor(pred: (l: LogLine) => boolean, ms?: number): Promise<LogLine>;
  restore(): void;
} {
  const lines: LogLine[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    for (const part of String(chunk).split("\n")) {
      if (part.trim() === "") continue;
      try {
        lines.push(JSON.parse(part) as LogLine);
      } catch {
        /* not a log line */
      }
    }
    return true;
  });
  return {
    lines,
    async waitFor(pred, ms = 3000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const hit = lines.find(pred);
        if (hit) return hit;
        await sleep(25);
      }
      throw new Error(`log line not found; got ${JSON.stringify(lines).slice(0, 600)}`);
    },
    restore() {
      spy.mockRestore();
    },
  };
}

export interface Exit {
  code: number | null;
  out: string;
  err: string;
}

/** Runs `npm run --silent <script> -- <args>` until it exits (killed after `ms`). */
export function runNpm(script: string, args: string[], ms = 30_000): Promise<Exit> {
  return new Promise((resolve) => {
    const p = spawn("npm", ["run", "--silent", script, "--", ...args], {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    const t = setTimeout(() => {
      if (p.pid) {
        try {
          process.kill(-p.pid, "SIGKILL");
        } catch {
          /* gone */
        }
      }
    }, ms);
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, out, err });
    });
  });
}

/** `npm run server -- --port 0 ...`: waits for the first stdout line. */
export async function startServerCli(
  args: string[],
): Promise<{ first: string; stop(): Promise<void> }> {
  const p: ChildProcess = spawn(
    "npm",
    ["run", "--silent", "server", "--", "--port", "0", ...args],
    { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let buf = "";
  p.stdout?.on("data", (d: Buffer) => (buf += d.toString()));
  const exited = new Promise<void>((r) => {
    p.once("exit", () => {
      r();
    });
  });
  const stop = async (): Promise<void> => {
    if (!p.pid) return;
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {
      return;
    }
    await Promise.race([exited, sleep(10_000)]);
    try {
      process.kill(-p.pid, "SIGKILL");
    } catch {
      /* gone */
    }
  };
  const end = Date.now() + 20_000;
  while (Date.now() < end && !buf.includes("\n")) await sleep(25);
  if (!buf.includes("\n")) {
    await stop();
    throw new Error("server printed nothing");
  }
  return { first: buf.slice(0, buf.indexOf("\n")), stop };
}
