/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- JSON de prueba */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Panel } from "../../../contract/src/index.ts";
import {
  ConfigError,
  parseViewsConfig,
  type RenderOutput,
  type Renderer,
} from "../../../server/src/engine/index.ts";
import { dayKey, eventDays } from "../../../server/src/engine/dates.ts";
import {
  applyCorrections,
  holidayLabel,
  nextHoliday,
} from "../../../server/src/engine/holidays.ts";
import {
  edited,
  fakeRenderer,
  getViews,
  holidays2026,
  mkEngine6,
  setHolidays,
  views6Text,
  P124,
  viewOf,
  type Loose,
} from "./helpers.ts";

function message(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return (e as ConfigError).message;
  }
  throw new Error("no lanzó ConfigError");
}

const withHolidays = (h: unknown): string =>
  edited(views6Text(), (o: Loose) => {
    o.holidays = h;
  });

describe("CA1 configuración de holidays", () => {
  it("un holidays válido se carga", () => {
    const cfg = parseViewsConfig(
      withHolidays({
        country: "CO",
        add: [{ date: "2026-12-24", name: "Nochebuena" }],
        remove: ["2026-01-12"],
      }),
    ) as Loose;
    expect(cfg.holidays.country).toBe("CO");
    expect(cfg.holidays.add).toEqual([{ date: "2026-12-24", name: "Nochebuena" }]);
    expect(cfg.holidays.remove).toEqual(["2026-01-12"]);
  });

  it("solo country también es válido; sin holidays no hay error", () => {
    const cfg = parseViewsConfig(withHolidays({ country: "CO" })) as Loose;
    expect(cfg.holidays.country).toBe("CO");
    expect(() =>
      parseViewsConfig(
        edited(views6Text(), (o: Loose) => {
          delete o.holidays;
        }),
      ),
    ).not.toThrow();
  });

  it("el ejemplo de vistas trae holidays.country CO", () => {
    const cfg = parseViewsConfig(views6Text()) as Loose;
    expect(cfg.holidays?.country).toBe("CO");
  });

  it("country en minúsculas → /holidays/country", () => {
    expect(message(() => parseViewsConfig(withHolidays({ country: "co" })))).toContain(
      "/holidays/country",
    );
  });

  it("country ausente o de tres letras → /holidays/country", () => {
    expect(message(() => parseViewsConfig(withHolidays({})))).toContain("/holidays/country");
    expect(message(() => parseViewsConfig(withHolidays({ country: "COL" })))).toContain(
      "/holidays/country",
    );
  });

  it("add con 2026-02-30 → /holidays/add/0/date", () => {
    const m = message(() =>
      parseViewsConfig(
        withHolidays({ country: "CO", add: [{ date: "2026-02-30", name: "Mala" }] }),
      ),
    );
    expect(m).toContain("/holidays/add/0/date");
  });

  it("add: nombre vacío y de 61 caracteres, campo de más → error en el elemento", () => {
    const bad = (item: unknown): string =>
      message(() => parseViewsConfig(withHolidays({ country: "CO", add: [item] })));
    expect(bad({ date: "2026-12-24", name: "" })).toContain("/holidays/add/0");
    expect(bad({ date: "2026-12-24", name: "x".repeat(61) })).toContain("/holidays/add/0");
    expect(bad({ date: "2026-12-24", name: "ok", extra: 1 })).toContain("/holidays/add/0");
  });

  it("51 entradas en add → /holidays/add; 60 caracteres sí caben", () => {
    const add = Array.from({ length: 51 }, (_, i) => ({
      date: dayKey({ y: 2026, m: 1 + Math.floor(i / 28), d: 1 + (i % 28) }),
      name: "x",
    }));
    expect(message(() => parseViewsConfig(withHolidays({ country: "CO", add })))).toContain(
      "/holidays/add",
    );
    expect(() =>
      parseViewsConfig(
        withHolidays({ country: "CO", add: [{ date: "2026-12-24", name: "x".repeat(60) }] }),
      ),
    ).not.toThrow();
  });

  it("51 fechas en remove → /holidays/remove; 50 sí; fecha mala también", () => {
    const dates = (n: number): string[] =>
      Array.from({ length: n }, (_, i) =>
        dayKey({ y: 2026, m: 1 + Math.floor(i / 28), d: 1 + (i % 28) }),
      );
    expect(
      message(() => parseViewsConfig(withHolidays({ country: "CO", remove: dates(51) }))),
    ).toContain("/holidays/remove");
    expect(() =>
      parseViewsConfig(withHolidays({ country: "CO", remove: dates(50) })),
    ).not.toThrow();
    expect(
      message(() => parseViewsConfig(withHolidays({ country: "CO", remove: ["2026-13-01"] }))),
    ).toContain("/holidays/remove");
  });

  it("un campo desconocido en holidays → error con su puntero", () => {
    const m = message(() => parseViewsConfig(withHolidays({ country: "CO", region: "x" })));
    expect(m).toContain("/holidays");
  });
});

