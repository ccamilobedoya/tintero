/* eslint-disable security/detect-non-literal-fs-filename -- reads the examples of the repo */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDataFile, parseViewsConfig } from "../config.ts";
import { buildView } from "../view.ts";

const REPO = resolve(import.meta.dirname, "../../../..");
const read = (name: string): string => readFileSync(resolve(REPO, "config", name), "utf8");
const P124 = { w: 800, h: 480, dpi: 124, depth: 1 } as const;
const HOLIDAYS = new Map([
  ["2026-11-02", "Dia de los Santos"],
  ["2026-11-16", "Independencia de Cartagena"],
]);

function build(
  at: string,
  options: { holidays: boolean; icons?: boolean; layout?: "days" | "column" },
) {
  const config = parseViewsConfig(read("agenda.views.example.json"));
  const data = parseDataFile(read("agenda.data.example.json"), config);
  const def = config.views[0];
  if (!def) throw new Error("no view");
  const slot = def.slots.eventos;
  if (!slot) throw new Error("no slot");
  slot.options = {
    days: 7,
    holidays: options.holidays,
    ...(options.layout === undefined ? {} : { layout: options.layout }),
  };
  const source = data.sources.calendario;
  if (source?.type === "events" && options.icons === false) {
    for (const item of source.items) delete item.icon;
  }
  return buildView(def, {
    panel: P124,
    config,
    sources: data.sources,
    at: new Date(at),
    holidays: HOLIDAYS,
  });
}

const svgs = (html: string): number => html.split("<svg ").length - 1;

describe("agenda: pictograms (F-014)", () => {
  it("draws one 16 px pictogram per row with an icon, in a column of text + 6 px", () => {
    const built = build("2026-10-27T13:00:00Z", { holidays: false });
    expect(built.zones).toHaveLength(8);
    expect(svgs(built.html)).toBe(8);
    expect(built.html).toContain('width="16" height="16" viewBox="0 0 16 16"');
    expect(built.html).toContain("grid-template-columns:22px max-content minmax(0,1fr)");
    // 30 px row, 6 px band: the pictogram starts 1 px under the band.
    expect(built.html).toContain("padding-top:1px");
  });

  it("is the old block, byte for byte, when no row has a pictogram", () => {
    const built = build("2026-10-27T13:00:00Z", { holidays: false, icons: false });
    expect(svgs(built.html)).toBe(0);
    expect(built.html).toContain("grid-template-columns:max-content minmax(0,1fr)");
    expect(built.html).not.toContain("22px max-content");
  });

  it("puts the holiday first in its day, with a star and no zone", () => {
    const on = build("2026-11-01T13:00:00Z", { holidays: true });
    expect(on.zones).toHaveLength(2);
    expect(on.html).toContain("Dia de los Santos");
    expect(svgs(on.html)).toBe(3); // two events and the star
    const star = on.html.indexOf("Dia de los Santos");
    expect(on.html.indexOf("Almuerzo familiar")).toBeGreaterThan(star);
    const off = build("2026-11-01T13:00:00Z", { holidays: false });
    expect(off.zones).toHaveLength(2);
    expect(off.html).not.toContain("Dia de los Santos");
    expect(svgs(off.html)).toBe(2);
  });
});

describe("agenda: layout column (F-015)", () => {
  it("writes the day only on the first row of each day and has no day rows", () => {
    const built = build("2026-10-26T13:00:00Z", { holidays: false, layout: "column" });
    expect(built.html).toContain("Hoy");
    expect(built.html).toContain("Mañana");
    expect(built.html.split(">Hoy<").length - 1).toBe(1);
    expect(built.html).not.toContain("LUN 26 OCT");
    expect(built.html).toContain(
      "grid-template-columns:max-content 22px max-content minmax(0,1fr)",
    );
  });

  it("keeps the day rows with layout days or none", () => {
    const days = build("2026-10-26T13:00:00Z", { holidays: false, layout: "days" });
    const none = build("2026-10-26T13:00:00Z", { holidays: false });
    expect(days.html).toContain("LUN 26 OCT");
    expect(none.html).toBe(days.html);
  });
});
