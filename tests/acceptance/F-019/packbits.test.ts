// CA12: el codificador compartido (contract/src/packbits.ts).
import { describe, expect, it } from "vitest";
import { packBits, unpackBits } from "../../../contract/src/packbits.ts";
import { NAMES, RAW_BYTES, readFixture, refDecode, refEncode, rng, sameBytes } from "./helpers.ts";

/** Entradas al azar de largo 0…48 000, con distintas formas (ruido, corridas largas, casi todo blanco). */
function randomInputs(count: number): Uint8Array[] {
  const next = rng(20261104);
  const inputs: Uint8Array[] = [Uint8Array.of(), Uint8Array.of(7), new Uint8Array(48_000)];
  while (inputs.length < count) {
    const len = Math.floor(next() * 48_001);
    const kind = inputs.length % 4;
    const out = new Uint8Array(len);
    let i = 0;
    while (i < len) {
      if (kind === 0) {
        out[i++] = Math.floor(next() * 256);
      } else if (kind === 1) {
        const run = 1 + Math.floor(next() * 300);
        const v = Math.floor(next() * 256);
        for (let k = 0; k < run && i < len; k++) out[i++] = v;
      } else if (kind === 2) {
        out[i++] = next() < 0.02 ? Math.floor(next() * 256) : 0;
      } else {
        // 0x80 y 0xff en abundancia: valores que no deben confundirse con controles
        out[i++] = next() < 0.5 ? 0x80 : next() < 0.5 ? 0xff : Math.floor(next() * 256);
      }
    }
    inputs.push(out);
  }
  return inputs;
}

describe("CA12 packBits / unpackBits", () => {
  it("unpackBits(packBits(x), x.length) = x para 200 entradas al azar de largo 0…48 000", () => {
    const inputs = randomInputs(200);
    expect(inputs).toHaveLength(200);
    inputs.forEach((x, n) => {
      const packed = packBits(x);
      const back = unpackBits(packed, x.length);
      expect(back.length, `entrada ${String(n)}`).toBe(x.length);
      expect(sameBytes(back, x), `entrada ${String(n)} (largo ${String(x.length)})`).toBe(true);
    });
  }, 60_000);

  it("también con las imágenes de CA11", () => {
    for (const name of NAMES) {
      const raw = readFixture(name, "raw1");
      expect(sameBytes(unpackBits(packBits(raw), RAW_BYTES), raw), name).toBe(true);
    }
  });

  it("lo que produce packBits lo entiende el decodificador de referencia y viceversa (R8)", () => {
    for (const name of NAMES) {
      const raw = readFixture(name, "raw1");
      expect(sameBytes(refDecode(packBits(raw), RAW_BYTES), raw), `${name} packBits→ref`).toBe(
        true,
      );
      expect(sameBytes(unpackBits(refEncode(raw), RAW_BYTES), raw), `${name} ref→unpackBits`).toBe(
        true,
      );
    }
  });

  it("packBits nunca emite 0x80 como byte de control", () => {
    // Se recorre el flujo por sus controles, no por bytes sueltos: 0x80 como dato es válido.
    const controls = (packed: Uint8Array): number[] => {
      const found: number[] = [];
      let i = 0;
      while (i < packed.length) {
        const n = packed[i] ?? 0;
        found.push(n);
        i += n < 128 ? n + 2 : n === 128 ? 1 : 2;
      }
      return found;
    };
    const inputs = [...randomInputs(40), ...NAMES.map((n) => readFixture(n, "raw1"))];
    for (const x of inputs) {
      const found = controls(packBits(x));
      expect(found.includes(128)).toBe(false);
    }
    // entrada hecha a propósito: muchos 0x80 sueltos y en corrida
    const eights = Uint8Array.from({ length: 1000 }, (_, i) => (i % 7 < 3 ? 0x80 : i & 0xff));
    expect(controls(packBits(eights)).includes(128)).toBe(false);
    expect(sameBytes(unpackBits(packBits(eights), 1000), eights)).toBe(true);
  });

  it("la imagen de hoy de los datos de prueba mide como máximo 16 000 bytes", () => {
    const raw = readFixture("hoy", "raw1");
    expect(packBits(raw).length).toBeLessThanOrEqual(16_000);
  });

  it("una imagen toda blanca se achica mucho y el ruido no se achica (decide el servidor)", () => {
    expect(packBits(readFixture("blank", "raw1")).length).toBeLessThan(2_000);
    expect(packBits(readFixture("noise", "raw1")).length).toBeGreaterThanOrEqual(RAW_BYTES);
  });

  it("codificar 48 000 bytes tarda 5 ms o menos (mejor de 5 pruebas)", () => {
    const raw = readFixture("hoy", "raw1");
    let best = Infinity;
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      packBits(raw);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThanOrEqual(5);
  });

  it("unpackBits lanza con 0x80, con un flujo que se pasa y con uno corto", () => {
    expect(() => unpackBits(Uint8Array.of(0x80), 10)).toThrow(Error);
    expect(() => unpackBits(Uint8Array.of(0x01, 0x11, 0x22, 0x80, 0x00, 0x33), 10)).toThrow(Error);
    // se pasa: 11 copias para 10 bytes; literal de 3 para 2 bytes; un byte de más al final
    expect(() => unpackBits(Uint8Array.of(0xf6, 0xaa), 10)).toThrow(Error);
    expect(() => unpackBits(Uint8Array.of(0x02, 1, 2, 3), 2)).toThrow(Error);
    expect(() => unpackBits(Uint8Array.of(0xf7, 0xaa, 0x00, 0x55), 10)).toThrow(Error);
    // corto: faltan bytes, o termina a mitad de un control
    expect(() => unpackBits(Uint8Array.of(0xf7, 0xaa), 11)).toThrow(Error);
    expect(() => unpackBits(Uint8Array.of(0x03, 1, 2), 4)).toThrow(Error);
    expect(() => unpackBits(Uint8Array.of(0xf7), 10)).toThrow(Error);
    expect(() => unpackBits(Uint8Array.of(), 1)).toThrow(Error);
    const pb = readFixture("hoy", "pb1");
    expect(() => unpackBits(pb.subarray(0, pb.length - 1), RAW_BYTES)).toThrow(Error);
  });

  it("casos pequeños exactos: el vacío, un flujo vacío para 0 bytes y un 0x80 como dato", () => {
    expect(unpackBits(Uint8Array.of(), 0)).toHaveLength(0);
    expect(packBits(Uint8Array.of())).toHaveLength(0);
    expect(Array.from(unpackBits(Uint8Array.of(0x01, 0x80, 0x80), 2))).toEqual([0x80, 0x80]);
    expect(Array.from(unpackBits(Uint8Array.of(0xfe, 0x80), 3))).toEqual([0x80, 0x80, 0x80]);
    expect(Array.from(unpackBits(Uint8Array.of(0xff, 0x41), 2))).toEqual([0x41, 0x41]);
    expect(Array.from(unpackBits(Uint8Array.of(0x81, 0x41), 128))).toEqual(Array(128).fill(0x41));
  });
});