describe("CA2 applyCorrections", () => {
  it("19 festivos + add (Nochebuena, Navidad en casa) − remove (2026-01-12)", () => {
    const base = holidays2026();
    expect(base).toHaveLength(19);
    const out = applyCorrections(
      base,
      [
        { date: "2026-12-24", name: "Nochebuena" },
        { date: "2026-12-25", name: "Navidad en casa" },
      ],
      ["2026-01-12"],
    );
    expect(out).toHaveLength(19);
    const dates = out.map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).not.toContain("2026-01-12");
    expect(out.find((h) => h.date === "2026-12-24")?.name).toBe("Nochebuena");
    expect(out.find((h) => h.date === "2026-12-25")?.name).toBe("Navidad en casa");
  });

  it("remove quita también lo que vino en add; la entrada de entrada no se muta", () => {
    const base = holidays2026();
    const copy = structuredClone(base);
    const out = applyCorrections(
      base,
      [{ date: "2026-12-24", name: "Nochebuena" }],
      ["2026-12-24"],
    );
    expect(out.map((h) => h.date)).not.toContain("2026-12-24");
    expect(out).toHaveLength(19);
    expect(base).toEqual(copy);
  });

  it("ordena una lista desordenada y quita fechas repetidas", () => {
    const out = applyCorrections(
      [
        { date: "2026-05-01", name: "b" },
        { date: "2026-01-01", name: "a" },
      ],
      [],
      [],
    );
    expect(out.map((h) => h.date)).toEqual(["2026-01-01", "2026-05-01"]);
  });
});

describe("CA3 holidayLabel", () => {
  const list = holidays2026();
  it("hoy 2026-10-25 → FESTIVO LUN 2 NOV", () => {
    expect(holidayLabel(list, { y: 2026, m: 10, d: 25 })).toBe("FESTIVO LUN 2 NOV");
  });
  it("hoy 2026-11-02 → HOY FESTIVO", () => {
    expect(holidayLabel(list, { y: 2026, m: 11, d: 2 })).toBe("HOY FESTIVO");
  });
  it("2026-12-26 sin los de 2027 → undefined", () => {
    expect(holidayLabel(list, { y: 2026, m: 12, d: 26 })).toBeUndefined();
  });
  it("lista vacía → undefined", () => {
    expect(holidayLabel([], { y: 2026, m: 10, d: 25 })).toBeUndefined();
  });
  it("nextHoliday incluye hoy y respeta el plazo", () => {
    expect(nextHoliday(list, { y: 2026, m: 11, d: 2 })?.date).toBe("2026-11-02");
    expect(nextHoliday(list, { y: 2026, m: 10, d: 25 })?.date).toBe("2026-11-02");
    expect(nextHoliday(list, { y: 2026, m: 10, d: 25 }, 7)).toBeUndefined();
    expect(nextHoliday(list, { y: 2026, m: 10, d: 25 }, 8)?.date).toBe("2026-11-02");
  });
});

