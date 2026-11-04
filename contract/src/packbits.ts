// PackBits, the codec of the `pb1` image format (F-019, R8): the raw1 bytes as one stream
// (runs cross row ends). Control byte n: 0..127 copy the next n+1 bytes; 129..255 repeat the
// next byte 257-n times; 128 is invalid and is never written.

const MAX_RUN = 128;

/** Encodes `raw` with PackBits. Runs of 3 or more become a repeat; the rest are copied. */
export function packBits(raw: Uint8Array): Uint8Array {
  // Worst case: every 128 bytes cost one control byte more.
  const out = new Uint8Array(raw.length + Math.ceil(raw.length / MAX_RUN));
  let o = 0;
  let i = 0;
  let literalStart = -1;

  const flushLiteral = (end: number): void => {
    if (literalStart < 0) return;
    out[o++] = end - literalStart - 1;
    out.set(raw.subarray(literalStart, end), o);
    o += end - literalStart;
    literalStart = -1;
  };

  while (i < raw.length) {
    const byte = raw.at(i);
    let run = 1;
    while (i + run < raw.length && raw[i + run] === byte && run < MAX_RUN) run++;
    if (run >= 3) {
      flushLiteral(i);
      out[o++] = 257 - run;
      out[o++] = byte ?? 0;
      i += run;
    } else {
      if (literalStart < 0) literalStart = i;
      i += run;
      if (i - literalStart >= MAX_RUN) {
        // Copy exactly 128 and keep going with what is left (a run of 2 may straddle the cut).
        const cut = literalStart + MAX_RUN;
        i = cut;
        flushLiteral(cut);
      }
    }
  }
  flushLiteral(i);
  return out.slice(0, o);
}

/**
 * Decodes a PackBits stream into exactly `rawBytes` bytes. Throws if the stream has a 128 control
 * byte, passes `rawBytes`, or ends before filling it (or in the middle of a run).
 */
export function unpackBits(packed: Uint8Array, rawBytes: number): Uint8Array {
  const out = new Uint8Array(rawBytes);
  let o = 0;
  let i = 0;
  while (i < packed.length) {
    const control = packed[i++] ?? 0;
    if (control === 128) throw new Error("packbits: invalid control byte 128");
    if (control < 128) {
      const n = control + 1;
      if (i + n > packed.length) throw new Error("packbits: stream ends inside a copy");
      if (o + n > rawBytes) throw new Error("packbits: output passes rawBytes");
      out.set(packed.subarray(i, i + n), o);
      i += n;
      o += n;
    } else {
      const n = 257 - control;
      if (i >= packed.length) throw new Error("packbits: stream ends inside a repeat");
      if (o + n > rawBytes) throw new Error("packbits: output passes rawBytes");
      out.fill(packed[i++] ?? 0, o, o + n);
      o += n;
    }
  }
  if (o !== rawBytes) throw new Error("packbits: stream ends before rawBytes");
  return out;
}
