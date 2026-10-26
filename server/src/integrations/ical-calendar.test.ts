/* eslint-disable security/detect-non-literal-fs-filename -- temp folder of the test */
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CalendarEvent } from "../engine/config.ts";
import {
  CalendarParseError,
  createIcalCalendars,
  mergeCalendars,
  parseCalendar,
} from "./ical-calendar.ts";
import { guardedHttp } from "./http.ts";
import { icalManifest } from "./manifest.ts";

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Tintero//Prueba//ES",
  "BEGIN:VTIMEZONE",
  "TZID:America/Bogota",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0500",
  "TZNAME:-05",
  "END:STANDARD",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  "UID:semanal-1@prueba",
  "DTSTART;TZID=America/Bogota:20261005T090000",
  "DTEND;TZID=America/Bogota:20261005T093000",
  "RRULE:FREQ=WEEKLY;COUNT=10",
  "EXDATE;TZID=America/Bogota:20261019T090000",
  "SUMMARY:Daily del equipo",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:semanal-1@prueba",
  "RECURRENCE-ID;TZID=America/Bogota:20261026T090000",
  "DTSTART;TZID=America/Bogota:20261026T150000",
  "DTEND;TZID=America/Bogota:20261026T153000",
  "SUMMARY:Daily del equipo (movida)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:cumple@prueba",
  "DTSTART;VALUE=DATE:20261028",
  "DTEND;VALUE=DATE:20261029",
  "RRULE:FREQ=YEARLY",
  "SUMMARY:Cumpleaños de la abuela",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:cancelado@prueba",
  "DTSTART:20261027T140000Z",
  "DTEND:20261027T150000Z",
  "STATUS:CANCELLED",
  "SUMMARY:Reunión cancelada",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:viaje@prueba",
  "DTSTART;VALUE=DATE:20261029",
  "DTEND;VALUE=DATE:20261101",
  "SUMMARY:Viaje",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const WINDOW = { from: { y: 2026, m: 9, d: 24 }, to: { y: 2026, m: 12, d: 26 } };
const TRABAJO = { id: "trabajo", icon: "maletin" } as const;

function wrap(...events: string[][]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//x//y//ES"];
  for (const event of events) lines.push("BEGIN:VEVENT", ...event, "END:VEVENT");
  lines.push("END:VCALENDAR", "");
  return lines.join("\r\n");
}

