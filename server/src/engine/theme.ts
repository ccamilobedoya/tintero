// Theme `base` (ADR-0034): sizes in physical units and the fonts per role, plus the glyph check.
import type { Panel } from "../../../contract/src/index.ts";
import type { Renderer } from "./chromium.ts";
import { mmToPx, ptToPx } from "./units.ts";

export interface ThemeFont {
  family: string;
  kind: "bitmap" | "outline";
  sizes?: number[]; // bitmap only: the sizes the font ships
  minPx?: number; // outline only: below this it is not used
}
export type FontRole = "title" | "text" | "detail";

const FALLBACK_FAMILY = "DejaVu Sans";
const MAX_BITMAP_GAP = 0.15;

/** First font of the list that can draw `px`; a bitmap font is never returned at a size it lacks. */
export function pickFont(px: number, fonts: ThemeFont[]): { family: string; px: number } {
  for (const font of fonts) {
    if (font.kind === "outline") {
      if (font.minPx === undefined || px >= font.minPx) return { family: font.family, px };
      continue;
    }
    let best: number | undefined;
    for (const size of font.sizes ?? []) {
      const gap = Math.abs(size - px);
      if (gap > MAX_BITMAP_GAP * px) continue;
      const bestGap = best === undefined ? Infinity : Math.abs(best - px);
      if (best === undefined || gap < bestGap || (gap === bestGap && size > best)) best = size;
    }
    if (best !== undefined) return { family: font.family, px: best };
  }
  return { family: FALLBACK_FAMILY, px };
}

const DEJAVU: ThemeFont = { family: "DejaVu Sans", kind: "outline" };
const BASE_FONTS: Record<FontRole, ThemeFont[]> = {
  title: [DEJAVU],
  text: [DEJAVU],
  detail: [
    { family: "Terminus", kind: "bitmap", sizes: [12, 14, 16, 18, 20, 22, 24, 28, 32] },
    DEJAVU,
  ],
};

export interface FontChoice {
  family: string;
  px: number;
}

export interface Metrics {
  margin: number;
  bar: number;
  line: number;
  titleRow: number;
  groupRow: number;
  row: number;
  issueRow: number;
  issueDescRow: number;
  moreRow: number;
  box: number;
  boxBorder: number;
  gap: number;
  font: Record<FontRole, FontChoice>;
}

const PT: Record<FontRole, number> = { title: 12, text: 9, detail: 8 };

export function themeMetrics(panel: Panel): Metrics {
  const mm = (value: number): number => mmToPx(value, panel.dpi);
  const font = (role: FontRole): FontChoice =>
    // eslint-disable-next-line security/detect-object-injection -- role is a fixed union
    pickFont(ptToPx(PT[role], panel.dpi), BASE_FONTS[role]);
  return {
    margin: mm(2),
    bar: mm(7),
    line: mm(0.5),
    titleRow: mm(5),
    groupRow: mm(4.5),
    row: mm(5),
    issueRow: mm(9),
    issueDescRow: mm(13),
    moreRow: mm(4.5),
    box: mm(3),
    boxBorder: mm(0.5),
    gap: mm(1.5),
    font: { title: font("title"), text: font("text"), detail: font("detail") },
  };
}

/** CSS declarations for a font choice (normal or bold). Families come only from the theme. */
export function fontCss(font: FontChoice, bold = false): string {
  const family =
    font.family === FALLBACK_FAMILY
      ? `'${FALLBACK_FAMILY}'`
      : `'${font.family}','${FALLBACK_FAMILY}'`;
  return `font-family:${family};font-size:${font.px}px;font-weight:${bold ? 700 : 400}`;
}

const GLYPH_PAIRS: [string, string][] = [
  ["á", "a"],
  ["é", "e"],
  ["í", "ı"],
  ["ó", "o"],
  ["ú", "u"],
  ["ü", "u"],
  ["ñ", "n"],
  ["Á", "A"],
  ["É", "E"],
  ["Í", "I"],
  ["Ó", "O"],
  ["Ú", "U"],
  ["Ñ", "N"],
];

export interface GlyphProblem {
  role: FontRole;
  bold: boolean;
  px: number;
  glyph: string;
  problem: "blank" | "same";
}

const CELL = 64;

/** Draws each accented letter and its plain one; reports the accented ones blank or equal to it. */
export async function checkThemeGlyphs(renderer: Renderer, panel: Panel): Promise<GlyphProblem[]> {
  const metrics = themeMetrics(panel);
  const problems: GlyphProblem[] = [];
  // One page per role and weight: row `i` holds the plain letter (left) and the accented one.
  const probe: Panel = { w: CELL * 2, h: CELL * GLYPH_PAIRS.length, dpi: panel.dpi, depth: 1 };
  const stride = (CELL * 2) / 8;
  const cell = (raw1: Uint8Array, row: number, col: number): Uint8Array => {
    const out = new Uint8Array((CELL / 8) * CELL);
    for (let y = 0; y < CELL; y++) {
      const from = (row * CELL + y) * stride + col * (CELL / 8);
      out.set(raw1.subarray(from, from + CELL / 8), y * (CELL / 8));
    }
    return out;
  };
  for (const role of ["title", "text", "detail"] as const) {
    // eslint-disable-next-line security/detect-object-injection -- role is a fixed union
    const font = metrics.font[role];
    for (const bold of [false, true]) {
      const cells = GLYPH_PAIRS.map(([accented, plain], row) =>
        [plain, accented]
          .map(
            (glyph, col) =>
              `<p style="left:${col * CELL + 8}px;top:${row * CELL + 8}px">${glyph}</p>`,
          )
          .join(""),
      ).join("");
      const page =
        `<!doctype html><meta charset="utf-8"><style>*{margin:0}body{background:#fff;color:#000}` +
        `p{position:absolute;line-height:${CELL - 16}px;${fontCss(font, bold)}}</style>${cells}`;
      const { raw1 } = await renderer.render(page, probe);
      GLYPH_PAIRS.forEach(([accented], row) => {
        const a = cell(raw1, row, 1);
        const p = cell(raw1, row, 0);
        if (a.every((byte) => byte === 0)) {
          problems.push({ role, bold, px: font.px, glyph: accented, problem: "blank" });
        } else if (a.every((byte, i) => byte === p.at(i))) {
          problems.push({ role, bold, px: font.px, glyph: accented, problem: "same" });
        }
      });
    }
  }
  return problems;
}
