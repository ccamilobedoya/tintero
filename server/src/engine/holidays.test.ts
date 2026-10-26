import { describe, expect, it } from "vitest";
import { dayKey, eventDays } from "./dates.ts";
import { applyCorrections, holidayLabel, nextHoliday, type Holiday } from "./holidays.ts";

const DATES: [string, string][] = [
  ["2026-01-01", "Año Nuevo"],
  ["2026-01-12", "Día de los Reyes Magos"],
  ["2026-03-23", "Día de San José"],
  ["2026-04-02", "Jueves Santo"],
  ["2026-04-03", "Viernes Santo"],
  ["2026-05-01", "Primero de Mayo"],
  ["2026-05-18", "Ascensión del señor"],
  ["2026-06-08", "Corpus Christi"],
  ["2026-06-15", "Sagrado Corazón"],
  ["2026-06-29", "San Pedro y San Pablo"],
  ["2026-07-13", "Día de la Virgen de Chiquinquirá"],
  ["2026-07-20", "Declaracion de la Independencia de Colombia"],
  ["2026-08-07", "Batalla de Boyacá"],
  ["2026-08-17", "La Asunción"],
  ["2026-10-12", "Día de la Raza"],
  ["2026-11-02", "Dia de los Santos"],
  ["2026-11-16", "Independencia de Cartagena"],
  ["2026-12-08", "La Inmaculada Concepción"],
  ["2026-12-25", "Navidad"],
];
const CO: Holiday[] = DATES.map(([date, name]) => ({ date, name }));
const day = (y: number, m: number, d: number) => ({ y, m, d });

describe("applyCorrections", () => {
  it("adds, renames and removes, sorted and without repeated dates", () => {
    const out = applyCorrections(
      CO,
      [
        { date: "2026-12-24", name: "Nochebuena" },
        { date: "2026-12-25", name: "Navidad en casa" },
      ],
      ["2026-01-12"],
    );
    expect(out).toHaveLength(19);
    expect(out.map((item) => item.date)).toEqual([...out.map((item) => item.date)].sort());
    expect(out.some((item) => item.date === "2026-01-12")).toBe(false);
    expect(out.find((item) => item.date === "2026-12-24")?.name).toBe("Nochebuena");
    expect(out.find((item) => item.date === "2026-12-25")?.name).toBe("Navidad en casa");
  });

  it("remove also takes out what came in add", () => {
    const out = applyCorrections([], [{ date: "2026-12-24", name: "x" }], ["2026-12-24"]);
    expect(out).toEqual([]);
  });
});

describe("holidayLabel / nextHoliday", () => {
  it("names the next holiday, today, or nothing", () => {
    expect(holidayLabel(CO, day(2026, 10, 25))).toBe("FESTIVO LUN 2 NOV");
    expect(holidayLabel(CO, day(2026, 11, 2))).toBe("HOY FESTIVO");
    expect(holidayLabel(CO, day(2026, 12, 26))).toBeUndefined();
    expect(holidayLabel([], day(2026, 10, 25))).toBeUndefined();
  });

  it("looks as far as the given number of days, today included", () => {
    expect(nextHoliday(CO, day(2026, 12, 25))?.name).toBe("Navidad");
    expect(nextHoliday(CO, day(2026, 12, 20), 4)).toBeUndefined();
    expect(nextHoliday(CO, day(2026, 12, 20), 5)?.name).toBe("Navidad");
  });
});

describe("eventDays", () => {
  const keys = (start: string, end?: string): string[] =>
    eventDays(start, end, "America/Lima").map(dayKey);

  it("covers all-day events up to the day before the end", () => {
    expect(keys("2026-10-29", "2026-11-01")).toEqual(["2026-10-29", "2026-10-30", "2026-10-31"]);
  });

  it("covers every local day of a timed event, not the day of an end at 00:00", () => {
    expect(keys("2026-10-30T22:00:00-05:00", "2026-10-31T02:00:00-05:00")).toEqual([
      "2026-10-30",
      "2026-10-31",
    ]);
    expect(keys("2026-10-30T20:00:00-05:00", "2026-10-31T00:00:00-05:00")).toEqual(["2026-10-30"]);
  });

  it("uses the local day of the zone", () => {
    expect(keys("2026-10-31T03:00:00Z")).toEqual(["2026-10-30"]);
  });

  it("keeps only the start without end, or with an end before the start", () => {
    expect(keys("2026-10-30T10:00:00-05:00")).toEqual(["2026-10-30"]);
    expect(keys("2026-10-30T10:00:00-05:00", "2026-10-29T10:00:00-05:00")).toEqual(["2026-10-30"]);
    expect(keys("2026-10-30", "2026-10-30")).toEqual(["2026-10-30"]);
  });

  it("gives at most 62 days", () => {
    expect(keys("2026-01-01", "2026-04-11")).toHaveLength(62);
  });
});
