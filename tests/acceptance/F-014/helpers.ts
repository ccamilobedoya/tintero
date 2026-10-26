/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access -- carpetas temporales propias y JSON de prueba */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { join } from "node:path";
import type { Panel } from "../../../contract/src/index.ts";
import {
  createEngine,
  parseDataFile,
  parseViewsConfig,
  type Engine,
} from "../../../server/src/engine/index.ts";
import type { DayParts } from "../../../server/src/engine/dates.ts";
import type { Manifest } from "../../../server/src/integrations/manifest.ts";
import {
  P124,
  ROOT,
  edited,
  index8,
  isBlack,
  makeClock,
  view8,
  type Loose,
  type TestChromium,
  type View8,
} from "../F-013/helpers.ts";
import { holidays2026, setHolidays } from "../F-013/helpers.ts";

export * from "../F-013/helpers.ts";

const HERE = new URL(".", import.meta.url).pathname;

/** `prueba.ics` tal como lo da la ficha; se normaliza a CRLF al leerlo (el contrato de iCalendar). */
export const pruebaIcs = (): string =>
  readFileSync(join(HERE, "fixtures", "prueba.ics"), "utf8").replace(/\r?\n/g, "\r\n");

export const WINDOW = {
  from: { y: 2026, m: 9, d: 24 },
  to: { y: 2026, m: 12, d: 26 },
} satisfies { from: DayParts; to: DayParts };
export const LIMA = "America/Lima";

export const sha12 = (uid: string, start: string): string =>
  createHash("sha256").update(`${uid}|${start}`).digest("hex").slice(0, 12);

/** Un calendario con los eventos dados (cada uno ya con sus líneas). */
export function icsOf(events: string[][]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tintero//Prueba//ES"];
  for (const e of events) lines.push("BEGIN:VEVENT", ...e, "END:VEVENT");
  lines.push("END:VCALENDAR");
  return lines.map((l) => `${l}\r\n`).join("");
}

export const simpleEvent = (uid: string, start: string, summary: string): string[] => [
  `UID:${uid}`,
  `DTSTART:${start}`,
  `SUMMARY:${summary}`,
];

// --- manifiesto de la integración (el contrato lo da campo por campo) -------

export const icalManifest = {
  id: "ical-calendario",
  version: "1",
  delivers: "events",
  needsKey: false,
  hosts: "configured",
  routes: [{ method: "GET", prefix: "/" }],
  writes: false,
  pollS: 240,
} as unknown as Manifest;

// --- servidor falso de calendarios -----------------------------------------

export interface Answer {
  status: number;
  body: string | Buffer;
  headers?: Record<string, string>;
}
export interface Recorded {
  method: string;
  path: string;
}
export interface FakeIcal {
  base: string;
  requests: Recorded[];
  routes: Map<string, Answer>;
  /** Cierra cada conexión sin responder. */
  offline: boolean;
  close(): Promise<void>;
}

export async function startFakeIcal(): Promise<FakeIcal> {
  const requests: Recorded[] = [];
  const routes: FakeIcal["routes"] = new Map();
  const sockets = new Set<Socket>();
  const state = { offline: false };
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    requests.push({ method: req.method ?? "", path: req.url ?? "" });
    if (state.offline) {
      req.socket.destroy();
      return;
    }
    const found = routes.get(req.url ?? "");
    if (!found) {
      res.writeHead(404, { "Content-Length": 0 });
      res.end();
      return;
    }
    const buf = typeof found.body === "string" ? Buffer.from(found.body) : found.body;
    res.writeHead(found.status, {
      "Content-Type": "text/calendar",
      "Content-Length": buf.length,
      ...found.headers,
    });
    res.end(buf);
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    requests,
    routes,
    get offline() {
      return state.offline;
    },
    set offline(v: boolean) {
      state.offline = v;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => {
          resolve();
        });
      }),
  };
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

// --- dibujo de la agenda ------------------------------------------------------

export const AGENDA_VIEWS = join(ROOT, "config/agenda.views.example.json");
export const AGENDA_DATA = join(ROOT, "config/agenda.data.example.json");

export const NOW_OCT27 = "2026-10-27T13:00:00Z";
export const NOW_NOV1 = "2026-11-01T13:00:00Z";

export interface DrawnAgenda {
  engine: Engine;
  view: View8;
  html: string;
}

const engines: Engine[] = [];
export async function closeAgendaEngines(): Promise<void> {
  for (const e of engines.splice(0)) {
    try {
      await e.idle();
      await e.close();
    } catch {
      /* closing anyway */
    }
  }
}

/** La vista `agenda` de los ejemplos de la ficha, con el motor real, 124 ppp y los festivos de CO 2026. */
export async function drawAgenda(
  cr: TestChromium,
  opts: { now: string; holidays: boolean; panel?: Panel },
): Promise<DrawnAgenda> {
  const viewsText = edited(readFileSync(AGENDA_VIEWS, "utf8"), (o: Loose) => {
    o.views[0].slots.eventos.options.holidays = opts.holidays;
  });
  const config = parseViewsConfig(viewsText);
  const data = parseDataFile(readFileSync(AGENDA_DATA, "utf8"), config);
  const clock = makeClock(opts.now);
  const engine = createEngine({
    nextWakeS: 1800,
    clock: clock.clock,
    config,
    data,
    renderer: cr.renderer,
  });
  engines.push(engine);
  const r = setHolidays(engine, holidays2026());
  if (!r.ok) throw new Error(`setHolidays: ${r.error}`);
  const full = (): typeof cr.renderer.calls =>
    cr.renderer.calls.filter((c) => c.html.includes("data-fit="));
  const n0 = full().length;
  const { views } = await index8(engine, "local", opts.panel ?? P124);
  await engine.idle();
  const calls = full().slice(n0);
  const html = calls[calls.length - 1]?.html;
  if (html === undefined) throw new Error("no hubo dibujo completo");
  return { engine, view: view8(views, "agenda"), html };
}

export const zoneRects = (v: View8): [number, number, number, number][] =>
  [...v.zones].sort((a, b) => a.y - b.y).map((z) => [z.x, z.y, z.w, z.h]);

export function inkIn(
  raw1: Uint8Array,
  w: number,
  r: { x0: number; x1: number; y0: number; y1: number },
): number {
  let n = 0;
  for (let y = r.y0; y <= r.y1; y++)
    for (let x = r.x0; x <= r.x1; x++) if (isBlack(raw1, w, x, y)) n++;
  return n;
}
