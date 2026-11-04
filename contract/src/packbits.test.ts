/* eslint-disable security/detect-object-injection -- indexes are loop counters over local arrays */
import { describe, expect, it } from "vitest";
import { packBits, unpackBits } from "./packbits.ts";

/** Small deterministic generator, so the cases are the same on every run. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

describe("packBits / unpackBits", () => {
  it("round-trips random inputs of many lengths", () => {
    const next = lcg(12345);
    for (let n = 0; n < 200; n++) {
      const length = next() % 6000;
      const mode = next() % 3;
      const raw = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        const r = next();
        raw[i] = mode === 0 ? r >>> 24 : mode === 1 ? ((r >>> 28) & 3) * 85 : r % 11 === 0 ? 1 : 0;
      }
      expect(unpackBits(packBits(raw), length)).toEqual(raw);
    }
  });

  it("handles empty input, a full run and runs longer than 128", () => {
    expect(packBits(new Uint8Array(0)).length).toBe(0);
    expect(unpackBits(new Uint8Array(0), 0).length).toBe(0);
    const white = new Uint8Array(48_000).fill(0xff);
    const packed = packBits(white);
    expect(packed.length).toBeLessThan(800);
    expect(unpackBits(packed, white.length)).toEqual(white);
  });

  it("never writes the control byte 128 and keeps worst-case growth small", () => {
    const next = lcg(7);
    const noise = new Uint8Array(48_000);
    for (let i = 0; i < noise.length; i++) noise[i] = next() >>> 24;
    const packed = packBits(noise);
    expect(packed.length).toBeLessThanOrEqual(noise.length + Math.ceil(noise.length / 128));
    // Walk the stream: a control byte is never 128.
    for (let i = 0; i < packed.length;) {
      const control = packed[i] ?? 0;
      expect(control).not.toBe(128);
      i += control < 128 ? control + 2 : 2;
    }
  });

  it("encodes a known example", () => {
    const raw = Uint8Array.from([1, 2, 3, 9, 9, 9, 9, 4]);
    expect([...packBits(raw)]).toEqual([2, 1, 2, 3, 253, 9, 0, 4]);
  });

  it("rejects 128, overruns and short streams", () => {
    expect(() => unpackBits(Uint8Array.from([128]), 1)).toThrow();
    expect(() => unpackBits(Uint8Array.from([0, 1, 0, 2]), 1)).toThrow(); // passes rawBytes
    expect(() => unpackBits(Uint8Array.from([254, 7]), 1)).toThrow(); // repeat of 3 into 1
    expect(() => unpackBits(Uint8Array.from([0, 1]), 2)).toThrow(); // ends before rawBytes
    expect(() => unpackBits(Uint8Array.from([2, 1, 2]), 3)).toThrow(); // ends inside a copy
    expect(() => unpackBits(Uint8Array.from([254]), 3)).toThrow(); // ends inside a repeat
  });

  it("encodes a 48 000 byte image in under 5 ms", () => {
    const raw = new Uint8Array(48_000);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 31) % 7 === 0 ? 0xff : 0;
    packBits(raw); // warm up
    const t0 = performance.now();
    packBits(raw);
    expect(performance.now() - t0).toBeLessThan(5);
  });
});
