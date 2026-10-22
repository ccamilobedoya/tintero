import { deflateSync, crc32 } from "node:zlib";
import type { Validation } from "../../../contract/src/index.ts";

export const PANEL = { w: 800, h: 480, dpi: 124, depth: 1 } as const;

export function indexDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocol: 1,
    server_time: 1761096000,
    next_wake_s: 1800,
    full_refresh: false,
    panel: { w: 800, h: 480, dpi: 124, depth: 1 },
    current: "todo",
    views: [
      { id: "todo", hash: "9f2c1a7b", format: "raw1", bytes: 48000, crc32: "3a1f09c4" },
      { id: "agenda", hash: "41d0e2aa", format: "raw1", bytes: 48000, crc32: "b7e2d150" },
    ],
    ...over,
  };
}

export function view(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, hash: "9f2c1a7b", format: "raw1", bytes: 48000, crc32: "3a1f09c4", ...over };
}

export function zone(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, x: 24, y: 72, w: 100, h: 40, act: "toggle", ...over };
}

export function zonesDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    view: "todo",
    hash: "9f2c1a7b",
    zones: [
      { id: "t1", x: 24, y: 72, w: 752, h: 40, act: "toggle" },
      { id: "t2", x: 24, y: 120, w: 752, h: 40, act: "toggle" },
      { id: "ev1", x: 24, y: 400, w: 360, h: 56, act: "open" },
    ],
    ...over,
  };
}

export function action(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, view: "todo", zone: "t2", act: "toggle", at: 1761096123, ...over };
}

export function logEntry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { at: 1761096200, level: "warn", msg: "wifi tardó 9 s", ...over };
}

export function ids(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => prefix + String(i).padStart(3, "0"));
}

export const j = (v: unknown): string => JSON.stringify(v);

export function codes<T>(r: Validation<T>): { path: string; code: string }[] {
  return r.ok ? [] : r.errors;
}

export function hasCode<T>(r: Validation<T>, code: string): boolean {
  return !r.ok && r.errors.some((e) => e.code === code);
}

/** Minimal PNG builder. 1-bit grayscale by default. */
export function makePng(
  w: number,
  h: number,
  opts: { depth?: number; colorType?: number; interlace?: number } = {},
): Uint8Array {
  const depth = opts.depth ?? 1;
  const colorType = opts.colorType ?? 0;
  const interlace = opts.interlace ?? 0;
  const rowBytes = Math.ceil((w * depth) / 8);
  const raw = Buffer.alloc((rowBytes + 1) * h);
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = depth;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = interlace;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
