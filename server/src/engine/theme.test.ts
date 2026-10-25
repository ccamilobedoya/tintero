import { describe, expect, it } from "vitest";
import type { Panel } from "../../../contract/src/index.ts";
import type { Renderer } from "./chromium.ts";
import { checkThemeGlyphs, fontCss, pickFont, themeMetrics, type ThemeFont } from "./theme.ts";

const P124: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const P200: Panel = { w: 800, h: 480, dpi: 200, depth: 1 };

describe("pickFont", () => {
  const bitmapFirst: ThemeFont[] = [
    { family: "B", kind: "bitmap", sizes: [12, 14, 17, 20, 24] },
    { family: "O", kind: "outline" },
  ];
  it("uses the closest size within 15 %, ties to the larger", () => {
    expect(pickFont(16, bitmapFirst)).toEqual({ family: "B", px: 17 });
    expect(pickFont(25, bitmapFirst)).toEqual({ family: "B", px: 24 });
    expect(pickFont(15, bitmapFirst)).toEqual({ family: "B", px: 14 });
    expect(pickFont(13, bitmapFirst)).toEqual({ family: "B", px: 14 });
  });
  it("falls to the next font when no size is close enough", () => {
    expect(pickFont(30, bitmapFirst)).toEqual({ family: "O", px: 30 });
    expect(pickFont(10, bitmapFirst)).toEqual({ family: "O", px: 10 });
  });
  it("respects minPx and ends in DejaVu Sans", () => {
    const fonts: ThemeFont[] = [
      { family: "M", kind: "outline", minPx: 14 },
      { family: "B", kind: "bitmap", sizes: [12, 14] },
    ];
    expect(pickFont(15, fonts)).toEqual({ family: "M", px: 15 });
    expect(pickFont(12, fonts)).toEqual({ family: "B", px: 12 });
    expect(pickFont(9, fonts)).toEqual({ family: "DejaVu Sans", px: 9 });
  });
});

describe("themeMetrics", () => {
  it("matches the table at 124 and 200 dpi", () => {
    const a = themeMetrics(P124);
    expect([a.margin, a.bar, a.line, a.titleRow, a.groupRow, a.row]).toEqual([
      10, 34, 2, 24, 22, 30,
    ]);
    expect([a.focusRing, a.focusDash, a.focusPad, a.focusGap]).toEqual([3, 8, 6, 3]);
    expect([a.issueRow, a.issueDescRow, a.moreRow, a.box, a.boxBorder]).toEqual([
      44, 63, 22, 15, 2,
    ]);
    expect(a.font.title).toEqual({ family: "DejaVu Sans", px: 21 });
    expect(a.font.text).toEqual({ family: "DejaVu Sans", px: 16 });
    expect(a.font.detail).toEqual({ family: "Terminus", px: 14 });
    const b = themeMetrics(P200);
    expect([b.margin, b.bar, b.line, b.row, b.issueRow, b.issueDescRow, b.box]).toEqual([
      16, 55, 4, 49, 71, 102, 24,
    ]);
    expect([b.focusRing, b.focusDash, b.focusPad, b.focusGap]).toEqual([5, 8, 9, 5]);
    expect(b.font.title.px).toBe(33);
    expect(b.font.detail).toEqual({ family: "Terminus", px: 22 });
  });

  it("writes font css with a DejaVu fallback", () => {
    expect(fontCss({ family: "Terminus", px: 14 }, true)).toContain("'Terminus','DejaVu Sans'");
    expect(fontCss({ family: "DejaVu Sans", px: 16 })).toBe(
      "font-family:'DejaVu Sans';font-size:16px;font-weight:400",
    );
  });
});

describe("checkThemeGlyphs", () => {
  // One page per role and weight: each `<p>` is a cell (row = pair, column 0 plain, 1 accented).
  // `ink` says what a glyph draws: 0 = blank, any other number = a distinct shape.
  const renderer = (ink: (glyph: string) => number): Renderer => ({
    render: (html, panel) => {
      const raw1 = new Uint8Array((panel.w / 8) * panel.h);
      [...html.matchAll(/<p style="left:(\d+)px;top:(\d+)px">(.)<\/p>/gu)].forEach((match) => {
        const x = Number(match[1]) - 8;
        const y = Number(match[2]) - 8;
        raw1[(y + 30) * (panel.w / 8) + x / 8] = ink(match[3] ?? "");
      });
      return Promise.resolve({ raw1, gray: 0, boxes: [], overflow: [] });
    },
    blockedRequests: () => 0,
    close: () => Promise.resolve(),
  });

  it("reports nothing when each accented letter differs from its plain one", () => {
    const ok = renderer((glyph) => glyph.codePointAt(0) ?? 1);
    return expect(checkThemeGlyphs(ok, P124)).resolves.toEqual([]);
  });

  it("reports blank and equal accented letters", async () => {
    const blank = await checkThemeGlyphs(
      renderer(() => 0),
      P124,
    );
    expect(blank).toHaveLength(3 * 2 * 13);
    expect(blank[0]).toMatchObject({ problem: "blank", role: "title", bold: false, px: 21 });
    const same = await checkThemeGlyphs(
      renderer(() => 7),
      P124,
    );
    expect(same[0]).toMatchObject({ problem: "same", glyph: "á" });
    const onlyN = await checkThemeGlyphs(
      renderer((glyph) => (glyph === "ñ" ? 0 : (glyph.codePointAt(0) ?? 1))),
      P200,
    );
    expect(onlyN).toHaveLength(6);
    expect(onlyN.every((p) => p.glyph === "ñ" && p.problem === "blank")).toBe(true);
    expect(onlyN.map((p) => p.px)).toContain(22);
  });

  it("draws at the panel size with low priority, in pages that fit the panel", async () => {
    const sizes: { size: number[]; priority: string | undefined }[] = [];
    const spy: Renderer = {
      render: (_html, panel, options) => {
        sizes.push({ size: [panel.w, panel.h], priority: options?.priority });
        return Promise.resolve({
          raw1: new Uint8Array((panel.w / 8) * panel.h),
          gray: 0,
          boxes: [],
          overflow: [],
        });
      },
      blockedRequests: () => 0,
      close: () => Promise.resolve(),
    };
    await checkThemeGlyphs(spy, P124);
    expect(sizes).toHaveLength(6); // 13 pairs fit in one 800 x 480 page
    expect(sizes.every((c) => c.size[0] === 800 && c.size[1] === 480 && c.priority === "low")).toBe(
      true,
    );
    sizes.length = 0;
    await checkThemeGlyphs(spy, { w: 128, h: 128, dpi: 124, depth: 1 });
    expect(sizes.length).toBeGreaterThan(6); // a small panel needs several pages
  });
});
