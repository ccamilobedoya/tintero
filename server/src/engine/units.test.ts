import { describe, expect, it } from "vitest";
import { mmToPx, ptToPx } from "./units.ts";

describe("units", () => {
  it("converts millimetres", () => {
    expect(mmToPx(2, 124)).toBe(10);
    expect(mmToPx(7, 124)).toBe(34);
    expect(mmToPx(0.5, 124)).toBe(2);
    expect(mmToPx(0.1, 124)).toBe(1);
    expect(mmToPx(5, 200)).toBe(39);
  });

  it("converts points", () => {
    expect(ptToPx(9, 124)).toBe(16);
    expect(ptToPx(12, 200)).toBe(33);
    expect(ptToPx(0.01, 50)).toBe(1);
  });
});
