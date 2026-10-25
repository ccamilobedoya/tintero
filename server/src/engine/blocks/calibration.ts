// `calibration` (F-008, ADR-0049): a fixed test card to judge strokes and letters on the real
// panel with the fast refresh. No source, no zones. Strokes are in pixels on purpose.
import { html, type Raw } from "../html.ts";
import { fontCss, pickFont, type FontChoice, type ThemeFont } from "../theme.ts";
import { mmToPx, ptToPx } from "../units.ts";
import type { Block, BlockContext } from "./types.ts";

const SAMPLE = "Ñandú pingüino ÁÉÍÓÚ 0123 22 oct";
const TERMINUS: ThemeFont = {
  family: "Terminus",
  kind: "bitmap",
  sizes: [12, 14, 16, 18, 20, 22, 24, 28, 32],
};
const DEJAVU: ThemeFont = { family: "DejaVu Sans", kind: "outline" };

interface Line {
  name: string;
  font: FontChoice;
  bold: boolean;
  strike: boolean;
}

const rect = (x: number, y: number, w: number, h: number, extra = "background:#000"): Raw =>
  html`<div class="a" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}"></div>`;

/** The pixels the device inverts for the focus ring, drawn black on white (the ring rule). */
function ring(x: number, y: number, w: number, h: number, thickness: number, dash: number): Raw {
  if (dash <= 0) {
    return rect(x, y, w, h, `border:${thickness}px solid #000`);
  }
  const parts: Raw[] = [];
  for (let at = 0; at < w; at += 2 * dash) {
    const len = Math.min(dash, w - at);
    parts.push(rect(x + at, y, len, thickness), rect(x + at, y + h - thickness, len, thickness));
  }
  // Sides: runs of `dash` counted from the top of the zone, between the top and bottom strips.
  for (let at = 0; at < h - thickness; at += 2 * dash) {
    const from = Math.max(at, thickness);
    const to = Math.min(at + dash, h - thickness);
    if (to <= from) continue;
    parts.push(
      rect(x, y + from, thickness, to - from),
      rect(x + w - thickness, y + from, thickness, to - from),
    );
  }
  return html`${parts}`;
}

export const calibration: Block = (context: BlockContext) => {
  const { metrics, panel } = context;
  const mm = (value: number): number => mmToPx(value, panel.dpi);
  const x0 = metrics.focusPad;
  const parts: Raw[] = [];

  // 1. Horizontal strokes of 1, 2 and 3 px.
  [
    [1, 0],
    [2, mm(3)],
    [3, mm(6)],
  ].forEach(([thickness = 1, at = 0]) => {
    parts.push(rect(x0, at, mm(40), thickness));
  });
  // 2. Vertical strokes of 1, 2 and 3 px.
  [
    [1, 45],
    [2, 48],
    [3, 51],
  ].forEach(([thickness = 1, at = 0]) => {
    parts.push(rect(x0 + mm(at), 0, thickness, mm(10)));
  });

  // 3. The same text in each font, weight and size.
  const dejavu = (pt: number): FontChoice => ({ family: "DejaVu Sans", px: ptToPx(pt, panel.dpi) });
  const terminus = (px: number): FontChoice => pickFont(px, [TERMINUS, DEJAVU]);
  const lines: Line[] = [
    { name: "Terminus 14 normal", font: terminus(14), bold: false, strike: false },
    { name: "Terminus 14 negrita", font: terminus(14), bold: true, strike: false },
    { name: "Terminus 16 normal", font: terminus(16), bold: false, strike: false },
    { name: "Terminus 16 negrita", font: terminus(16), bold: true, strike: false },
    { name: "DejaVu Sans 9 pt", font: dejavu(9), bold: false, strike: false },
    { name: "DejaVu Sans 12 pt", font: dejavu(12), bold: false, strike: false },
    { name: "DejaVu Sans 9 pt tachado", font: dejavu(9), bold: false, strike: true },
  ];
  const lineH = mm(6);
  const textW = Math.max(1, context.w - 2 * x0);
  lines.forEach((line, i) => {
    const deco = line.strike
      ? `text-decoration:line-through;text-decoration-thickness:${metrics.line}px;`
      : "";
    parts.push(
      html`<div
        class="a t"
        style="left:${x0}px;top:${mm(12) + lineH * i}px;width:${textW}px;height:${lineH}px;line-height:${lineH}px;${deco}${fontCss(line.font, line.bold)}"
      >
        ${`${line.name}: ${SAMPLE}`}
      </div>`,
    );
  });

  // 4. Checkboxes, the overdue label and the focus rings.
  const top = mm(12) + lineH * lines.length + mm(2);
  const box = metrics.box;
  const boxTop = top + Math.floor((metrics.row - box) / 2);
  const boxStyle = (fill: string): string =>
    `width:${box}px;height:${box}px;border:${metrics.boxBorder}px solid #000;background:${fill}`;
  parts.push(
    html`<div class="a" style="left:${x0}px;top:${boxTop}px;${boxStyle("#fff")}"></div>`,
    html`<div class="a" style="left:${x0 + mm(6)}px;top:${boxTop}px;${boxStyle("#fff")}">
      <span
        class="a"
        style="left:${-metrics.boxBorder}px;top:${-metrics.boxBorder}px;width:${Math.floor(box / 2)}px;height:${box}px;background:#000"
      ></span>
    </div>`,
    html`<div class="a" style="left:${x0 + mm(12)}px;top:${boxTop}px;${boxStyle("#000")}"></div>`,
  );
  const labelH = metrics.row - 2 * metrics.focusPad - 4;
  parts.push(
    html`<div
      class="a"
      style="left:${x0 + mm(20)}px;top:${top + Math.floor((metrics.row - labelH) / 2)}px;height:${labelH}px;line-height:${labelH}px;padding:0 3px;background:#000;color:#fff;white-space:nowrap;${fontCss(metrics.font.detail, true)}"
    >
      22 oct
    </div>`,
  );
  const ringsTop = top + metrics.row + mm(2);
  const ringW = mm(30);
  const ringH = mm(8);
  const sample = (x: number, dash: number, text: string): Raw =>
    html`${ring(x, ringsTop, ringW, ringH, metrics.focusRing, dash)}
      <div
        class="a t"
        style="left:${x + metrics.focusPad}px;top:${ringsTop + metrics.focusPad}px;width:${ringW - 2 * metrics.focusPad}px;height:${ringH - 2 * metrics.focusPad}px;line-height:${ringH - 2 * metrics.focusPad}px;${fontCss(metrics.font.text)}"
      >
        ${text}
      </div>`;
  parts.push(sample(x0, metrics.focusDash, "Foco"), sample(x0 + ringW + mm(4), 0, "Enviando"));

  return {
    html: html`<div
      class="a"
      data-fit="${context.area}"
      style="left:0;top:0;width:${context.w}px;height:${context.h}px;overflow:hidden"
    >
      ${parts}
    </div>`,
    hidden: 0,
    tooSmall: false,
  };
};
