// F-015: `dayLabel` and the `layout` option of `agenda`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, parseViewsConfig } from "./config.ts";
import { dayLabel } from "./dates.ts";

const REPO = resolve(import.meta.dirname, "../../..");
interface Example {
  views: { slots: Record<string, { options?: Record<string, unknown> }> }[];
}
const example = (): Example =>
  JSON.parse(readFileSync(resolve(REPO, "config/hoy.views.example.json"), "utf8")) as Example;

const errorOf = (text: string): string => {
  try {
    parseViewsConfig(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  return "";
};

describe("dayLabel", () => {
  const today = { y: 2026, m: 10, d: 26 };
  it("names today, tomorrow and the rest by weekday", () => {
    expect(dayLabel(today, today)).toBe("Hoy");
    expect(dayLabel({ y: 2026, m: 10, d: 27 }, today)).toBe("Mañana");
    expect(dayLabel({ y: 2026, m: 10, d: 28 }, today)).toBe("Mié 28");
    expect(dayLabel({ y: 2026, m: 11, d: 1 }, today)).toBe("Dom 1");
    expect(dayLabel({ y: 2026, m: 10, d: 25 }, today)).toBe("Dom 25");
  });
  it("crosses the end of the year", () => {
    expect(dayLabel({ y: 2027, m: 1, d: 1 }, { y: 2026, m: 12, d: 31 })).toBe("Mañana");
  });
});

describe("agenda `layout` option", () => {
  it("loads the example of `hoy`", () => {
    const config = parseViewsConfig(JSON.stringify(example()));
    expect(config.views[0]?.slots.proximos?.options.layout).toBe("column");
  });

  it("rejects an unknown value in `agenda` and the option in another block", () => {
    const bad = example();
    const slots = bad.views[0]?.slots ?? {};
    const proximos = slots.proximos;
    if (proximos) proximos.options = { days: 7, layout: "lista" };
    expect(errorOf(JSON.stringify(bad))).toContain("/views/0/slots/proximos/options/layout");

    const other = example();
    const tareas = other.views[0]?.slots.tareas;
    if (tareas) tareas.options = { ...tareas.options, layout: "column" };
    expect(errorOf(JSON.stringify(other))).toContain("/views/0/slots/tareas/options/layout");
  });
});
