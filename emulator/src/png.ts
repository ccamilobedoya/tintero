// Minimal PNG encoder: 1-bit grayscale, no interlace (R3).
import { crc32, deflateSync } from "node:zlib";
import { raw1Bytes, type Panel } from "../../contract/src/index.ts";

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** raw1 has 1 = black; PNG grayscale has 0 = black, so every bit is inverted. */
export function encodePng1(raw1: Uint8Array, panel: Panel): Uint8Array {
  if (raw1.length !== raw1Bytes(panel)) throw new Error("raw1 size does not match the panel");
  const stride = Math.ceil(panel.w / 8);
  const rows = Buffer.alloc((stride + 1) * panel.h); // each row starts with filter type 0
  for (let y = 0; y < panel.h; y++) {
    for (let i = 0; i < stride; i++) {
      rows[y * (stride + 1) + 1 + i] = ~(raw1[y * stride + i] ?? 0) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(panel.w, 0);
  header.writeUInt32BE(panel.h, 4);
  header[8] = 1; // bit depth
  header[9] = 0; // grayscale
  // compression, filter and interlace stay 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
