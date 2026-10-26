/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- JSON de prueba */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, parseDataFile } from "../../../server/src/engine/index.ts";
import {
  CalendarParseError,
  mergeCalendars,
  parseCalendar,
} from "../../../server/src/integrations/ical-calendar.ts";
import {
  LIMA,
  ROOT,
  WINDOW,
  cfg6,
  edited,
  fakeRenderer,
  icsOf,
  mkEngine6,
  pruebaIcs,
  sha12,
  simpleEvent,
  type Loose,
} from "./helpers.ts";

// eslint-disable-next-line security/detect-non-literal-fs-filename -- ruta fija del repo
const CAL_DATA = readFileSync(join(ROOT, "config/calendario.data.example.json"), "utf8");
const ICONS = ["persona", "maletin", "casa", "pastel", "corazon", "estrella"];

const ev = (extra: Loose): Loose => ({
  id: "x-1",
  title: "Algo",
  start: "2026-10-27T10:00:00-05:00",
  ...extra,
});
function withFirst(extra: Loose): string {
  return edited(CAL_DATA, (o: Loose) => {
    o.sources.calendario.items = [ev(extra)];
  });
}
function parseError(text: string): ConfigError | undefined {
  try {
    parseDataFile(text, cfg6());
    return undefined;
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    return e;
  }
}

describe("CA1 icon y calendar", () => {
  it("icon «gato» → error en /sources/calendario/items/0/icon", () => {
    const e = parseError(withFirst({ icon: "gato" }));
    expect(e).toBeInstanceOf(ConfigError);
    expect(e?.message).toContain("/sources/calendario/items/0/icon");
    expect(e?.message).not.toContain("gato");
  });

  it("calendar «Mi Cal» → error en …/calendar", () => {
    const e = parseError(withFirst({ calendar: "Mi Cal" }));
    expect(e).toBeInstanceOf(ConfigError);
    expect(e?.message).toContain("/sources/calendario/items/0/calendar");
  });

  it("los seis pictogramas y un calendar válido se aceptan; sin ellos también", () => {
    for (const icon of ICONS) {
      expect(parseError(withFirst({ icon, calendar: "trabajo-2" })), icon).toBeUndefined();
    }
    expect(parseError(withFirst({}))).toBeUndefined();
  });

  it("calendar de 33 caracteres o con mayúsculas es error; de 32 se acepta", () => {
    expect(parseError(withFirst({ calendar: "a".repeat(32) }))).toBeUndefined();
    expect(parseError(withFirst({ calendar: "a".repeat(33) }))).toBeInstanceOf(ConfigError);
    expect(parseError(withFirst({ calendar: "Casa" }))).toBeInstanceOf(ConfigError);
    expect(parseError(withFirst({ calendar: "" }))).toBeInstanceOf(ConfigError);
  });

  it("setSource con icon inválido → ok:false; con los seis válidos → ok:true", async () => {
    const engine = mkEngine6(fakeRenderer());
    try {
      const bad = engine.setSource("calendario", [ev({ icon: "gato" })]);
      expect(bad.ok).toBe(false);
      if (!bad.ok) {
        expect(bad.error).toContain("icon");
        expect(bad.error).not.toContain("gato");
      }
      const badCal = engine.setSource("calendario", [ev({ calendar: "Mi Cal" })]);
      expect(badCal.ok).toBe(false);
      for (const icon of ICONS) {
        const good = engine.setSource("calendario", [ev({ icon, calendar: "casa" })]);
        expect(good.ok, icon).toBe(true);
      }
      expect(engine.setSource("calendario", [ev({})]).ok).toBe(true);
    } finally {
      await engine.close();
    }
  });
});

