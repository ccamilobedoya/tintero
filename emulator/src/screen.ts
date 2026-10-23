import { raw1Bytes, type Panel, type Zone } from "../../contract/src/index.ts";

const FRAME = 3;

/** Returns a copy of raw1 with the focus frame (3 px inside the zone's border) inverted. */
export function renderScreen(raw1: Uint8Array, panel: Panel, focus?: Zone): Uint8Array {
  if (raw1.length !== raw1Bytes(panel)) throw new Error("raw1 size does not match the panel");
  const out = Uint8Array.from(raw1);
  if (focus === undefined) return out;
  const stride = Math.ceil(panel.w / 8);
  const x1 = Math.min(focus.x + focus.w, panel.w);
  const y1 = Math.min(focus.y + focus.h, panel.h);
  for (let y = focus.y; y < y1; y++) {
    for (let x = focus.x; x < x1; x++) {
      const inFrame =
        x < focus.x + FRAME ||
        x >= focus.x + focus.w - FRAME ||
        y < focus.y + FRAME ||
        y >= focus.y + focus.h - FRAME;
      if (!inFrame) continue;
      const index = y * stride + (x >> 3);
      // eslint-disable-next-line security/detect-object-injection -- index is bounded by the loops
      out[index] = (out[index] ?? 0) ^ (0x80 >> (x & 7));
    }
  }
  return out;
}
