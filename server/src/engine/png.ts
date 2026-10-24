/* eslint-disable security/detect-object-injection -- every index here is a number computed inside the checked size of the image */
// Reads the PNG that Chromium returns (8-bit RGB/RGBA, no interlace) and packs it to raw1.
import { crc32, inflateSync } from "node:zlib";
import { raw1Bytes, type Panel } from "../../../contract/src/index.ts";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Chromium's screenshots of a panel (at most 2048 x 2048) never come close to this.
const MAX_PNG_BYTES = 32 * 1024 * 1024;

const u32 = (bytes: Uint8Array, at: number): number =>
  (bytes[at] ?? 0) * 0x1000000 +
  ((bytes[at + 1] ?? 0) << 16) +
  ((bytes[at + 2] ?? 0) << 8) +
  (bytes[at + 3] ?? 0);

/** Luminance (8 bits per pixel, `w × h`) of a PNG. Anything but what Chromium sends is an error. */
export function decodePng(bytes: Uint8Array, panel: Panel): Uint8Array {
  if (bytes.length > MAX_PNG_BYTES || bytes.length < 8 + 12 + 13) throw new Error("bad PNG size");
  if (SIGNATURE.some((value, i) => bytes[i] !== value)) throw new Error("not a PNG");
  let header: { w: number; h: number; channels: number } | undefined;
  const data: Uint8Array[] = [];
  let at = 8;
  let ended = false;
  while (at + 12 <= bytes.length && !ended) {
    const length = u32(bytes, at);
    const type = Buffer.from(bytes.subarray(at + 4, at + 8)).toString("latin1");
    if (length > bytes.length - at - 12) throw new Error("truncated PNG");
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== u32(bytes, at + 8 + length)) {
      throw new Error("bad PNG checksum");
    }
    if (type === "IHDR") {
      if (header !== undefined || length !== 13) throw new Error("bad IHDR");
      const [depth, color, compression, filter, interlace] = [
        body[8],
        body[9],
        body[10],
        body[11],
        body[12],
      ];
      if (depth !== 8 || (color !== 2 && color !== 6)) throw new Error("unsupported PNG format");
      if (compression !== 0 || filter !== 0 || interlace !== 0) throw new Error("unsupported PNG");
      header = { w: u32(body, 0), h: u32(body, 4), channels: color === 2 ? 3 : 4 };
      // The size is checked before anything is decompressed.
      if (header.w !== panel.w || header.h !== panel.h) throw new Error("PNG size mismatch");
    } else if (type === "IDAT") {
      if (header === undefined) throw new Error("IDAT before IHDR");
      data.push(body);
    } else if (type === "IEND") {
      ended = true;
    }
    at += 12 + length;
  }
  if (header === undefined || !ended || data.length === 0) throw new Error("incomplete PNG");
  const { w, h, channels } = header;
  const stride = w * channels;
  const raw = inflateSync(Buffer.concat(data), { maxOutputLength: h * (1 + w * 4) });
  if (raw.length !== h * (1 + stride)) throw new Error("bad PNG data");

  const out = new Uint8Array(w * h);
  let previous: Uint8Array = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const start = y * (1 + stride);
    const filterType = raw[start] ?? 0;
    const line = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const x = raw[start + 1 + i] ?? 0;
      const left = i >= channels ? (line[i - channels] ?? 0) : 0;
      const up = previous[i] ?? 0;
      const upLeft = i >= channels ? (previous[i - channels] ?? 0) : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + left;
          break;
        case 2:
          value = x + up;
          break;
        case 3:
          value = x + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
          value = x + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new Error("bad PNG filter");
      }
      line[i] = value & 0xff;
    }
    for (let px = 0; px < w; px++) {
      const o = px * channels;
      out[y * w + px] = Math.round(
        0.299 * (line[o] ?? 0) + 0.587 * (line[o + 1] ?? 0) + 0.114 * (line[o + 2] ?? 0),
      );
    }
    previous = line;
  }
  return out;
}

/** Pixels that are neither pure black nor pure white. */
export function countGray(gray: Uint8Array): number {
  let count = 0;
  for (const value of gray) if (value !== 0 && value !== 255) count++;
  return count;
}

/** Below 128 is black (1); MSB first, rows padded to the byte (raw1 of F-001). */
export function toRaw1(gray: Uint8Array, panel: Panel): Uint8Array {
  const stride = Math.ceil(panel.w / 8);
  const out = new Uint8Array(raw1Bytes(panel));
  for (let y = 0; y < panel.h; y++) {
    for (let x = 0; x < panel.w; x++) {
      if ((gray[y * panel.w + x] ?? 255) < 128) {
        out[y * stride + (x >> 3)] = (out[y * stride + (x >> 3)] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return out;
}