describe("CA2 parseCalendar sobre prueba.ics", () => {
  const read = (): ReturnType<typeof parseCalendar> =>
    parseCalendar(pruebaIcs(), { id: "trabajo", icon: "maletin" }, WINDOW, LIMA);

  it("11 eventos, en orden por start", () => {
    const { events } = read();
    expect(events.map((e) => e.start)).toEqual([
      "2026-10-05T14:00:00Z",
      "2026-10-12T14:00:00Z",
      "2026-10-26T20:00:00Z",
      "2026-10-28",
      "2026-10-29",
      "2026-11-02T14:00:00Z",
      "2026-11-09T14:00:00Z",
      "2026-11-16T14:00:00Z",
      "2026-11-23T14:00:00Z",
      "2026-11-30T14:00:00Z",
      "2026-12-07T14:00:00Z",
    ]);
  });

  it("la movida, los días completos, la cancelada y el 19 de octubre", () => {
    const { events } = read();
    expect(events[2]?.title).toBe("Daily del equipo (movida)");
    expect(events[3]).toMatchObject({ title: "Cumpleaños de la abuela", end: "2026-10-29" });
    expect(events[4]).toMatchObject({ title: "Viaje", end: "2026-11-01" });
    expect(events.map((e) => e.title)).not.toContain("Reunión cancelada");
    expect(events.map((e) => e.start)).not.toContain("2026-10-19T14:00:00Z");
    // los de 30 min llevan end 30 min después
    expect(events[0]?.end).toBe("2026-10-05T14:30:00Z");
    expect(events[2]?.end).toBe("2026-10-26T20:30:00Z");
    for (const i of [1, 5, 6, 7, 8, 9, 10]) {
      const e = events[i];
      const t = Date.parse(e?.start ?? "");
      expect(Date.parse(e?.end ?? ""), e?.start).toBe(t + 30 * 60_000);
    }
  });

  it("icon, calendar e ids de 12 hex; estables entre dos lecturas", () => {
    const a = read().events;
    const b = read().events;
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(new Set(a.map((e) => e.id)).size).toBe(11);
    for (const e of a) {
      expect(e.icon).toBe("maletin");
      expect(e.calendar).toBe("trabajo");
      expect(e.id).toMatch(/^trabajo-[0-9a-f]{12}$/);
    }
    expect(a[2]?.id).toBe(`trabajo-${sha12("semanal-1@prueba", "2026-10-26T20:00:00Z")}`);
    expect(a[3]?.id).toBe(`trabajo-${sha12("cumple@prueba", "2026-10-28")}`);
    expect(a[4]?.id).toBe(`trabajo-${sha12("viaje@prueba", "2026-10-29")}`);
    expect(a[0]?.id).toBe(`trabajo-${sha12("semanal-1@prueba", "2026-10-05T14:00:00Z")}`);
  });

  it("solo copia los campos del contrato (nada de ubicación ni notas)", () => {
    const text = icsOf([
      [
        "UID:u1@prueba",
        "DTSTART:20261027T140000Z",
        "DTEND:20261027T150000Z",
        "SUMMARY:Con extras",
        "LOCATION:Sala-secreta-77",
        "DESCRIPTION:Notas-privadas-88",
        "ATTENDEE:mailto:alguien@example.com",
      ],
    ]);
    const { events } = parseCalendar(text, { id: "casa", icon: "casa" }, WINDOW, LIMA);
    expect(events).toHaveLength(1);
    const json = JSON.stringify(events);
    for (const s of ["Sala-secreta-77", "Notas-privadas-88", "alguien@example.com"])
      expect(json).not.toContain(s);
    expect(Object.keys(events[0] ?? {}).sort()).toEqual(
      ["calendar", "end", "icon", "id", "start", "title"].sort(),
    );
  });

  it("un evento sin DTEND no lleva end", () => {
    const text = icsOf([simpleEvent("u2@prueba", "20261027T140000Z", "Sin fin")]);
    const { events } = parseCalendar(text, { id: "casa", icon: "casa" }, WINDOW, LIMA);
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("end");
  });

  it("la ventana: entra lo que se cruza, no lo que queda fuera", () => {
    const text = icsOf([
      // termina el 23 de septiembre: fuera
      [
        "UID:f1@p",
        "DTSTART;VALUE=DATE:20260920",
        "DTEND;VALUE=DATE:20260924",
        "SUMMARY:Fuera antes",
      ],
      // cruza el inicio de la ventana: dentro
      [
        "UID:f2@p",
        "DTSTART;VALUE=DATE:20260922",
        "DTEND;VALUE=DATE:20260925",
        "SUMMARY:Cruza inicio",
      ],
      // el último día de la ventana: dentro
      [
        "UID:f3@p",
        "DTSTART;VALUE=DATE:20261226",
        "DTEND;VALUE=DATE:20261227",
        "SUMMARY:Último día",
      ],
      // el día siguiente: fuera
      [
        "UID:f4@p",
        "DTSTART;VALUE=DATE:20261227",
        "DTEND;VALUE=DATE:20261228",
        "SUMMARY:Fuera después",
      ],
    ]);
    const { events } = parseCalendar(text, { id: "casa", icon: "casa" }, WINDOW, LIMA);
    expect(events.map((e) => e.title)).toEqual(["Cruza inicio", "Último día"]);
  });
});

