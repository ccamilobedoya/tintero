/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, security/detect-non-literal-fs-filename, security/detect-object-injection -- JSON de prueba y carpetas temporales propias */
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatPanelHeader, type Panel } from "../../../contract/src/index.ts";
import {
  chromiumRenderer,
  createEngine,
  parseDataFile,
  parseViewsConfig,
  startChromium,
  type DataFile,
  type Engine,
  type EngineOptions,
  type RenderedView,
  type RenderOutput,
  type Renderer,
  type ViewsConfig,
} from "../../../server/src/engine/index.ts";

export const ROOT = new URL("../../../", import.meta.url).pathname;
export const P124: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
export const P200: Panel = { w: 800, h: 480, dpi: 200, depth: 1 };
export const V124: Panel = { w: 480, h: 800, dpi: 124, depth: 1 };
export const NOON = "2026-10-23T12:00:00Z";
export const API = "/api/v1";
export const VIEWS_PATH = join(ROOT, "config/views.example.json");
export const DATA_PATH = join(ROOT, "config/data.example.json");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON editing helper for building variants
export type Loose = any;

export const viewsText = (): string => readFileSync(VIEWS_PATH, "utf8");
export const dataText = (): string => readFileSync(DATA_PATH, "utf8");

/** The example JSON, edited by `fn`, as text. */
export function edited(text: string, fn: (o: Loose) => void): string {
  const o: Loose = JSON.parse(text);
  fn(o);
  return JSON.stringify(o);
}

export function cfgFrom(fn?: (o: Loose) => void): ViewsConfig {
  return parseViewsConfig(fn ? edited(viewsText(), fn) : viewsText());
}

export function dataFrom(config: ViewsConfig, fn?: (o: Loose) => void): DataFile {
  return parseDataFile(fn ? edited(dataText(), fn) : dataText(), config);
}

/** Only these views for every device (`"*"`). */
export const only =
  (ids: string[]) =>
  (o: Loose): void => {
    o.devices["*"].views = ids;
  };

export interface Clock {
  clock: () => Date;
  set(iso: string): void;
}
export function makeClock(iso: string = NOON): Clock {
  let now = new Date(iso);
  return {
    clock: () => new Date(now),
    set: (next: string) => {
      now = new Date(next);
    },
  };
}

export function mkEngine(
  renderer: Renderer,
  parts: { config?: ViewsConfig; data?: DataFile } & Partial<EngineOptions> = {},
): Engine {
  const { config = cfgFrom(), data: givenData, ...rest } = parts;
  const data = givenData ?? dataFrom(config);
  return createEngine({
    nextWakeS: 1800,
    clock: () => new Date(NOON),
    ...rest,
    config,
    data,
    renderer,
  });
}

export async function getViews(
  engine: Engine,
  device: string,
  panel: Panel,
): Promise<{ current: string; views: RenderedView[] }> {
  const r = await engine.index(device, panel);
  if (!r.ok) throw new Error(`index failed: ${r.code}`);
  return r.value;
}

export function viewOf(views: RenderedView[], id: string): RenderedView {
  const v = views.find((x) => x.id === id);
  if (!v) throw new Error(`view ${id} missing`);
  return v;
}

/** Pixel of a raw1 image (F-001): byte y × ceil(w/8) + (x >> 3), bit 0x80 >> (x & 7), 1 = black. */
export function isBlack(raw1: Uint8Array, w: number, x: number, y: number): boolean {
  const byte = raw1[y * Math.ceil(w / 8) + (x >> 3)] ?? 0;
  return (byte & (0x80 >> (x & 7))) !== 0;
}

export const anyBlack = (raw1: Uint8Array): boolean => raw1.some((b) => b !== 0);

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Renderer that records every call and delegates to another one. */
export interface Spy extends Renderer {
  calls: { html: string; panel: Panel; out: RenderOutput }[];
}
export function spyRenderer(inner: Renderer): Spy {
  const calls: Spy["calls"] = [];
  return {
    calls,
    render: async (html, panel) => {
      const out = await inner.render(html, panel);
      calls.push({ html, panel, out });
      return out;
    },
    blockedRequests: () => inner.blockedRequests(),
    close: () => inner.close(),
  };
}

