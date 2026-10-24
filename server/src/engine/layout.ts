/* eslint-disable security/detect-object-injection -- every index here is a number inside the grid */
// From a grid of named areas to pixel rectangles (D2: the layout is fixed by the view).
import type { Panel } from "../../../contract/src/index.ts";
import type { Grid } from "./config.ts";
import { themeMetrics } from "./theme.ts";

export interface SlotRect {
  area: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Bounds {
  /** Start of each column / row, and its end (exclusive), without the divider rule. */
  colStart: number[];
  colEnd: number[];
  rowStart: number[];
  rowEnd: number[];
  /** Position of each inner boundary (the divider starts there). */
  colCut: number[];
  rowCut: number[];
  line: number;
}

function bounds(grid: Grid, panel: Panel): Bounds {
  const { bar, line } = themeMetrics(panel);
  const y0 = bar + line;
  const bodyH = panel.h - y0;
  const cut = (sizes: number[], total: number, base: number): number[] => {
    const out: number[] = [];
    let sum = 0;
    for (const size of sizes.slice(0, -1)) {
      sum += size;
      out.push(base + Math.round((total * sum) / 100));
    }
    return out;
  };
  const colCut = cut(grid.columns, panel.w, 0);
  const rowCut = cut(grid.rows, bodyH, y0);
  const starts = (cuts: number[], first: number): number[] => [first, ...cuts.map((c) => c + line)];
  const ends = (cuts: number[], last: number): number[] => [...cuts, last];
  return {
    colStart: starts(colCut, 0),
    colEnd: ends(colCut, panel.w),
    rowStart: starts(rowCut, y0),
    rowEnd: ends(rowCut, panel.h),
    colCut,
    rowCut,
    line,
  };
}

/** Rectangles of the areas, in the default Tab order (top-left cell, row by row). */
export function slotRects(grid: Grid, panel: Panel): SlotRect[] {
  const b = bounds(grid, panel);
  const found = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  grid.areas.forEach((row, y) => {
    row.forEach((name, x) => {
      const box = found.get(name);
      if (!box) found.set(name, { x0: x, y0: y, x1: x, y1: y });
      else {
        box.x1 = Math.max(box.x1, x);
        box.y1 = Math.max(box.y1, y);
      }
    });
  });
  const at = (list: number[], index: number): number => list[index] ?? 0;
  return [...found.entries()].map(([area, box]) => {
    const x = at(b.colStart, box.x0);
    const y = at(b.rowStart, box.y0);
    return {
      area,
      x,
      y,
      w: at(b.colEnd, box.x1) - x,
      h: at(b.rowEnd, box.y1) - y,
    };
  });
}

/** The black rules between different areas (thickness `L`). */
export function dividers(grid: Grid, panel: Panel): Rect[] {
  const b = bounds(grid, panel);
  const at = (list: number[], index: number): number => list[index] ?? 0;
  const out: Rect[] = [];
  const rows = grid.rows.length;
  const cols = grid.columns.length;
  // Each band extends `line` past its end so rules meet at the crossings.
  const bandY = (r: number): [number, number] => [
    at(b.rowStart, r) - (r === 0 ? 0 : b.line),
    r === rows - 1 ? at(b.rowEnd, r) : at(b.rowEnd, r) + b.line,
  ];
  const bandX = (c: number): [number, number] => [
    at(b.colStart, c) - (c === 0 ? 0 : b.line),
    c === cols - 1 ? at(b.colEnd, c) : at(b.colEnd, c) + b.line,
  ];
  for (let k = 1; k < cols; k++) {
    for (let r = 0; r < rows; r++) {
      if (grid.areas[r]?.[k - 1] === grid.areas[r]?.[k]) continue;
      const [top, bottom] = bandY(r);
      out.push({ x: at(b.colCut, k - 1), y: top, w: b.line, h: bottom - top });
    }
  }
  for (let k = 1; k < rows; k++) {
    for (let c = 0; c < cols; c++) {
      if (grid.areas[k - 1]?.[c] === grid.areas[k]?.[c]) continue;
      const [left, right] = bandX(c);
      out.push({ x: left, y: at(b.rowCut, k - 1), w: right - left, h: b.line });
    }
  }
  return out;
}