describe("CA3 límites y errores", () => {
  const cal = { id: "casa", icon: "casa" as const };

  it("SUMMARY de 300 → 200; vacío → «(sin título)»; espacios juntados", () => {
    const text = icsOf([
      simpleEvent("l1@p", "20261027T140000Z", "x".repeat(300)),
      simpleEvent("l2@p", "20261028T140000Z", ""),
      simpleEvent("l3@p", "20261029T140000Z", "uno   dos    tres"),
    ]);
    const { events } = parseCalendar(text, cal, WINDOW, LIMA);
    expect(events).toHaveLength(3);
    expect(events[0]?.title).toBe("x".repeat(200));
    expect(events[1]?.title).toBe("(sin título)");
    expect(events[2]?.title).toBe("uno dos tres");
  });

  it("20 001 líneas BEGIN:VEVENT → too-many, antes de que ical.js lea el texto", () => {
    const text =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" +
      "BEGIN:VEVENT\r\n".repeat(20_001) +
      "\u0000\u0001 esto ical.js no lo puede leer \u0002\r\n";
    let error: unknown;
    try {
      parseCalendar(text, cal, WINDOW, LIMA);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CalendarParseError);
    expect((error as CalendarParseError).code).toBe("too-many");
  });

  it("exactamente 20 000 eventos no es «too-many»", () => {
    const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0"];
    for (let i = 0; i < 20_000; i++)
      lines.push(
        "BEGIN:VEVENT",
        `UID:n${String(i)}@p`,
        "DTSTART:20261027T140000Z",
        "SUMMARY:E",
        "END:VEVENT",
      );
    lines.push("END:VCALENDAR");
    const { events } = parseCalendar(lines.map((l) => `${l}\r\n`).join(""), cal, WINDOW, LIMA);
    expect(events).toHaveLength(20_000);
  });

  it("evento diario sin fin → como máximo 2 000 repeticiones y truncated > 0", () => {
    const text = icsOf([
      ["UID:d@p", "DTSTART:20260101T090000Z", "RRULE:FREQ=DAILY", "SUMMARY:Cada día"],
    ]);
    const wide = { from: { y: 2026, m: 1, d: 1 }, to: { y: 2036, m: 1, d: 1 } };
    const r = parseCalendar(text, cal, wide, LIMA);
    expect(r.events.length).toBeLessThanOrEqual(2000);
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.truncated).toBeGreaterThan(0);
  });

  it("texto que no es iCalendar → bad-ical", () => {
    for (const text of ["esto no es un calendario", "", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n"]) {
      let error: unknown;
      try {
        parseCalendar(text, cal, WINDOW, LIMA);
      } catch (e) {
        error = e;
      }
      expect(error, JSON.stringify(text)).toBeInstanceOf(CalendarParseError);
      expect((error as CalendarParseError).code).toBe("bad-ical");
    }
  });

  it("presupuesto: un archivo de ~8 MiB con 20 000 eventos simples en menos de 3 s", () => {
    const pad = "p".repeat(300);
    const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0"];
    for (let i = 0; i < 20_000; i++)
      lines.push(
        "BEGIN:VEVENT",
        `UID:b${String(i)}@p`,
        "DTSTART:20261027T140000Z",
        "SUMMARY:E",
        `DESCRIPTION:${pad}`,
        "END:VEVENT",
      );
    lines.push("END:VCALENDAR");
    const text = lines.map((l) => `${l}\r\n`).join("");
    const t0 = performance.now();
    const r = parseCalendar(text, cal, WINDOW, LIMA);
    const ms = performance.now() - t0;
    console.info(`parseCalendar ${String(text.length)} bytes: ${String(Math.round(ms))} ms`);
    expect(r.events).toHaveLength(20_000);
    expect(ms).toBeLessThan(3000);
  });
});

describe("CA4 mergeCalendars", () => {
  const TODAY = { y: 2026, m: 10, d: 25 };
  const day = (offset: number, hour: number): string =>
    new Date(Date.UTC(2026, 9, 25 + offset, hour)).toISOString().replace(".000Z", "Z");
  const list = (name: string, hour: number): Loose[] =>
    Array.from({ length: 300 }, (_, i) => ({
      id: `${name}-${String(i).padStart(3, "0")}`,
      title: `${name} ${String(i)}`,
      start: day(i, hour),
      calendar: name,
      icon: "casa",
    }));

  it("300 + 300 → 500, dropped 100, quedan los más cercanos y ordenados", () => {
    const r = mergeCalendars([list("a", 15), list("b", 16)] as never, TODAY, LIMA);
    expect(r.events).toHaveLength(500);
    expect(r.dropped).toBe(100);
    // 2 por día, días 0 a 249: los 50 últimos de cada lista quedan fuera
    const ids = new Set(r.events.map((e) => e.id));
    for (const name of ["a", "b"]) {
      for (let i = 0; i < 250; i++)
        expect(ids.has(`${name}-${String(i).padStart(3, "0")}`)).toBe(true);
      for (let i = 250; i < 300; i++)
        expect(ids.has(`${name}-${String(i).padStart(3, "0")}`)).toBe(false);
    }
    const starts = r.events.map((e) => e.start);
    expect(starts).toEqual([...starts].sort());
  });

  it("menos de 500 → no se descarta nada", () => {
    const r = mergeCalendars([list("a", 15).slice(0, 10)] as never, TODAY, LIMA);
    expect(r.events).toHaveLength(10);
    expect(r.dropped).toBe(0);
  });

  it("los que cubren hoy cuentan a distancia 0, aunque empezaran antes", () => {
    const covering = {
      id: "largo",
      title: "Largo",
      start: "2026-08-01",
      end: "2026-12-31",
      calendar: "a",
      icon: "casa",
    };
    const far = list("b", 16).map((e, i) => ({ ...e, start: day(i + 1, 16) }));
    const lists = [
      [covering],
      far.concat(list("c", 17).map((e, i) => ({ ...e, start: day(-i - 1, 17) }))),
    ];
    const r = mergeCalendars(lists as never, TODAY, LIMA, 5);
    expect(r.events.map((e) => e.id)).toContain("largo");
    expect(r.events).toHaveLength(5);
    expect(r.dropped).toBe(596);
  });
});
