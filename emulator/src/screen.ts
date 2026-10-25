import { raw1Bytes, type Panel, type Zone } from "../../contract/src/index.ts";

/**
 * Returns a copy of raw1 with the focus ring inverted (the ring rule of the contract): the pixels
 * less than `ring` from the zone border; with `dash > 0` the top and bottom strips keep the runs
 * of `dash` columns that start even, and the side strips the runs of `dash` rows that start even.
 */
export function renderScreen(
  raw1: Uint8Array,
  panel: Panel,
  focus?: Zone,
  ring = 3,
  dash = 0,
): Uint8Array {
  if (raw1.length !== raw1Bytes(panel)) throw new Error("raw1 size does not match the panel");
  const out = Uint8Array.from(raw1);
  if (focus === undefined) return out;
  const stride = Math.ceil(panel.w / 8);
  const x1 = Math.min(focus.x + focus.w, panel.w);
  const y1 = Math.min(focus.y + focus.h, panel.h);
  for (let y = focus.y; y < y1; y++) {
    for (let x = focus.x; x < x1; x++) {
      const dx = x - focus.x;
      const dy = y - focus.y;
      const horizontal = dy < ring || dy >= focus.h - ring;
      const vertical = dx < ring || dx >= focus.w - ring;
      if (!horizontal && !vertical) continue;
      if (dash > 0) {
        const run = Math.floor((horizontal ? dx : dy) / dash);
        if (run % 2 !== 0) continue;
      }
      const index = y * stride + (x >> 3);
      // eslint-disable-next-line security/detect-object-injection -- index is bounded by the loops
      out[index] = (out[index] ?? 0) ^ (0x80 >> (x & 7));
    }
  }
  return out;
}
