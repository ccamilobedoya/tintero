/* eslint-disable security/detect-object-injection, security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- índices numéricos, carpetas propias y JSON de ejemplo editado en la prueba */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import {
  parseDataFile,
  parseViewsConfig,
  type Engine,
  type RenderOutput,
  type Renderer,
} from "../../../server/src/engine/index.ts";
import {
  API,
  NOON,
  P124,
  ROOT,
  devHeaders,
  getLocal,
  mkEngine,
  type Loose,
} from "../F-005/helpers.ts";

export { API, NOON, P124, ROOT, devHeaders, getLocal, mkEngine };
export type { Loose };

export const HERE = join(ROOT, "tests/acceptance/F-019/");
export const FIXTURES = join(HERE, "fixtures/");
export const RAW_BYTES = 48_000;
/** Lunes 26 de octubre de 2026, 08:00 en Lima: la hora de los datos de `hoy` (F-015). */
export const NOW_HOY = "2026-10-26T13:00:00Z";
export const NAMES = ["hoy", "agenda", "tablero", "blank", "noise"] as const;

// --- seeded random numbers --------------------------------------------------------------------

/** mulberry32: a small generator with a fixed seed, so the data are always the same. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function noiseBytes(n: number, seed: number): Uint8Array {
  const next = rng(seed);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(next() * 256);
  return out;
}

// --- reference PackBits (R8, written from the card, not from the code under test) ---------------

/**
 * One stream over all the bytes (runs cross rows). Control n: 0…127 copies the n+1 bytes that
 * follow; 129…255 repeats 257−n times the byte that follows; 128 is never emitted.
 */
export function refEncode(raw: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < raw.length) {
    let run = 1;
    while (i + run < raw.length && raw[i + run] === raw[i] && run < 128) run++;
    if (run >= 2) {
      out.push(257 - run, raw[i] ?? 0);
      i += run;
      continue;
    }
    const start = i;
    i++;
    while (i < raw.length && i - start < 128 && !(i + 1 < raw.length && raw[i] === raw[i + 1])) {
      i++;
    }
    out.push(i - start - 1);
    for (let k = start; k < i; k++) out.push(raw[k] ?? 0);
  }
  return Uint8Array.from(out);
}

/** The matching reference decoder, to check the reference encoder itself. */
export function refDecode(packed: Uint8Array, rawBytes: number): Uint8Array {
  const out = new Uint8Array(rawBytes);
  let o = 0;
  let i = 0;
  while (i < packed.length) {
    const n = packed[i++] ?? 0;
    if (n === 128) throw new Error("0x80");
    if (n < 128) {
      for (let k = 0; k <= n; k++) out[o++] = packed[i++] ?? 0;
    } else {
      const v = packed[i++] ?? 0;
      for (let k = 0; k < 257 - n; k++) out[o++] = v;
    }
  }
  if (o !== rawBytes) throw new Error(`decoded ${String(o)} of ${String(rawBytes)}`);
  return out;
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// --- fixtures ----------------------------------------------------------------------------------

export function readFixture(name: string, ext: "raw1" | "pb1"): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, `${name}.${ext}`)));
}

// --- renderers that draw without Chromium ---------------------------------------------------------

function textLike(seed: number, bytes: number, w: number): Uint8Array {
  const out = new Uint8Array(bytes);
  const stride = Math.ceil(w / 8);
  const next = rng(seed);
  const glyph = Array.from({ length: 16 }, () => Math.floor(next() * 256));
  for (let i = 0; i < bytes; i++) {
    const y = Math.floor(i / stride);
    const x = i % stride;
    if (y % 24 < 2) out[i] = 0xff;
    else if (y % 24 > 6 && y % 24 < 18 && x % 11 < 4) out[i] = glyph[(x + y) % 16] ?? 0;
  }
  return out;
}

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A renderer for the server tests: `text` draws compressible pictures that differ by page,
 * `noise` draws bytes that PackBits cannot make smaller.
 */
export function drawing(kind: "text" | "noise"): Renderer {
  return {
    render: (html, panel): Promise<RenderOutput> => {
      const bytes = Math.ceil(panel.w / 8) * panel.h;
      const seed = hashOf(html);
      return Promise.resolve({
        raw1: kind === "noise" ? noiseBytes(bytes, seed) : textLike(seed, bytes, panel.w),
        gray: 0,
        boxes: [],
        overflow: [],
      });
    },
    blockedRequests: () => 0,
    close: () => Promise.resolve(),
  };
}

export function engineWith(kind: "text" | "noise", views: string[]): Engine {
  const parsed: Loose = JSON.parse(readFileSync(join(ROOT, "config/views.example.json"), "utf8"));
  parsed.devices["*"].views = views;
  const config = parseViewsConfig(JSON.stringify(parsed));
  const data = parseDataFile(readFileSync(join(ROOT, "config/data.example.json"), "utf8"), config);
  return mkEngine(drawing(kind), { config, data });
}

/** Lines that the server writes to stdout while `fn` runs. */
export async function captureStdout<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; lines: string[] }> {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    for (const line of String(chunk).split("\n")) if (line !== "") lines.push(line);
    return true;
  });
  try {
    const value = await fn();
    return { value, lines };
  } finally {
    spy.mockRestore();
  }
}

// --- processes -------------------------------------------------------------------------------------

export interface Exit {
  code: number | null;
  out: string;
}

export function run(file: string, args: string[], ms: number): Promise<Exit> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { cwd: ROOT, timeout: ms, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : null;
        resolve({ code, out: `${stdout}${stderr}` });
      },
    );
  });
}
