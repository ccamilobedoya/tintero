/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access -- carpetas temporales propias, JSON de prueba e índices de listas */
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { Panel } from "../../../contract/src/index.ts";
import type { Engine } from "../../../server/src/engine/index.ts";
import {
  guardedHttp,
  type GuardedHttp,
  type GuardedHttpOptions,
} from "../../../server/src/integrations/http.ts";
import type { Manifest } from "../../../server/src/integrations/manifest.ts";
import {
  P124,
  V124,
  index8,
  isBlack,
  mkEngine6,
  view8,
  type Loose,
  type TestChromium,
  type View8,
} from "../F-008/helpers.ts";

export * from "../F-008/helpers.ts";

const HERE = new URL(".", import.meta.url).pathname;
export const fixture = (name: string): string => readFileSync(join(HERE, "fixtures", name), "utf8");

export interface Holiday {
  date: string;
  name: string;
}

/** La respuesta grabada de Nager.Date para CO 2026 (19 entradas). */
export const nagerCo2026 = (): Loose[] => JSON.parse(fixture("nager-CO-2026.json"));
export const nagerCo2027 = (): Loose[] => JSON.parse(fixture("nager-CO-2027.json"));

/** Los 19 festivos tal como los entrega la integración al motor: `{date, name}`. */
export const holidays2026 = (): Holiday[] =>
  nagerCo2026().map((h) => ({ date: String(h.date), name: String(h.localName) }));

export const EVENTS: Loose[] = [
  { id: "e-01", title: "Cita con el odontólogo", start: "2026-10-06T19:00:00-05:00" },
  { id: "e-02", title: "Cumpleaños", start: "2026-10-14" },
  { id: "e-03", title: "Reunión de la junta", start: "2026-10-14T08:00:00-05:00" },
  { id: "e-04", title: "Clase de cerámica", start: "2026-10-21T18:30:00-05:00" },
  { id: "e-05", title: "Técnico de la nevera", start: "2026-10-27T10:00:00-05:00" },
  { id: "e-06", title: "Viaje", start: "2026-10-29", end: "2026-11-01" },
  { id: "e-07", title: "Almuerzo familiar", start: "2026-11-02T12:30:00-05:00" },
  { id: "e-08", title: "Médico", start: "2026-11-05T09:00:00-05:00" },
  { id: "e-09", title: "Taller", start: "2026-11-24T09:00:00-05:00" },
];

export const withEvents = (o: Loose): void => {
  o.sources.calendario.items = structuredClone(EVENTS);
};

type SetHolidaysResult = { ok: true; changed: boolean } | { ok: false; error: string };

/** `engine.setHolidays(items, meta?)` de F-013 (aún no está en el tipo `Engine`). */
export function setHolidays(
  engine: Engine,
  items: unknown,
  meta?: { readAt?: Date },
): SetHolidaysResult {
  const loose = engine as unknown as {
    setHolidays?: (i: unknown, m?: { readAt?: Date }) => SetHolidaysResult;
  };
  if (typeof loose.setHolidays !== "function") throw new Error("Engine.setHolidays no existe");
  return loose.setHolidays(items, meta);
}

// --- dibujo ---------------------------------------------------------------

export interface Drawn {
  engine: Engine;
  view: View8;
  html: string;
}

const engines: Engine[] = [];
export async function closeEngines(): Promise<void> {
  for (const e of engines.splice(0)) {
    try {
      await e.idle();
      await e.close();
    } catch {
      /* closing anyway */
    }
  }
}

/** Dibuja `hoy` con el motor real: reloj fijo, `calendario` con los eventos de la ficha. */
export async function drawHoy(
  cr: TestChromium,
  opts: {
    panel: Panel;
    now: string;
    holidays?: unknown;
    cfgFn?: (o: Loose) => void;
    viewId?: string;
    noEvents?: boolean;
  },
): Promise<Drawn> {
  const viewId = opts.viewId ?? "hoy";
  const engine = mkEngine6(cr.renderer, {
    views: [viewId],
    clock: () => new Date(opts.now),
    ...(opts.cfgFn ? { cfgFn: opts.cfgFn } : {}),
    dataFn: opts.noEvents ? (o: Loose) => (o.sources.calendario.items = []) : withEvents,
  });
  engines.push(engine);
  if (opts.holidays !== undefined) {
    const r = setHolidays(engine, opts.holidays);
    if (!r.ok) throw new Error(`setHolidays: ${r.error}`);
  }
  const full = (): typeof cr.renderer.calls =>
    cr.renderer.calls.filter((c) => c.html.includes("data-fit="));
  const n0 = full().length;
  const { views } = await index8(engine, "local", opts.panel);
  await engine.idle();
  const calls = full().slice(n0);
  const html = calls[calls.length - 1]?.html;
  if (html === undefined) throw new Error("no hubo dibujo completo");
  return { engine, view: view8(views, viewId), html };
}

