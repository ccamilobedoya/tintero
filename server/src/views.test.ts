import { describe, expect, it } from "vitest";
import { raw1Bytes, type Panel } from "../../contract/src/index.ts";
import { DemoState } from "./state.ts";
import { makeViews } from "./views.ts";

const black = (raw: Uint8Array, panel: Panel, x: number, y: number): boolean =>
  ((raw[y * Math.ceil(panel.w / 8) + (x >> 3)] ?? 0) & (0x80 >> (x & 7))) !== 0;

const P800: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const P648: Panel = { w: 648, h: 480, dpi: 124, depth: 1 };

describe("demonstration views", () => {
  it("draw a border and fill a checked box (CA5)", () => {
    const state = new DemoState();
    const [demo] = makeViews(state);
    const empty = demo?.raw1(P800) ?? new Uint8Array();
    expect(empty).toHaveLength(48_000);
    expect(black(empty, P800, 0, 0)).toBe(true);
    // c2 = x 20, y 100, 120 x 40 (u = 20)
    expect(black(empty, P800, 80, 120)).toBe(false);
    state.checked[1] = true;
    const filled = demo?.raw1(P800) ?? new Uint8Array();
    expect(black(filled, P800, 80, 120)).toBe(true);
    expect(demo?.zones(P800).map((z) => z.id)).toEqual(["c1", "c2", "c3", "abrir"]);
  });

  it("draws the 1 cm grid by the dpi (CA7)", () => {
    const [, , patron] = makeViews(new DemoState());
    const raw = patron?.raw1(P648) ?? new Uint8Array();
    expect(raw).toHaveLength(raw1Bytes(P648));
    expect(black(raw, P648, 49, 240)).toBe(true);
    expect(black(raw, P648, 98, 240)).toBe(true);
    expect(black(raw, P648, 48, 240)).toBe(false);
    expect(black(raw, P648, 50, 240)).toBe(false);
  });

  it("keeps every zone inside tiny panels and at least 8 px", () => {
    for (const panel of [
      { w: 8, h: 8, dpi: 50, depth: 1 },
      { w: 100, h: 60, dpi: 100, depth: 1 },
    ] as const) {
      for (const view of makeViews(new DemoState())) {
        expect(view.raw1(panel)).toHaveLength(raw1Bytes(panel));
        for (const z of view.zones(panel)) {
          expect(z.x + z.w).toBeLessThanOrEqual(panel.w);
          expect(z.y + z.h).toBeLessThanOrEqual(panel.h);
          expect(Math.min(z.w, z.h)).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });
});
