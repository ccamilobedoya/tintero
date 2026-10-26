import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Panel } from "../../../../contract/src/index.ts";
import {
  ConfigError,
  loadDataFile,
  loadViewsConfig,
  parseViewsConfig,
  type ViewDef,
} from "../config.ts";
import { buildDetailView, buildView } from "../view.ts";
import { fill, isLocale, messages, type Messages } from "./index.ts";

const REPO = resolve(import.meta.dirname, "../../../..");
const AT = new Date("2026-10-26T13:00:00Z");
const P124: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const HOLIDAYS = new Map([["2026-11-02", "Todos los Santos"]]);

const strings = (value: unknown): string[] =>
  typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(strings) : [];

describe("catalogs", () => {
  it("es and en have exactly the same keys, and every value is non-empty", () => {
    const es = messages("es");
    const en = messages("en");
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    for (const catalog of [es, en]) {
      for (const value of Object.values(catalog)) {
        expect(strings(value).every((text) => text !== "")).toBe(true);
      }
      expect(catalog.weekdays).toHaveLength(7);
      expect(catalog.weekdayLetters).toHaveLength(7);
      expect(catalog.months).toHaveLength(12);
      expect(catalog.monthsLong).toHaveLength(12);
    }
  });

  it("en has the values R10b asks for", () => {
    const en = messages("en");
    expect(en.weekdays).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
    expect(en.weekdayLetters.join(" ")).toBe("M T W T F S S");
    expect(messages("es").weekdayLetters.join(" ")).toBe("L M M J V S D");
    expect(en.months.join(" ")).toBe("jan feb mar apr may jun jul aug sep oct nov dec");
    expect(en.monthsLong[0]).toBe("JANUARY");
    expect(en.monthsLong[11]).toBe("DECEMBER");
    expect([en.today, en.tomorrow]).toEqual(["Today", "Tomorrow"]);
    expect(fill(en.staleToday, { time: "09:05" })).toBe("no data since 09:05");
    expect(fill(en.staleOther, { date: "24/10", time: "09:05" })).toBe("no data since 24/10 09:05");
    expect(en.holidayToday).toBe("HOLIDAY TODAY");
    expect(fill(en.holidayOn, { date: "MON 2 NOV" })).toBe("HOLIDAY MON 2 NOV");
    expect([en.allDay, en.allDaySuffix, en.noCategory]).toEqual([
      "All day",
      " · all day",
      "No category",
    ]);
    expect([en.stageDoing, en.stageTodo, en.stageDone]).toEqual([
      "IN PROGRESS",
      "TO DO",
      "DONE TODAY",
    ]);
    expect([en.emptyDoing, en.emptyTodo, en.emptyDone]).toEqual([
      "Nothing in progress.",
      "Nothing to do.",
      "Nothing done today.",
    ]);
    expect(fill(en.more, { n: 3 })).toBe("+3 more");
  });

  it("es keeps today's texts", () => {
    const es = messages("es");
    expect(fill(es.more, { n: 2 })).toBe("+2 más");
    expect(fill(es.staleToday, { time: "11:50" })).toBe("sin datos desde 11:50");
    expect([es.today, es.tomorrow, es.noFit]).toEqual(["Hoy", "Mañana", "No cabe"]);
  });

  it("fill leaves unknown placeholders alone", () => {
    expect(fill("a {x} {y}", { x: 1 })).toBe("a 1 {y}");
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("en")).toBe(true);
  });
});

describe("locale in the views file", () => {
  const base = (extra: string): string =>
    `{"version":1,"timezone":"America/Lima"${extra},"theme":"base","devices":{"*":{"views":["v"]}},` +
    `"views":[{"id":"v","title":"V","grid":{"columns":[100],"rows":[100],"areas":[["a"]]},"slots":{"a":{"block":"calibration"}}}]}`;

  it("defaults to es and accepts es and en", () => {
    expect(parseViewsConfig(base("")).locale).toBe("es");
    expect(parseViewsConfig(base(',"locale":"es"')).locale).toBe("es");
    expect(parseViewsConfig(base(',"locale":"en"')).locale).toBe("en");
  });

  it("rejects an unknown locale with the /locale pointer", () => {
    for (const bad of ['"fr"', "1", "null"]) {
      expect(() => parseViewsConfig(base(`,"locale":${bad}`))).toThrow(ConfigError);
      expect(() => parseViewsConfig(base(`,"locale":${bad}`))).toThrow(/\/locale/);
    }
  });
});

describe("hoy in English (A3)", () => {
  const config = loadViewsConfig(join(REPO, "config/hoy.views.example.en.json"));
  const data = loadDataFile(join(REPO, "config/hoy.data.example.en.json"), config);
  const view = (id: string): ViewDef => {
    const found = config.views.find((v) => v.id === id);
    if (!found) throw new Error(`no view ${id}`);
    return found;
  };
  const input = { panel: P124, config, sources: data.sources, at: AT, holidays: HOLIDAYS };

  it("validates and has locale en", () => {
    expect(config.locale).toBe("en");
  });

  it("draws `hoy` with the English catalog and no Spanish fixed texts", () => {
    const built = buildView(view("hoy"), input);
    expect(built.html).toContain("OCTOBER 2026");
    expect(built.html).toContain("HOLIDAY MON 2 NOV");
    expect(built.html).toContain("Today");
    expect(built.html).toContain("IN PROGRESS");
    for (const text of ["Hoy", "Mañana", "FESTIVO", "sin datos desde", "más", "OCTUBRE"]) {
      expect(built.html).not.toContain(text);
    }
    for (const text of ["POR HACER", "HECHO HOY", "Todo el día"]) {
      expect(built.html).not.toContain(text);
    }
  });

  it("draws `tablero` and the detail view in English", () => {
    const board = buildView(view("tablero"), input);
    expect(board.html).toContain("TO DO");
    expect(board.html).toContain("DONE TODAY");
    expect(board.html).not.toContain("POR HACER");
    const detail = buildDetailView({ ...input, sourceId: "calendario", itemId: "a5" });
    expect(detail.html).toContain("Detail");
    expect(detail.html).toContain(" · all day");
    expect(detail.html).not.toContain("Detalle");
    const missing = buildDetailView({ ...input, sourceId: "nope", itemId: "x" });
    expect(missing.html).toContain("Not available");
  });

  it("is the Spanish text when the same views say es", () => {
    const es = { ...config, locale: "es" as const };
    const built = buildView(view("hoy"), { ...input, config: es });
    expect(built.html).toContain("OCTUBRE 2026");
    expect(built.html).toContain("FESTIVO LUN 2 NOV");
    expect(built.html).toContain("Hoy");
  });
});

describe("Messages type", () => {
  it("is what `messages` returns", () => {
    const catalog: Messages = messages("en");
    expect(catalog.detail).toBe("Detail");
  });
});