describe("parseCalendar", () => {
  it("expands, applies exceptions and drops cancelled events", () => {
    const { events, truncated } = parseCalendar(ICS, TRABAJO, WINDOW, "America/Lima");
    expect(truncated).toBe(0);
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
    expect(events[2]?.title).toBe("Daily del equipo (movida)");
    expect(events[2]?.end).toBe("2026-10-26T20:30:00Z");
    expect(events[3]?.end).toBe("2026-10-29");
    expect(events[4]?.end).toBe("2026-11-01");
    expect(events.some((e) => e.title.includes("cancelada"))).toBe(false);
    for (const event of events) {
      expect(event.icon).toBe("maletin");
      expect(event.calendar).toBe("trabajo");
      expect(event.id).toMatch(/^trabajo-[0-9a-f]{12}$/);
    }
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    expect(parseCalendar(ICS, TRABAJO, WINDOW, "America/Lima").events.map((e) => e.id)).toEqual(
      events.map((e) => e.id),
    );
  });

  it("cuts the title at 200 characters and names an empty one", () => {
    const text = wrap(
      ["UID:a", "DTSTART:20261101T100000Z", `SUMMARY:${"x".repeat(300)}`],
      ["UID:b", "DTSTART:20261102T100000Z", "SUMMARY:  "],
    );
    const { events } = parseCalendar(text, TRABAJO, WINDOW, "America/Lima");
    expect(events[0]?.title).toHaveLength(200);
    expect(events[1]?.title).toBe("(sin título)");
  });

  it("counts VEVENT lines before calling ical.js", () => {
    const body = "BEGIN:VEVENT\r\nEND:VEVENT\r\n".repeat(20_001);
    // Not readable by ical.js after the last line: the count must come first.
    const text = `BEGIN:VCALENDAR\r\n${body}\u0000BEGIN:`;
    expect(() => parseCalendar(text, TRABAJO, WINDOW, "UTC")).toThrow(CalendarParseError);
    try {
      parseCalendar(text, TRABAJO, WINDOW, "UTC");
    } catch (error) {
      expect((error as CalendarParseError).code).toBe("too-many");
    }
  });

  it("caps the repetitions of a calendar", () => {
    const text = wrap(["UID:d", "DTSTART:20261001T100000Z", "RRULE:FREQ=HOURLY", "SUMMARY:Horas"]);
    const { events, truncated } = parseCalendar(text, TRABAJO, WINDOW, "UTC");
    expect(truncated).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(2000);
  });

  it("counts only the repetitions inside the window", () => {
    const text = wrap(["UID:d", "DTSTART:20190101T100000Z", "RRULE:FREQ=DAILY", "SUMMARY:Diario"]);
    const { events, truncated } = parseCalendar(text, TRABAJO, WINDOW, "UTC");
    expect(truncated).toBe(0);
    expect(events).toHaveLength(94);
  });

  it("stops an iterator that never reaches the window", () => {
    const text = wrap([
      "UID:m",
      "DTSTART:20190101T100000Z",
      "RRULE:FREQ=MINUTELY",
      "SUMMARY:Minuto",
    ]);
    const started = Date.now();
    const { truncated } = parseCalendar(text, TRABAJO, WINDOW, "UTC");
    expect(truncated).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("expands an endless event that starts inside the window", () => {
    const text = wrap(["UID:d", "DTSTART:20261001T100000Z", "RRULE:FREQ=DAILY", "SUMMARY:Diario"]);
    const { events, truncated } = parseCalendar(text, TRABAJO, WINDOW, "UTC");
    expect(truncated).toBe(0);
    expect(events).toHaveLength(87); // 1 October to 26 December
  });

  it("rejects text that is not iCalendar", () => {
    for (const text of ["hola mundo", "", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n"]) {
      try {
        parseCalendar(text, TRABAJO, WINDOW, "UTC");
        expect.unreachable();
      } catch (error) {
        expect((error as CalendarParseError).code).toBe("bad-ical");
      }
    }
  });

  it("reads floating times in the zone of the display", () => {
    const text = wrap(["UID:f", "DTSTART:20261101T100000", "SUMMARY:Flotante"]);
    const { events } = parseCalendar(text, TRABAJO, WINDOW, "America/Lima");
    expect(events[0]?.start).toBe("2026-11-01T15:00:00Z");
    expect(events[0]?.end).toBeUndefined();
  });

  it("reads a calendar of 20 000 simple events (about 8 MiB) in under 3 s", () => {
    const notes = `DESCRIPTION:${"n".repeat(300)}`;
    const events = Array.from({ length: 20_000 }, (_, i) => [
      `UID:e${i}`,
      `DTSTART:202610${String(1 + (i % 28)).padStart(2, "0")}T100000Z`,
      `SUMMARY:Evento ${i}`,
      notes,
    ]);
    const text = wrap(...events);
    expect(text.length).toBeGreaterThan(7_000_000);
    const started = performance.now();
    const { events: read } = parseCalendar(text, TRABAJO, WINDOW, "UTC");
    const ms = performance.now() - started;
    expect(read).toHaveLength(20_000);
    expect(ms).toBeLessThan(3000);
  });

  it("applies an exception only to the series with its UID", () => {
    const text = wrap(
      ["UID:a", "DTSTART:20261005T100000Z", "RRULE:FREQ=WEEKLY;COUNT=2", "SUMMARY:Serie A"],
      ["UID:b", "DTSTART:20261005T100000Z", "RRULE:FREQ=WEEKLY;COUNT=2", "SUMMARY:Serie B"],
      [
        "UID:a",
        "RECURRENCE-ID:20261012T100000Z",
        "DTSTART:20261013T100000Z",
        "SUMMARY:Serie A movida",
      ],
    );
    const { events } = parseCalendar(text, TRABAJO, WINDOW, "UTC");
    expect(events.map((e) => `${e.start} ${e.title}`)).toEqual([
      "2026-10-05T10:00:00Z Serie A",
      "2026-10-05T10:00:00Z Serie B",
      "2026-10-12T10:00:00Z Serie B",
      "2026-10-13T10:00:00Z Serie A movida",
    ]);
  });

  it("leaves out what does not cross the window", () => {
    const text = wrap(
      ["UID:old", "DTSTART:20260101T100000Z", "SUMMARY:Viejo"],
      ["UID:long", "DTSTART:20260901T100000Z", "DTEND:20261001T100000Z", "SUMMARY:Largo"],
      ["UID:late", "DTSTART:20270101T100000Z", "SUMMARY:Lejano"],
    );
    const { events } = parseCalendar(text, TRABAJO, WINDOW, "UTC");
    expect(events.map((e) => e.title)).toEqual(["Largo"]);
  });
});

const event = (start: string, id: string, end?: string): CalendarEvent => ({
  id,
  title: id,
  start,
  ...(end === undefined ? {} : { end }),
});

describe("mergeCalendars", () => {
  it("keeps the 500 nearest to today", () => {
    const day = (offset: number): string =>
      new Date(Date.UTC(2026, 9, 25 + offset)).toISOString().slice(0, 10);
    const a = Array.from({ length: 300 }, (_, i) => event(day(i - 150), `a${i}`));
    const b = Array.from({ length: 300 }, (_, i) => event(day(i - 140), `b${i}`));
    const { events, dropped } = mergeCalendars([a, b], { y: 2026, m: 10, d: 25 }, "UTC");
    expect(events).toHaveLength(500);
    expect(dropped).toBe(100);
    const starts = events.map((e) => e.start);
    expect(starts).toEqual([...starts].sort());
    // The farthest ones are out.
    expect(events.some((e) => e.id === "a0")).toBe(false);
    expect(events.some((e) => e.id === "b299")).toBe(false);
  });

  it("counts an event that covers today as distance zero", () => {
    const filler = Array.from({ length: 500 }, (_, i) => event(`2026-10-${26 + (i % 5)}`, `f${i}`));
    const long = event("2026-09-01", "long", "2026-11-01");
    const { events } = mergeCalendars([filler, [long]], { y: 2026, m: 10, d: 25 }, "UTC");
    expect(events.some((e) => e.id === "long")).toBe(true);
  });

  it("counts an event over 62 days that covers today as distance zero", () => {
    const filler = Array.from({ length: 5 }, (_, i) => event(`2026-10-${26 + i}`, `f${i}`));
    const long = event("2026-08-01", "long", "2026-12-31");
    const { events } = mergeCalendars([filler, [long]], { y: 2026, m: 10, d: 25 }, "UTC", 5);
    expect(events.some((e) => e.id === "long")).toBe(true);
  });
});

// ---- the integration against a fake server ----

interface Fake {
  base: URL;
  hits: string[];
  answers: Map<string, { status: number; body: string | Buffer; location?: string }>;
  close(): Promise<void>;
}

async function startFake(): Promise<Fake> {
  const fake: Fake = {
    base: new URL("http://127.0.0.1:1"),
    hits: [],
    answers: new Map(),
    close: () => Promise.resolve(),
  };
  const server: Server = createServer((req, res) => {
    fake.hits.push(req.url ?? "");
    const found = fake.answers.get(req.url ?? "");
    const headers = found?.location === undefined ? {} : { location: found.location };
    res.writeHead(found?.status ?? 404, headers);
    res.end(found?.body ?? "");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fake.base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  fake.close = async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  };
  return fake;
}

const CASA_PATH = "/secreto-casa-xyz/casa.ics";
const TRABAJO_PATH = "/secreto-trabajo-abc/trabajo.ics";
const calendarText = (title: string, day: string): string =>
  wrap(["UID:" + title, `DTSTART:${day}T150000Z`, `SUMMARY:${title}`]);

let fake: Fake;
let dir: string;
let lines: Record<string, unknown>[];
let calls: { id: string; items: CalendarEvent[]; readAt: Date | undefined }[];
const clock = { now: new Date("2026-10-25T20:00:00Z") };
const engine = {
  setSource: (id: string, items: unknown, meta?: { readAt?: Date }) => {
    calls.push({ id, items: items as CalendarEvent[], readAt: meta?.readAt });
    return { ok: true as const, changed: true };
  },
};

beforeEach(async () => {
  fake = await startFake();
  dir = mkdtempSync(join(tmpdir(), "tintero-ical-"));
  lines = [];
  calls = [];
  clock.now = new Date("2026-10-25T20:00:00Z");
  fake.answers.set(CASA_PATH, { status: 200, body: calendarText("Cena en casa", "20261027") });
  fake.answers.set(TRABAJO_PATH, {
    status: 200,
    body: calendarText("Reunión privada", "20261026"),
  });
});
afterEach(async () => {
  await fake.close();
  rmSync(dir, { recursive: true, force: true });
});

function make(options: { stateFile?: string; maxBytes?: number } = {}) {
  const http = (): ReturnType<typeof guardedHttp> =>
    guardedHttp(fake.base, undefined, icalManifest, {
      maxBytes: options.maxBytes ?? 8_388_608,
      timeoutMs: 3000,
      log: (line) => lines.push(line),
    });
  return createIcalCalendars({
    calendars: [
      { id: "casa", icon: "casa", http: http(), path: CASA_PATH },
      { id: "trabajo", icon: "maletin", http: http(), path: TRABAJO_PATH },
    ],
    source: "calendario",
    engine,
    timeZone: "America/Lima",
    ...(options.stateFile === undefined ? {} : { stateFile: options.stateFile }),
    clock: () => clock.now,
    log: (line) => lines.push(line),
  });
}

describe("createIcalCalendars", () => {
  it("joins the calendars into one source, ordered, each with its icon", async () => {
    const calendars = make();
    await calendars.cycle();
    expect(fake.hits).toEqual([CASA_PATH, TRABAJO_PATH]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.id).toBe("calendario");
    expect(calls[0]?.items.map((e) => [e.title, e.icon])).toEqual([
      ["Reunión privada", "maletin"],
      ["Cena en casa", "casa"],
    ]);
    await calendars.stop();
  });

  it("keeps the last good read of a calendar that fails and reports the oldest readAt", async () => {
    const calendars = make();
    await calendars.cycle();
    const first = clock.now;
    clock.now = new Date("2026-10-25T20:04:00Z");
    fake.answers.set(TRABAJO_PATH, { status: 500, body: "" });
    await calendars.cycle();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.items).toHaveLength(2);
    expect(calls[1]?.readAt).toEqual(first);
    expect(lines.some((l) => l.event === "error" && l.calendar === "trabajo")).toBe(true);
    await calendars.stop();
  });

  it("does not parse a body over the cap, and does not follow redirects", async () => {
    const calendars = make({ maxBytes: 1000 });
    fake.answers.set(CASA_PATH, { status: 200, body: Buffer.alloc(1001, 65) });
    fake.answers.set(TRABAJO_PATH, { status: 302, body: "", location: CASA_PATH });
    await calendars.cycle();
    expect(calls).toHaveLength(0);
    const codes = lines.filter((l) => l.event === "error").map((l) => l.code);
    expect(codes).toEqual(["too-large", "network"]);
    expect(fake.hits).toEqual([CASA_PATH, TRABAJO_PATH]);
    await calendars.stop();
  });

  it("never logs the address or a title", async () => {
    const errors: string[] = [];
    const calendars = make();
    await calendars.cycle();
    fake.answers.set(TRABAJO_PATH, { status: 500, body: "Reunión privada" });
    try {
      await calendars.cycle();
    } catch (error) {
      errors.push(String(error));
    }
    const all = JSON.stringify(lines) + errors.join("");
    for (const secret of ["secreto-casa-xyz", "secreto-trabajo-abc", "Reunión privada", "Cena"]) {
      expect(all).not.toContain(secret);
    }
    await calendars.stop();
  });

  it("saves the last good read (600) and hands it over on start before any GET", async () => {
    const stateFile = join(dir, "estado.json");
    const first = make({ stateFile });
    await first.cycle();
    await first.idle();
    expect(statSync(stateFile).mode & 0o777).toBe(0o600);
    await first.stop();
    const hitsBefore = fake.hits.length;
    calls = [];
    const second = make({ stateFile });
    await fake.close();
    second.start();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.items).toHaveLength(2);
    expect(fake.hits).toHaveLength(hitsBefore);
    await second.stop();
    fake = await startFake();
  });

  it("ignores a saved calendar that is no longer configured, and a damaged file", async () => {
    const stateFile = join(dir, "estado.json");
    const first = make({ stateFile });
    await first.cycle();
    await first.idle();
    await first.stop();
    calls = [];
    const only = createIcalCalendars({
      calendars: [
        {
          id: "casa",
          icon: "persona",
          http: guardedHttp(fake.base, undefined, icalManifest),
          path: CASA_PATH,
        },
      ],
      source: "calendario",
      engine,
      timeZone: "America/Lima",
      stateFile,
      clock: () => clock.now,
    });
    only.start();
    await only.stop();
    expect(calls[0]?.items.map((e) => e.calendar)).toEqual(["casa"]);
    expect(calls[0]?.items[0]?.icon).toBe("persona");

    writeFileSync(stateFile, "{ no json", { mode: 0o600 });
    calls = [];
    const broken = make({ stateFile });
    broken.start();
    await broken.stop();
    expect(calls).toHaveLength(0);
  });
});
