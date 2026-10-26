import { describe, expect, it } from "vitest";
import { ICONS } from "../config.ts";
import { PICTOGRAMS, pictogram } from "./pictograms.ts";

describe("pictograms", () => {
  it("has a drawing for every icon", () => {
    expect(Object.keys(PICTOGRAMS).sort()).toEqual([...ICONS].sort());
  });

  it("builds a square svg with the fixed attributes", () => {
    const svg = pictogram("casa", 16).value;
    expect(svg).toContain('width="16" height="16" viewBox="0 0 16 16"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain(PICTOGRAMS.casa);
  });

  it("scales with the requested size", () => {
    expect(pictogram("estrella", 24).value).toContain('width="24" height="24"');
  });
});
