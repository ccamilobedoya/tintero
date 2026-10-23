import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { checkImage, type Panel } from "../../contract/src/index.ts";
import { encodePng1, renderScreen } from "./index.ts";

const PANEL: Panel = { w: 20, h: 10, dpi: 124, depth: 1 }; // 3 bytes per row (padded)
const stride = 3;
const blank = (): Uint8Array => new Uint8Array(stride * 10);
const bit = (raw: Uint8Array, x: number, y: number): number =>
  ((raw[y * stride + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;

describe("renderScreen", () => {
  it("inverts exactly the 3 px frame inside the zone", () => {
    const zone = { id: "z", x: 2, y: 1, w: 12, h: 8, act: "open" as const };
    const out = renderScreen(blank(), PANEL, zone);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 20; x++) {
        const inside = x >= 2 && x < 14 && y >= 1 && y < 9;
        const edge = x < 5 || x >= 11 || y < 4 || y >= 6;
        expect(bit(out, x, y)).toBe(inside && edge ? 1 : 0);
      }
    }
  });

  it("does not change the input and rejects a wrong size", () => {
    const raw = blank();
    renderScreen(raw, PANEL, { id: "z", x: 0, y: 0, w: 8, h: 8, act: "open" });
    expect(raw.every((byte) => byte === 0)).toBe(true);
    expect(() => renderScreen(new Uint8Array(3), PANEL)).toThrow();
  });
});

describe("encodePng1", () => {
  it("makes a valid 1-bit PNG with inverted bits", () => {
    const raw = blank();
    raw[0] = 0x80; // pixel (0,0) black
    const png = encodePng1(raw, PANEL);
    expect(checkImage("png1", png, PANEL).ok).toBe(true);
    const idat = Buffer.from(png).subarray(41, png.length - 16); // 8 + 25 (IHDR) + 8 header of IDAT
    const rows = inflateSync(idat);
    expect(rows).toHaveLength((stride + 1) * 10);
    expect(rows[0]).toBe(0); // filter type
    expect(rows[1]).toBe(0x7f);
    expect(rows[2]).toBe(0xff);
  });

  it("rejects a raw1 of the wrong size", () => {
    expect(() => encodePng1(new Uint8Array(3), PANEL)).toThrow();
  });
});
