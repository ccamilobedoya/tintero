import { describe, expect, it } from "vitest";
import type { Panel, Zone } from "./index.ts";
import { checkFocusBand, validateDeviceHeaders, validateZones } from "./index.ts";

const P16: Panel = { w: 16, h: 16, dpi: 124, depth: 1 };
const ZONE: Zone = { id: "z", x: 0, y: 0, w: 16, h: 16, act: "toggle" };

/** A 16 x 16 raw1 (1 = black) with the given black pixels. */
function withBlack(...points: [number, number][]): Uint8Array {
  const raw = new Uint8Array(2 * 16);
  for (const [x, y] of points) {
    const i = y * 2 + (x >> 3);
    raw.set([(raw.at(i) ?? 0) | (0x80 >> (x & 7))], i);
  }
  return raw;
}

describe("checkFocusBand", () => {
  it("finds ink only inside the band", () => {
    expect(checkFocusBand(withBlack(), P16, [ZONE], 3)).toEqual([]);
    expect(checkFocusBand(withBlack([2, 8]), P16, [ZONE], 3)).toEqual(["z"]);
    expect(checkFocusBand(withBlack([3, 8]), P16, [ZONE], 3)).toEqual([]);
    expect(checkFocusBand(withBlack([13, 8]), P16, [ZONE], 3)).toEqual(["z"]);
    expect(checkFocusBand(withBlack([12, 12]), P16, [ZONE], 3)).toEqual([]);
    expect(checkFocusBand(withBlack([8, 2]), P16, [ZONE], 3)).toEqual(["z"]);
    expect(checkFocusBand(withBlack([8, 13]), P16, [ZONE], 3)).toEqual(["z"]);
    expect(checkFocusBand(withBlack([8, 12]), P16, [ZONE], 3)).toEqual([]);
  });

  it("handles a zone that does not start on a byte and ignores ink outside it", () => {
    const zone: Zone = { id: "q", x: 4, y: 4, w: 8, h: 8, act: "open" };
    expect(checkFocusBand(withBlack([3, 8], [12, 8], [8, 3]), P16, [zone], 2)).toEqual([]);
    expect(checkFocusBand(withBlack([4, 8]), P16, [zone], 2)).toEqual(["q"]);
    expect(checkFocusBand(withBlack([11, 8]), P16, [zone], 2)).toEqual(["q"]);
    expect(checkFocusBand(withBlack([7, 8]), P16, [zone], 2)).toEqual([]);
  });
});

describe("zone alignment and focus", () => {
  const panel: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
  const body = (zone: object, focus?: object) =>
    JSON.stringify({ view: "v", hash: "9f2c1a7b", zones: [zone], ...(focus ? { focus } : {}) });
  it("rejects unaligned x or w and a thin pad", () => {
    const ok = { id: "a", x: 8, y: 8, w: 16, h: 16, act: "open" };
    expect(validateZones(body(ok, { ring: 3, pad: 6, dash: 8 }), panel).ok).toBe(true);
    const bad = validateZones(body({ ...ok, x: 10 }), panel);
    expect(!bad.ok && bad.errors[0]?.code).toBe("unaligned");
    const wide = validateZones(body({ ...ok, w: 20 }), panel);
    expect(!wide.ok && wide.errors[0]?.code).toBe("unaligned");
    const thin = validateZones(body(ok, { ring: 4, pad: 3, dash: 8 }), panel);
    expect(!thin.ok && thin.errors[0]).toEqual({ path: "/focus", code: "focus_pad" });
  });
  it("reads Tintero-View", () => {
    const base = {
      "Tintero-Protocol": "1",
      "Tintero-Firmware": "x",
      "Tintero-Power": "usb",
      "Tintero-Formats": "raw1",
      "Tintero-Panel": "w=800,h=480,dpi=124,depth=1",
    };
    const good = validateDeviceHeaders({ ...base, "Tintero-View": "tablero" });
    expect(good.ok && good.value.view).toBe("tablero");
    expect(validateDeviceHeaders({ ...base, "Tintero-View": "Tablero!" }).ok).toBe(false);
    const none = validateDeviceHeaders(base);
    expect(none.ok && none.value.view).toBeUndefined();
  });
});
