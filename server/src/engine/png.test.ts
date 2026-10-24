import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Panel } from "../../../contract/src/index.ts";
import { countGray, decodePng, toRaw1 } from "./png.ts";

const panel: Panel = { w: 10, h: 3, dpi: 124, depth: 1 };

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** An RGB or RGBA PNG; `lines` holds [filter, ...bytes] per row. */
function png(
  w: number,
  h: number,
  lines: number[][],
  options: { color?: number; depth?: number; interlace?: number } = {},
): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = options.depth ?? 8;
  header[9] = options.color ?? 2;
  header[12] = options.interlace ?? 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(lines.flat()))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const rgbRow = (filter: number, pixels: number[]): number[] => [
  filter,
  ...pixels.flatMap((v) => [v, v, v]),
];

describe("decodePng", () => {
  it("reads luminance of an RGB image (filter 0)", () => {
    const row = rgbRow(0, [0, 255, 0, 255, 0, 255, 0, 255, 0, 255]);
    const gray = decodePng(png(10, 3, [row, row, row]), panel);
    expect(gray.length).toBe(30);
    expect([...gray.subarray(0, 4)]).toEqual([0, 255, 0, 255]);
  });

  it("applies the weights of the luminance and reads RGBA", () => {
    const one: Panel = { w: 1, h: 1, dpi: 124, depth: 1 };
    const red = decodePng(png(1, 1, [[0, 255, 0, 0, 255]], { color: 6 }), one);
    expect(red[0]).toBe(Math.round(0.299 * 255));
  });

  it("undoes filters 1 to 4", () => {
    const one: Panel = { w: 2, h: 2, dpi: 124, depth: 1 };
    // Row 1 (filter 1, sub): pixel 2 = pixel 1 + delta. Row 2 (filter 2, up) adds the row above.
    const first = [1, 10, 10, 10, 5, 5, 5];
    const second = [2, 1, 1, 1, 2, 2, 2];
    const gray = decodePng(png(2, 2, [first, second]), one);
    expect([...gray]).toEqual([10, 15, 11, 17]);
    const avg = decodePng(
      png(2, 2, [
        [0, 8, 8, 8, 8, 8, 8],
        [3, 2, 2, 2, 2, 2, 2],
      ]),
      one,
    );
    expect([...avg]).toEqual([8, 8, 6, 9]);
    const paeth = decodePng(
      png(2, 2, [
        [0, 8, 8, 8, 8, 8, 8],
        [4, 1, 1, 1, 1, 1, 1],
      ]),
      one,
    );
    expect(paeth[2]).toBe(9);
  });

  it("rejects anything else", () => {
    const row = rgbRow(0, new Array<number>(10).fill(0));
    const good = png(10, 3, [row, row, row]);
    expect(() => decodePng(good, { ...panel, w: 11 })).toThrow("size mismatch");
    expect(() => decodePng(png(10, 3, [row, row, row], { depth: 16 }), panel)).toThrow();
    expect(() => decodePng(png(10, 3, [row, row, row], { color: 0 }), panel)).toThrow();
    expect(() => decodePng(png(10, 3, [row, row, row], { interlace: 1 }), panel)).toThrow();
    expect(() => decodePng(png(10, 3, [row, row, [9, ...row.slice(1)]]), panel)).toThrow("filter");
    expect(() => decodePng(new Uint8Array(100), panel)).toThrow("not a PNG");
    expect(() => decodePng(good.subarray(0, 30), panel)).toThrow();
    const bad = Uint8Array.from(good);
    bad[good.length - 20] = (bad[good.length - 20] ?? 0) ^ 0xff;
    expect(() => decodePng(bad, panel)).toThrow();
  });

  it("does not inflate more than the expected size", () => {
    const row = rgbRow(0, new Array<number>(10).fill(0));
    const big = png(10, 3, [row, row, row, row, row, row]);
    expect(() => decodePng(big, panel)).toThrow();
  });
});

describe("toRaw1 and countGray", () => {
  it("packs below 128 as black, MSB first, rows padded", () => {
    const gray = new Uint8Array(30).fill(255);
    gray[0] = 0;
    gray[9] = 100;
    gray[10] = 127;
    gray[11] = 128;
    const raw = toRaw1(gray, panel);
    expect(raw.length).toBe(6);
    expect([...raw]).toEqual([0x80, 0x40, 0x80, 0x00, 0x00, 0x00]);
  });

  it("counts pixels that are neither black nor white", () => {
    expect(countGray(Uint8Array.from([0, 255, 1, 254, 128, 0]))).toBe(3);
  });
});
