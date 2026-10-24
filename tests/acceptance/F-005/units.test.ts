import { describe, expect, it } from "vitest";
import { mmToPx, pickFont, ptToPx, type ThemeFont } from "../../../server/src/engine/index.ts";

describe("CA1 unidades y letra", () => {
  it("mmToPx y ptToPx", () => {
    expect(mmToPx(2, 124)).toBe(10);
    expect(mmToPx(7, 124)).toBe(34);
    expect(mmToPx(0.5, 124)).toBe(2);
    expect(mmToPx(0.1, 124)).toBe(1);
    expect(mmToPx(5, 200)).toBe(39);
    expect(ptToPx(9, 124)).toBe(16);
    expect(ptToPx(12, 200)).toBe(33);
  });

  it("pickFont con mapa de bits primero y contorno de respaldo", () => {
    const fonts: ThemeFont[] = [
      { family: "B", kind: "bitmap", sizes: [12, 14, 17, 20, 24] },
      { family: "O", kind: "outline" },
    ];
    expect(pickFont(16, fonts)).toEqual({ family: "B", px: 17 });
    expect(pickFont(25, fonts)).toEqual({ family: "B", px: 24 });
    expect(pickFont(15, fonts)).toEqual({ family: "B", px: 14 });
    expect(pickFont(13, fonts)).toEqual({ family: "B", px: 14 });
    expect(pickFont(30, fonts)).toEqual({ family: "O", px: 30 });
    expect(pickFont(10, fonts)).toEqual({ family: "O", px: 10 });
  });

  it("pickFont con minPx y respaldo DejaVu Sans", () => {
    const fonts: ThemeFont[] = [
      { family: "M", kind: "outline", minPx: 14 },
      { family: "B", kind: "bitmap", sizes: [12, 14] },
    ];
    expect(pickFont(15, fonts)).toEqual({ family: "M", px: 15 });
    expect(pickFont(12, fonts)).toEqual({ family: "B", px: 12 });
    expect(pickFont(9, fonts)).toEqual({ family: "DejaVu Sans", px: 9 });
  });
});
