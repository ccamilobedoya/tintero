import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { defaultConfig, type EmulatorConfig } from "../../../emulator/src/index.ts";
import type { Logged } from "./testserver.ts";

export const ROOT = new URL("../../../", import.meta.url).pathname;

export function cfg(
  server: string,
  store: string,
  over: Partial<EmulatorConfig> = {},
): EmulatorConfig {
  return { ...defaultConfig(server, store), ...over };
}

export function headersOf(l: Logged): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(l.headers)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.join(",");
  }
  return out;
}

/** Decodes a 1-bit grayscale PNG into packed rows (PNG convention: 0 = black). */
export function decodePng1(png: Uint8Array): { w: number; h: number; rows: Buffer } {
  const buf = Buffer.from(png);
  let pos = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const rowBytes = Math.ceil(w / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(rowBytes * h);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (rowBytes + 1)] ?? 0;
    for (let i = 0; i < rowBytes; i++) {
      const x = raw[y * (rowBytes + 1) + 1 + i] ?? 0;
      const a = i > 0 ? (out[y * rowBytes + i - 1] ?? 0) : 0;
      const b = y > 0 ? (out[(y - 1) * rowBytes + i] ?? 0) : 0;
      const c = i > 0 && y > 0 ? (out[(y - 1) * rowBytes + i - 1] ?? 0) : 0;
      let v = x;
      if (ft === 1) v = x + a;
      else if (ft === 2) v = x + b;
      else if (ft === 3) v = x + ((a + b) >> 1);
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * rowBytes + i] = v & 0xff;
    }
  }
  return { w, h, rows: out };
}

export function pngBit(rows: Buffer, w: number, x: number, y: number): number {
  return ((rows[y * Math.ceil(w / 8) + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
}

/** Relative path → content hash for every file under a folder. */
export function snapshot(dir: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const r = rel === "" ? name : `${rel}/${name}`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
    if (statSync(join(dir, r)).isDirectory()) Object.assign(out, snapshot(dir, r));
    else {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
      const data = readFileSync(join(dir, r));
      // eslint-disable-next-line security/detect-object-injection -- relative path key
      out[r] = createHash("sha256").update(data).digest("hex");
    }
  }
  return out;
}

export interface Ran {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs `npm run --silent <script> -- <args>` without blocking the event loop. */
export function runNpm(script: string, args: string[], timeoutMs = 60_000): Promise<Ran> {
  return new Promise((resolve) => {
    const p = spawn("npm", ["run", "--silent", script, "--", ...args], { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    p.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, stdout, stderr });
    });
  });
}

/** Loose shape of a WakeReport / PressReport line printed by the CLI. */
export interface CliLine {
  requests?: { method: string; path: string; status: number | string; bytes: number }[];
  downloaded?: string[];
  current?: string | null;
  nextWakeS?: number;
  errors?: { code: string; view?: string }[];
  connections?: number;
  key?: string;
  focus?: string | null;
}

export function jsonLines(text: string): CliLine[] {
  return text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as CliLine);
}