/** A renderer that draws nothing (for tests that do not need pixels). */
export function fakeRenderer(delayMs = 0): Renderer & { count: number } {
  const self = {
    count: 0,
    render: async (_html: string, panel: Panel): Promise<RenderOutput> => {
      self.count++;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return {
        raw1: new Uint8Array(Math.ceil(panel.w / 8) * panel.h),
        gray: 0,
        boxes: [],
        overflow: [],
      };
    },
    blockedRequests: () => 0,
    close: () => Promise.resolve(),
  };
  return self;
}

// --- Chromium for tests -------------------------------------------------

const REGISTRY = join(tmpdir(), "tintero-f005-test-containers");

export interface TestChromium {
  endpoint: string;
  name: string;
  renderer: Spy;
  stop(): Promise<void>;
}

/** Starts a Chromium container and a renderer; `stop()` always releases both. */
export async function launchChromium(): Promise<TestChromium> {
  const c = await startChromium();
  mkdirSync(REGISTRY, { recursive: true });
  const mark = join(REGISTRY, c.name);
  writeFileSync(mark, "");
  let renderer: Spy;
  try {
    renderer = spyRenderer(await chromiumRenderer(c.endpoint));
  } catch (e) {
    rmSync(mark, { force: true });
    await c.stop();
    throw e;
  }
  return {
    endpoint: c.endpoint,
    name: c.name,
    renderer,
    stop: async () => {
      try {
        await renderer.close();
      } catch {
        /* already closed */
      }
      try {
        await c.stop();
      } finally {
        rmSync(mark, { force: true });
      }
    },
  };
}

/** Containers started by the test files (not by the server under test). */
export function registeredContainers(): string[] {
  return existsSync(REGISTRY) ? readdirSync(REGISTRY) : [];
}

export function dockerNames(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile("docker", ["ps", "--format", "{{.Names}}"], { timeout: 20_000 }, (err, out) => {
      if (err) reject(new Error(`docker ps failed: ${err.message}`));
      else resolve(out.split("\n").filter((l) => l !== ""));
    });
  });
}

// --- loopback, folders and processes --------------------------------------

/** Only `fetch` of the folder: loopback only (docs/seguridad.md). */
export async function getLocal(
  base: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; headers: Headers; buf: Buffer; text: string }> {
  if (!base.startsWith("http://127.0.0.1:")) throw new Error("solo 127.0.0.1");
  // nosemgrep: react-insecure-request -- loopback de prueba (docs/seguridad.md)
  const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(10_000) });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buf, text: buf.toString("utf8") };
}

export function devHeaders(panel: Panel = P124): Record<string, string> {
  return {
    "Tintero-Protocol": "1",
    "Tintero-Firmware": "test-0.1.0",
    "Tintero-Power": "usb",
    "Tintero-Formats": "raw1",
    "Tintero-Panel": formatPanelHeader(panel),
  };
}

export function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
export function rmDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export interface RunResult {
  code: number | null;
  out: string;
  err: string;
}

/** Runs `npm run --silent <script> -- args` and waits for it (killed after `ms`). */
export function runNpm(script: string, args: string[], ms = 120_000): Promise<RunResult> {
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

export interface Cli {
  url: string;
  lines: string[];
  stop(): Promise<void>;
}

/** Starts `npm run server -- --port 0 ...` (new process group) and reads the first line. */
export async function startCli(extra: string[], signalGroup = false): Promise<Cli> {
  const p = spawn(process.execPath, ["server/src/main.ts", "--port", "0", ...extra], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines: string[] = [];
  let pending = "";
  p.stdout.on("data", (d: Buffer) => {
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
  const stop = async (): Promise<void> => {
    if (!p.pid) return;
    try {
      // By default only the server process gets the signal (as a service manager would);
      // with `signalGroup` the whole process group does (as Ctrl-C in a terminal would).
      process.kill(signalGroup ? -p.pid : p.pid, "SIGTERM");
    } catch {
      return;
    }
    await Promise.race([exited, new Promise((r) => setTimeout(r, 20_000))]);
    try {
      process.kill(-p.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  };
  const end = Date.now() + 90_000;
  while (lines.length === 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  const m = /^\{"listening":"(http:\/\/127\.0\.0\.1:\d+)"\}$/.exec(lines[0] ?? "");
  if (!m?.[1]) {
    await stop();
    throw new Error(`unexpected first line: ${lines[0] ?? "(none)"}`);
  }
  return { url: m[1], lines, stop };
}
