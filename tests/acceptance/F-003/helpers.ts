import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatPanelHeader,
  validateIndex,
  validateZones,
  type IndexResponse,
  type Panel,
  type ZonesResponse,
} from "../../../contract/src/index.ts";
import type { createApp } from "../../../server/src/index.ts";

export const ROOT = new URL("../../../", import.meta.url).pathname;
export const API = "/api/v1";
export const PANEL: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
export const CFG = { nextWakeS: 1800, headersTimeoutMs: 10_000 };

export type App = ReturnType<typeof createApp>["app"];

/** Valid device headers; an `undefined` value in `over` removes the header. */
export function devHeaders(
  panel: Panel = PANEL,
  over: Record<string, string | undefined> = {},
): Record<string, string> {
  const base: Record<string, string> = {
    "Tintero-Protocol": "1",
    "Tintero-Firmware": "test-0.1.0",
    "Tintero-Power": "battery",
    "Tintero-Formats": "raw1",
    "Tintero-Panel": formatPanelHeader(panel),
  };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) Reflect.deleteProperty(base, k);
    else Object.assign(base, { [k]: v });
  }
  return base;
}

/** Bit `x` of row `y` of a raw1 image (MSB first, 1 = black; ADR-0020). */
export function isBlack(img: Uint8Array, w: number, x: number, y: number): boolean {
  const stride = Math.ceil(w / 8);
  return (((img[y * stride + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1) === 1;
}

export function rectAll(
  img: Uint8Array,
  w: number,
  r: { x: number; y: number; w: number; h: number },
  black: boolean,
): boolean {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (isBlack(img, w, x, y) !== black) return false;
  return true;
}

export async function getIndex(app: App, panel: Panel = PANEL): Promise<IndexResponse> {
  const r = await app.inject({ method: "GET", url: `${API}/index`, headers: devHeaders(panel) });
  const v = validateIndex(r.body);
  if (!v.ok) throw new Error(`invalid index: ${r.statusCode} ${r.body}`);
  return v.value;
}

export async function getImage(
  app: App,
  id: string,
  hash: string,
  panel: Panel = PANEL,
): Promise<Buffer> {
  const r = await app.inject({
    method: "GET",
    url: `${API}/views/${id}/image?h=${hash}`,
    headers: devHeaders(panel),
  });
  if (r.statusCode !== 200) throw new Error(`image ${id}: ${r.statusCode}`);
  return r.rawPayload;
}

export async function getZones(
  app: App,
  id: string,
  hash: string,
  panel: Panel = PANEL,
): Promise<ZonesResponse> {
  const r = await app.inject({
    method: "GET",
    url: `${API}/views/${id}/zones?h=${hash}`,
    headers: devHeaders(panel),
  });
  const v = validateZones(r.body, panel);
  if (!v.ok) throw new Error(`invalid zones ${id}: ${r.statusCode} ${r.body}`);
  return v.value;
}

export function hashOf(index: IndexResponse, id: string): string {
  const v = index.views.find((view) => view.id === id);
  if (!v) throw new Error(`view ${id} missing in index`);
  return v.hash;
}

/** Only `fetch` of the folder: loopback only (docs/seguridad.md). */
export async function getLocal(
  base: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; headers: Headers; buf: Buffer; text: string }> {
  if (!base.startsWith("http://127.0.0.1:")) throw new Error("solo 127.0.0.1");
  // nosemgrep: react-insecure-request -- loopback de prueba (docs/seguridad.md)
  const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(5000) });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buf, text: buf.toString("utf8") };
}

export interface RawResult {
  status: number | null;
  body: string;
  closedByServer: boolean;
  ms: number;
}

/**
 * Raw TCP exchange with a loopback server (partial headers, chunked bodies...).
 * Resolves when the response is complete, the server closes the socket, or after `maxMs`.
 * Loopback only (docs/seguridad.md).
 */
export function rawLocal(base: string, payload: string | Buffer, maxMs = 3000): Promise<RawResult> {
  if (!base.startsWith("http://127.0.0.1:")) throw new Error("solo 127.0.0.1");
  const port = Number(new URL(base).port);
  return new Promise((resolve) => {
    const t0 = Date.now();
    let data = Buffer.alloc(0);
    let done = false;
    const sock = connect({ host: "127.0.0.1", port });
    const finish = (closed: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      const text = data.toString("latin1");
      const m = /^HTTP\/1\.[01] (\d{3})/.exec(text);
      const at = text.indexOf("\r\n\r\n");
      resolve({
        status: m?.[1] ? Number(m[1]) : null,
        body: at >= 0 ? text.slice(at + 4) : "",
        closedByServer: closed,
        ms: Date.now() - t0,
      });
    };
    const timer = setTimeout(() => {
      finish(false);
    }, maxMs);
    const complete = (): boolean => {
      const text = data.toString("latin1");
      const at = text.indexOf("\r\n\r\n");
      if (at < 0) return false;
      const head = text.slice(0, at).toLowerCase();
      const body = text.slice(at + 4);
      if (/transfer-encoding:\s*chunked/.test(head)) return body.endsWith("0\r\n\r\n");
      const len = /content-length:\s*(\d+)/.exec(head);
      return Buffer.byteLength(body, "latin1") >= Number(len?.[1] ?? 0);
    };
    sock.on("connect", () => {
      sock.write(payload);
    });
    sock.on("data", (d: Buffer) => {
      data = Buffer.concat([data, d]);
      if (complete()) finish(false);
    });
    sock.on("close", () => {
      finish(true);
    });
    sock.on("error", () => {
      finish(true);
    });
  });
}

export interface Cli {
  url: string;
  lines: string[];
  waitFor(pred: (line: string) => boolean, ms?: number): Promise<string>;
  stop(): Promise<void>;
}

/** Starts `npm run server -- --port 0 ...` (new process group). */
export async function startCli(extra: string[] = []): Promise<Cli> {
  const p: ChildProcess = spawn(
    "npm",
    ["run", "--silent", "server", "--", "--port", "0", ...extra],
    { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const lines: string[] = [];
  let pending = "";
  p.stdout?.on("data", (d: Buffer) => {
    pending += d.toString("utf8");
    let nl = pending.indexOf("\n");
    while (nl >= 0) {
      const line = pending.slice(0, nl);
      if (line.trim() !== "") lines.push(line);
      pending = pending.slice(nl + 1);
      nl = pending.indexOf("\n");
    }
  });
  const exited = new Promise<void>((r) => {
    p.once("exit", () => {
      r();
    });
  });
  const waitFor = async (pred: (l: string) => boolean, ms = 8000): Promise<string> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = lines.find(pred);
      if (hit !== undefined) return hit;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timeout waiting for a log line; got: ${lines.join(" | ").slice(0, 500)}`);
  };
  const stop = async (): Promise<void> => {
    if (!p.pid) return;
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {
      return;
    }
    await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
    try {
      process.kill(-p.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  };
  let first: string;
  try {
    first = await waitFor(() => true, 20_000);
  } catch (e) {
    await stop();
    throw e;
  }
  const m = /^\{"listening":"(http:\/\/127\.0\.0\.1:\d+)"\}$/.exec(first);
  if (!m?.[1]) {
    await stop();
    throw new Error(`unexpected first line: ${first}`);
  }
  return { url: m[1], lines, waitFor, stop };
}

export function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function rmDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
