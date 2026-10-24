import { describe, expect, it } from "vitest";
import type { Panel } from "../../../contract/src/index.ts";
import type { Grid } from "./config.ts";
import { dividers, slotRects } from "./layout.ts";

const P124: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const V124: Panel = { w: 480, h: 800, dpi: 124, depth: 1 };

const hoy: Grid = {
  columns: [50, 50],
  rows: [55, 45],
  areas: [
    ["pendientes", "eventos"],
    ["jira", "calendario"],
  ],
};
const portrait: Grid = {
  columns: [100],
  rows: [35, 25, 15, 25],
  areas: [["pendientes"], ["eventos"], ["jira"], ["calendario"]],
};

describe("slotRects", () => {
  it("lays out the 4 areas of `hoy` in Tab order", () => {
    expect(slotRects(hoy, P124)).toEqual([
      { area: "pendientes", x: 0, y: 36, w: 400, h: 244 },
      { area: "eventos", x: 402, y: 36, w: 398, h: 244 },
      { area: "jira", x: 0, y: 282, w: 400, h: 198 },
      { area: "calendario", x: 402, y: 282, w: 398, h: 198 },
    ]);
  });

  it("uses the portrait grid", () => {
    const [first, second] = slotRects(portrait, V124);
    expect(first).toEqual({ area: "pendientes", x: 0, y: 36, w: 480, h: 267 });
    expect(second).toEqual({ area: "eventos", x: 0, y: 305, w: 480, h: 189 });
  });

  it("joins cells of an area that spans several", () => {
    const grid: Grid = {
      columns: [50, 50],
      rows: [50, 50],
      areas: [
        ["a", "b"],
        ["a", "c"],
      ],
    };
    const a = slotRects(grid, P124).find((r) => r.area === "a");
    expect(a).toMatchObject({ x: 0, w: 400 });
    expect(a?.h).toBe(480 - 36);
  });
});

describe("dividers", () => {
  it("draws rules of thickness L only between different areas", () => {
    const rules = dividers(hoy, P124);
    const covers = (x: number, y: number): boolean =>
      rules.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    for (const [x, y] of [
      [400, 150],
      [401, 150],
      [200, 280],
      [200, 281],
    ] as const) {
      expect(covers(x, y)).toBe(true);
    }
    for (const [x, y] of [
      [399, 150],
      [402, 150],
      [200, 279],
      [200, 282],
    ] as const) {
      expect(covers(x, y)).toBe(false);
    }
  });

  it("has none for a single area", () => {
    expect(dividers({ columns: [100], rows: [100], areas: [["a"]] }, P124)).toEqual([]);
  });
});