export const NOW_HOY = "2026-10-25T20:00:00Z";
export const NOW_NOV2 = "2026-11-02T13:00:00Z";

export interface Rect {
  x0: number;
  x1: number; // inclusive
  y0: number;
  y1: number; // inclusive
}

export function blackIn(raw1: Uint8Array, w: number, r: Rect): number {
  let n = 0;
  for (let y = r.y0; y <= r.y1; y++)
    for (let x = r.x0; x <= r.x1; x++) if (isBlack(raw1, w, x, y)) n++;
  return n;
}
export const area = (r: Rect): number => (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);

/** Compara una lista de puntos; devuelve las diferencias (vacío = todo bien). */
export function pixelErrors(
  raw1: Uint8Array,
  w: number,
  black: [number, number][],
  white: [number, number][],
): string[] {
  const bad: string[] = [];
  for (const [x, y] of black) if (!isBlack(raw1, w, x, y)) bad.push(`(${x}, ${y}) debía ser negro`);
  for (const [x, y] of white) if (isBlack(raw1, w, x, y)) bad.push(`(${x}, ${y}) debía ser blanco`);
  return bad;
}

// --- HTML del bloque ------------------------------------------------------

/** Pesos declarados por el elemento que contiene el número del día (él mismo o su padre inmediato). */
export function dayWeights(html: string, day: number): string[][] {
  const VOID = new Set(["br", "img", "meta", "link", "input", "hr", "col", "area", "base"]);
  const stack: { tag: string; style: string }[] = [];
  const found: string[][] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>|([^<]+)/g;
  const weightOf = (style: string): string | undefined =>
    /font-weight:(\d{3})/.exec(style.replace(/\s+/g, ""))?.[1];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[5] !== undefined) {
      if (m[5].trim() === String(day) && stack.length > 0) {
        const own = stack[stack.length - 1];
        const parent = stack[stack.length - 2];
        found.push(
          [weightOf(own?.style ?? ""), weightOf(parent?.style ?? "")].filter(
            (x): x is string => x !== undefined,
          ),
        );
      }
      continue;
    }
    const tag = (m[2] ?? "").toLowerCase();
    if (m[1] === "/") {
      stack.pop();
      continue;
    }
    if (tag === "script" || tag === "style") continue;
    if (VOID.has(tag) || m[4] === "/") continue;
    const style = /style\s*=\s*"([^"]*)"/.exec(m[3] ?? "")?.[1] ?? "";
    stack.push({ tag, style });
  }
  return found;
}

// --- Nager.Date falso -----------------------------------------------------

export interface Recorded {
  method: string;
  path: string;
  authorization: string | undefined;
}
export interface FakeNager {
  base: string;
  port: number;
  requests: Recorded[];
  /** Respuesta por ruta exacta (`/api/v3/PublicHolidays/2026/CO`); sin entrada: 404. */
  routes: Map<string, { status: number; body: string | Buffer }>;
  /** Cierra cada conexión sin responder. */
  offline: boolean;
  close(): Promise<void>;
}

export const nagerPath = (year: number, country: string): string =>
  `/api/v3/PublicHolidays/${String(year)}/${country}`;

export async function startNager(): Promise<FakeNager> {
  const requests: Recorded[] = [];
  const routes: FakeNager["routes"] = new Map();
  const sockets = new Set<import("node:net").Socket>();
  const state = { offline: false };
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    requests.push({
      method: req.method ?? "",
      path: req.url ?? "",
      authorization: req.headers.authorization,
    });
    if (state.offline) {
      req.socket.destroy();
      return;
    }
    const found = routes.get(req.url ?? "");
    const body = found?.body ?? "{}";
    const buf = typeof body === "string" ? Buffer.from(body) : body;
    res.writeHead(found?.status ?? 404, {
      "Content-Type": "application/json",
      "Content-Length": buf.length,
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
    port,
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

// --- manifiesto y cliente con guardia ------------------------------------

/** El manifiesto de `festivos` tal como lo escribe el contrato de la ficha. */
export const festivosManifest = {
  id: "festivos",
  version: "1",
  delivers: "holidays",
  needsKey: false,
  hosts: "configured",
  routes: [{ method: "GET", prefix: "/api/v3/PublicHolidays/" }],
  writes: false,
  pollS: 3600,
} as unknown as Manifest;

/** `guardedHttp(base, keyFile | undefined, manifest, options)` de F-013. */
export function guardedHttp13(
  base: string,
  keyFile: string | undefined,
  manifest: Manifest,
  options: GuardedHttpOptions = {},
): GuardedHttp {
  const loose = guardedHttp as unknown as (
    b: URL,
    k: string | undefined,
    m: Manifest,
    o: GuardedHttpOptions,
  ) => GuardedHttp;
  return loose(new URL(base), keyFile, manifest, options);
}

export { P124, V124 };