describe("CA4 eventDays en America/Lima", () => {
  const keys = (start: string, end: string | undefined): string[] =>
    eventDays(start, end, "America/Lima").map(dayKey);

  it("día completo: 29 a 31 de octubre (el fin es exclusivo)", () => {
    expect(keys("2026-10-29", "2026-11-01")).toEqual(["2026-10-29", "2026-10-30", "2026-10-31"]);
  });
  it("con hora que cruza la medianoche: 30 y 31", () => {
    expect(keys("2026-10-30T22:00:00-05:00", "2026-10-31T02:00:00-05:00")).toEqual([
      "2026-10-30",
      "2026-10-31",
    ]);
  });
  it("termina justo a las 00:00: solo el 30", () => {
    expect(keys("2026-10-30T20:00:00-05:00", "2026-10-31T00:00:00-05:00")).toEqual(["2026-10-30"]);
  });
  it("sin end: solo el día de start", () => {
    expect(keys("2026-10-30T20:00:00-05:00", undefined)).toEqual(["2026-10-30"]);
    expect(keys("2026-10-14", undefined)).toEqual(["2026-10-14"]);
  });
  it("end antes de start: solo start", () => {
    expect(keys("2026-10-30T20:00:00-05:00", "2026-10-29T10:00:00-05:00")).toEqual(["2026-10-30"]);
    expect(keys("2026-10-30", "2026-10-20")).toEqual(["2026-10-30"]);
  });
  it("2026-01-01 a 2026-04-11 → 62 días", () => {
    const days = keys("2026-01-01", "2026-04-11");
    expect(days).toHaveLength(62);
    expect(days[0]).toBe("2026-01-01");
    expect(days[61]).toBe("2026-03-03");
  });
  it("usa la zona: las 23:00 de Lima del 30 son el 31 en UTC pero el día local es el 30", () => {
    expect(keys("2026-10-31T04:00:00Z", undefined)).toEqual(["2026-10-30"]);
  });
});

/** Renderer falso cuyo bitmap depende del HTML (el hash de la vista sale del bitmap). */
function htmlSensitiveRenderer(): Renderer {
  return {
    render: (html: string, panel: Panel): Promise<RenderOutput> => {
      const raw1 = new Uint8Array(Math.ceil(panel.w / 8) * panel.h);
      raw1.set(createHash("sha256").update(html).digest());
      return Promise.resolve({ raw1, gray: 0, boxes: [], overflow: [] });
    },
    blockedRequests: () => 0,
    close: () => Promise.resolve(),
  };
}

describe("CA5 setHolidays", () => {
  it("19 → changed true; otra vez → false; fecha mala y 401 entradas → ok false", async () => {
    const e = mkEngine6(htmlSensitiveRenderer(), {
      views: ["hoy"],
      clock: () => new Date("2026-10-25T20:00:00Z"),
    });
    try {
      const h0 = viewOf((await getViews(e, "local", P124)).views, "hoy").hash;
      const list = holidays2026();

      expect(setHolidays(e, list)).toEqual({ ok: true, changed: true });
      await e.idle();
      const h1 = viewOf((await getViews(e, "local", P124)).views, "hoy").hash;
      expect(h1).not.toBe(h0);

      expect(setHolidays(e, structuredClone(list))).toEqual({ ok: true, changed: false });
      await e.idle();
      const h2 = viewOf((await getViews(e, "local", P124)).views, "hoy").hash;
      expect(h2).toBe(h1);

      const bad = setHolidays(e, [{ date: "2026-13-01", name: "Mala" }]);
      expect(bad.ok).toBe(false);
      const tooMany = setHolidays(
        e,
        Array.from({ length: 401 }, (_, i) => ({
          date: dayKey({
            y: 2026 + Math.floor(i / 300),
            m: 1 + Math.floor((i % 300) / 28),
            d: 1 + (i % 28),
          }),
          name: "x",
        })),
      );
      expect(tooMany.ok).toBe(false);
      // la lista anterior sigue
      expect(setHolidays(e, structuredClone(list))).toEqual({ ok: true, changed: false });
      await e.idle();
      const h3 = viewOf((await getViews(e, "local", P124)).views, "hoy").hash;
      expect(h3).toBe(h1);
    } finally {
      await e.idle();
      await e.close();
    }
  });

  it("rechaza lo que no es arreglo, nombres vacíos o largos y campos de más", async () => {
    const e = mkEngine6(fakeRenderer(), { views: ["hoy"] });
    try {
      expect(setHolidays(e, "x").ok).toBe(false);
      expect(setHolidays(e, [{ date: "2026-01-01", name: "" }]).ok).toBe(false);
      expect(setHolidays(e, [{ date: "2026-01-01", name: "x".repeat(61) }]).ok).toBe(false);
      expect(setHolidays(e, [{ date: "2026-01-01" }]).ok).toBe(false);
      expect(setHolidays(e, []).ok).toBe(true);
    } finally {
      await e.close();
    }
  });
});
