/* eslint-disable security/detect-non-literal-fs-filename -- reads the examples of the repo */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDataFile, parseViewsConfig, type DataFile, type ViewsConfig } from "../config.ts";
import { buildView } from "../view.ts";

const REPO = resolve(import.meta.dirname, "../../../..");
const read = (name: string): string => readFileSync(resolve(REPO, "config", name), "utf8");
const config: ViewsConfig = parseViewsConfig(read("tablero.views.example.json"));
const data: DataFile = parseDataFile(read("calendario.data.example.json"), config);
const P124 = { w: 800, h: 480, dpi: 124, depth: 1 } as const;
const V124 = { w: 480, h: 800, dpi: 124, depth: 1 } as const;

const HOLIDAYS = new Map([
  ["2026-10-12", "Día de la Raza"],
  ["2026-11-02", "Dia de los Santos"],
]);

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  style: string;
  text: string;
}

/** Absolute boxes of the month calendar (`mes` area) read from the generated page. */
function boxes(options: {
  panel: typeof P124 | typeof V124;
  at: string;
  holidays?: ReadonlyMap<string, string>;
  view?: ViewsConfig;
}): { boxes: Box[]; hidden: number; html: string } {
  const view = options.view ?? config;
  const def = view.views.find((candidate) => candidate.id === "hoy");
  if (!def) throw new Error("no view");
  const built = buildView(def, {
    panel: options.panel,
    config: view,
    sources: data.sources,
    at: new Date(options.at),
    holidays: options.holidays ?? HOLIDAYS,
  });
  const html = built.html;
  const start = html.indexOf('data-fit="mes"');
  const outer = html.lastIndexOf("<div", html.lastIndexOf("<div", start) - 1);
  const px = (text: string, name: string): number => {
    const found = text.split(";").find((part) => part.startsWith(`${name}:`));
    return Number.parseInt(found?.slice(name.length + 1) ?? "0", 10);
  };
  const rectStyle = /style="([^"]*)"/.exec(html.slice(outer))?.[1] ?? "";
  const fitStyle = /style="([^"]*)"/.exec(html.slice(start))?.[1] ?? "";
  // The page is minified by the template only partly: the calendar ends with the area closing.
  const ox = px(rectStyle, "left") + px(fitStyle, "left");
  const oy = px(rectStyle, "top") + px(fitStyle, "top");
  const end = html.indexOf("</div>\n        </div>\n      </div>", start);
  const part = html.slice(start, end < 0 ? undefined : end);
  const found: Box[] = [];
  for (const match of part.matchAll(/<div[^>]*style="([^"]*)"[^>]*>([^<]*)/g)) {
    const style = match[1] ?? "";
    found.push({
      x: ox + px(style, "left"),
      y: oy + px(style, "top"),
      w: px(style, "width"),
      h: px(style, "height"),
      style,
      text: (match[2] ?? "").trim(),
    });
  }
  return { boxes: found, hidden: built.hidden.mes ?? -1, html };
}

const number = (list: Box[], day: number): Box | undefined =>
  list.find((box) => box.text === String(day) && box.style.includes("line-height"));
const rules = (list: Box[]): Box[] =>
  list.filter((box) => box.h === 2 && box.w === 16 && box.text === "");

describe("month-calendar: marks (F-013)", () => {
  const { boxes: list, hidden } = boxes({ panel: P124, at: "2026-10-25T20:00:00Z" });

  it("draws today inverted in a box of 32 x 24 and does not hide anything", () => {
    const today = number(list, 25);
    expect(today).toMatchObject({ x: 748, y: 402, w: 32, h: 24 });
    expect(today?.style).toContain("background:#000;color:#fff");
    expect(hidden).toBe(0);
  });

  it("puts a 2 px rule of the text width under every day an event covers", () => {
    const six = rules(list).find((box) => box.x === 561);
    expect(six).toMatchObject({ x: 561, y: 358, w: 16, h: 2 });
    const trip = rules(list)
      .filter((box) => box.y >= 461)
      .map((box) => box.x);
    // The bars cover x 639-654 (29), 678-693 (30) and 717-732 (31), not the 28.
    // (561 is the 27, in the same row.)
    expect(trip).toEqual([561, 639, 678, 717]);
    // Today (25) has no event: 6, 14, 21, 27, 29, 30 and 31.
    expect(rules(list)).toHaveLength(7);
  });

  it("uses bold for Sundays and holidays only", () => {
    const bold = (day: number): boolean =>
      number(list, day)?.style.includes("font-weight:700") ?? false;
    for (const day of [4, 11, 18, 25, 12]) expect(bold(day)).toBe(true);
    for (const day of [13, 19, 26]) expect(number(list, day)?.style).toContain("font-weight:400");
  });

  it("shows the next holiday at the right of the month title", () => {
    const html = boxes({ panel: P124, at: "2026-10-25T20:00:00Z" }).html;
    expect(html).toContain("FESTIVO LUN 2 NOV");
    expect(html).toContain("justify-content:space-between");
    expect(boxes({ panel: P124, at: "2026-11-02T13:00:00Z" }).html).toContain("HOY FESTIVO");
    expect(
      boxes({ panel: P124, at: "2026-10-25T20:00:00Z", holidays: new Map() }).html,
    ).not.toContain("FESTIVO");
  });

  it("draws the holiday label in plain weight, the month stays bold (F-017)", () => {
    const html = boxes({ panel: P124, at: "2026-10-25T20:00:00Z" }).html;
    expect(html).toMatch(/font-weight:400;letter-spacing:0">FESTIVO LUN 2 NOV</);
    expect(html).toMatch(/letter-spacing:1px;[^"]*font-weight:700/);
    expect(html).toContain("OCTUBRE 2026");
  });

  it("makes the box lower in a month of six weeks and keeps the rule inside the row", () => {
    const six = boxes({ panel: P124, at: "2026-11-02T13:00:00Z" }).boxes;
    expect(number(six, 2)).toMatchObject({ x: 514, y: 324, w: 32, h: 22 });
    expect(rules(six).find((box) => box.x === 522)).toMatchObject({ y: 348, w: 16, h: 2 });
  });

  it("draws a 5 x 5 dot at the side when the rule does not fit (portrait)", () => {
    const portrait = boxes({ panel: V124, at: "2026-11-02T13:00:00Z" });
    expect(number(portrait.boxes, 2)).toMatchObject({ x: 32, y: 687, w: 32, h: 20 });
    expect(rules(portrait.boxes)).toHaveLength(0);
    const dots = portrait.boxes.filter((box) => box.w === 5 && box.h === 5);
    expect(dots.find((box) => box.x === 66)).toMatchObject({ x: 66, y: 694 });
    expect(dots.find((box) => box.x === 258)).toMatchObject({ y: 694 });
    expect(portrait.hidden).toBe(0);
  });
});

describe("month-calendar: no room (F-013)", () => {
  it("counts a hidden mark for every day with events and draws none", () => {
    const mini: ViewsConfig = {
      ...config,
      views: [
        {
          id: "hoy",
          title: "Hoy",
          grid: {
            columns: [37, 63],
            rows: [42, 58],
            areas: [
              ["mes", "otro"],
              ["abajo", "otro"],
            ],
          },
          slots: {
            mes: { block: "month-calendar", source: "calendario", options: {} },
            otro: { block: "task-board", source: "tablero", options: {} },
            abajo: { block: "task-board", source: "tablero", options: { stages: ["done"] } },
          },
        },
      ],
    };
    const result = boxes({ panel: P124, at: "2026-10-25T20:00:00Z", view: mini });
    expect(result.hidden).toBe(7);
    expect(rules(result.boxes)).toHaveLength(0);
    expect(result.boxes.filter((box) => box.w === 5 && box.h === 5)).toHaveLength(0);
  });
});
