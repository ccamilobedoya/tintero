/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access -- carpetas temporales propias y JSON de prueba */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIcalCalendars } from "../../../server/src/integrations/ical-calendar.ts";
import {
  guardedHttp13,
  icalManifest,
  icsOf,
  pruebaIcs,
  rmDir,
  simpleEvent,
  sleep,
  startFakeIcal,
  tmpDir,
  type FakeIcal,
  type Loose,
} from "./helpers.ts";

const T1 = "2026-10-25T20:00:00Z";
const SECRET_DIR = "/privado-q7z9k";
const CASA_PATH = `${SECRET_DIR}/casa.ics`;
const TRABAJO_PATH = `${SECRET_DIR}/trabajo.ics`;
const SECRET_TITLE = "TituloPrivadoXYZ";

const CASA_ICS = icsOf([
  simpleEvent("c1@p", "20261027T150000Z", SECRET_TITLE),
  ["UID:c2@p", "DTSTART;VALUE=DATE:20261030", "DTEND;VALUE=DATE:20261031", "SUMMARY:Cumple casa"],
]);

let fake: FakeIcal;
let dir: string;
const dirs: string[] = [];

beforeEach(async () => {
  fake = await startFakeIcal();
  dir = tmpDir("tintero-f014-");
  dirs.push(dir);
  fake.routes.set(CASA_PATH, { status: 200, body: CASA_ICS });
  fake.routes.set(TRABAJO_PATH, { status: 200, body: pruebaIcs() });
});
afterEach(async () => {
  await fake.close();
});
afterAll(() => {
  for (const d of dirs) rmDir(d);
});

interface Call {
  id: string;
  items: Loose[];
  readAt: Date | undefined;
  requestsSoFar: number;
}
interface Rig {
  ical: ReturnType<typeof createIcalCalendars>;
  calls: Call[];
  logs: Loose[];
  now: { t: Date };
  stateFile: string;
}

function rig(
  ids: ("casa" | "trabajo")[] = ["casa", "trabajo"],
  opts: { stateFile?: string; maxBytes?: number } = {},
): Rig {
  const now = { t: new Date(T1) };
  const calls: Call[] = [];
  const logs: Loose[] = [];
  const stateFile = opts.stateFile ?? join(dir, "calendarios.estado.json");
  const calendars = ids.map((id) => ({
    id,
    icon: id === "casa" ? ("casa" as const) : ("maletin" as const),
    path: id === "casa" ? CASA_PATH : TRABAJO_PATH,
    http: guardedHttp13(fake.base, undefined, icalManifest, {
      maxBytes: opts.maxBytes ?? 8_388_608,
      timeoutMs: 15_000,
      log: (l) => logs.push(l),
      clock: () => new Date(now.t),
    }),
  }));
  const engine = {
    setSource: (id: string, items: unknown, meta?: { readAt?: Date }) => {
      calls.push({
        id,
        items: items as Loose[],
        readAt: meta?.readAt,
        requestsSoFar: fake.requests.length,
      });
      return { ok: true as const, changed: true };
    },
  };
  const ical = createIcalCalendars({
    calendars,
    source: "calendario",
    engine: engine,
    timeZone: "America/Lima",
    stateFile,
    clock: () => new Date(now.t),
    log: (l: Loose) => logs.push(l),
  });
  return { ical, calls, logs, now, stateFile };
}

const last = (r: Rig): Call => {
  const c = r.calls[r.calls.length - 1];
  if (!c) throw new Error("setSource no se llamó");
  return c;
};

describe("CA6 dos calendarios, una fuente", () => {
  it("el primer cycle hace dos GET y entrega los eventos de los dos, ordenados, con su icon", async () => {
    const r = rig();
    await r.ical.cycle();
    expect(fake.requests.map((q) => `${q.method} ${q.path}`).sort()).toEqual(
      [`GET ${CASA_PATH}`, `GET ${TRABAJO_PATH}`].sort(),
    );
    const c = last(r);
    expect(c.id).toBe("calendario");
    expect(c.items).toHaveLength(13);
    const starts = c.items.map((e) => e.start as string);
    expect(starts).toEqual([...starts].sort());
    for (const e of c.items) {
      if (e.calendar === "casa") expect(e.icon).toBe("casa");
      else {
        expect(e.calendar).toBe("trabajo");
        expect(e.icon).toBe("maletin");
      }
    }
    expect(c.items.filter((e) => e.calendar === "casa")).toHaveLength(2);
    expect(c.items.filter((e) => e.calendar === "trabajo")).toHaveLength(11);
    expect(c.readAt?.getTime()).toBe(new Date(T1).getTime());
    await r.ical.idle();
    await r.ical.stop();
  });

  it("si trabajo da 500 en el siguiente cycle, la fuente sigue con los dos; readAt es la de trabajo", async () => {
    const r = rig();
    await r.ical.cycle();
    const first = last(r);
    fake.routes.set(TRABAJO_PATH, { status: 500, body: "error" });
    r.now.t = new Date(new Date(T1).getTime() + 240_000);
    await r.ical.cycle();
    const second = last(r);
    const ids = (c: Call): string[] => c.items.map((e) => String(e.id)).sort();
    expect(ids(second)).toEqual(ids(first));
    expect(second.items.filter((e) => e.calendar === "trabajo")).toHaveLength(11);
    // casa se leyó a T1 + 240 s, trabajo quedó en T1: la más vieja manda
    expect(second.readAt?.getTime()).toBe(new Date(T1).getTime());
    const errors = r.logs.filter((l) => l.event === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((l) => l.integration === "ical-calendario")).toBe(true);
    expect(errors.some((l) => l.calendar === "trabajo")).toBe(true);
    expect(errors.some((l) => l.calendar === "casa")).toBe(false);
    await r.ical.idle();
    await r.ical.stop();
  });
});

describe("CA7 tamaño, redirecciones y secretos", () => {
  it("8 MiB + 1 byte → too-large, sin eventos de ese calendario", async () => {
    fake.routes.set(CASA_PATH, { status: 200, body: Buffer.alloc(8_388_609, 0x41) });
    const r = rig(["casa"]);
    await r.ical.cycle();
    expect(
      r.logs.some((l) => l.event === "error" && l.calendar === "casa" && l.code === "too-large"),
    ).toBe(true);
    expect(r.calls.every((c) => c.items.length === 0)).toBe(true);
    await r.ical.stop();
  }, 60_000);

  it("una redirección 302 → error y no se sigue", async () => {
    fake.routes.set(CASA_PATH, {
      status: 302,
      body: "",
      headers: { Location: `${fake.base}${SECRET_DIR}/otro.ics` },
    });
    fake.routes.set(`${SECRET_DIR}/otro.ics`, { status: 200, body: CASA_ICS });
    const r = rig(["casa"]);
    await r.ical.cycle();
    expect(r.logs.some((l) => l.event === "error" && l.calendar === "casa")).toBe(true);
    expect(fake.requests.map((q) => q.path)).toEqual([CASA_PATH]);
    expect(r.calls.every((c) => c.items.length === 0)).toBe(true);
    await r.ical.stop();
  });

  it("demasiados VEVENT y texto ilegible → error con su code, y los demás siguen", async () => {
    fake.routes.set(CASA_PATH, {
      status: 200,
      body: "BEGIN:VCALENDAR\r\n" + "BEGIN:VEVENT\r\n".repeat(20_001) + "\u0000 basura\r\n",
    });
    const r = rig();
    await r.ical.cycle();
    expect(
      r.logs.some((l) => l.event === "error" && l.calendar === "casa" && l.code === "too-many"),
    ).toBe(true);
    expect(last(r).items.filter((e) => e.calendar === "trabajo")).toHaveLength(11);
    fake.routes.set(CASA_PATH, { status: 200, body: "esto no es un calendario" });
    await r.ical.cycle();
    expect(
      r.logs.some((l) => l.event === "error" && l.calendar === "casa" && l.code === "bad-ical"),
    ).toBe(true);
    await r.ical.stop();
  });

  it("ninguna línea registrada ni mensaje de error contiene la ruta ni el SUMMARY", async () => {
    const messages: string[] = [];
    const r = rig();
    await r.ical.cycle(); // lectura buena: el SUMMARY pasa por el motor, no por el registro
    await r.ical.idle();
    fake.routes.set(CASA_PATH, { status: 500, body: SECRET_TITLE });
    r.now.t = new Date(new Date(T1).getTime() + 240_000);
    try {
      await r.ical.cycle();
    } catch (e) {
      messages.push(String(e), JSON.stringify(e));
    }
    fake.routes.set(CASA_PATH, {
      status: 302,
      body: "",
      headers: { Location: `${fake.base}${CASA_PATH}` },
    });
    try {
      await r.ical.cycle();
    } catch (e) {
      messages.push(String(e), JSON.stringify(e));
    }
    fake.offline = true;
    try {
      await r.ical.cycle();
    } catch (e) {
      messages.push(String(e), JSON.stringify(e));
    }
    await r.ical.stop();
    const all = JSON.stringify(r.logs) + messages.join("\n");
    expect(r.logs.length).toBeGreaterThan(0);
    for (const secret of [SECRET_DIR, "casa.ics", "trabajo.ics", SECRET_TITLE, "q7z9k"]) {
      expect(all, secret).not.toContain(secret);
    }
    // el motor sí recibió el título (es el dato)
    expect(JSON.stringify(r.calls)).toContain(SECRET_TITLE);
  }, 60_000);
});

describe("CA8 estado en archivo", () => {
  async function seed(): Promise<{ stateFile: string; items: Loose[] }> {
    const r = rig();
    await r.ical.cycle();
    await r.ical.idle();
    await r.ical.stop();
    return { stateFile: r.stateFile, items: last(r).items };
  }

  it("tras un ciclo el archivo existe con modo 600, sin la ruta secreta", async () => {
    const { stateFile } = await seed();
    expect(statSync(stateFile).mode & 0o777).toBe(0o600);
    const text = readFileSync(stateFile, "utf8");
    expect(() => JSON.parse(text) as unknown).not.toThrow();
    for (const secret of [SECRET_DIR, "casa.ics", "trabajo.ics", fake.base, "q7z9k"]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it("con el servidor apagado, start() entrega lo guardado antes de cualquier GET", async () => {
    const { stateFile, items } = await seed();
    fake.requests.length = 0;
    fake.offline = true;
    const r = rig(["casa", "trabajo"], { stateFile });
    r.ical.start();
    await sleep(500);
    await r.ical.stop();
    const first = r.calls[0];
    expect(first, "start() no entregó nada").toBeDefined();
    expect(first?.requestsSoFar).toBe(0);
    const idsOf = (list: Loose[] | undefined): string[] | undefined =>
      list?.map((e) => String(e.id)).sort();
    expect(idsOf(first?.items)).toEqual(idsOf(items));
  }, 30_000);

  it("un calendario que ya no está en el archivo de calendarios no se entrega", async () => {
    const { stateFile } = await seed();
    fake.offline = true;
    const r = rig(["casa"], { stateFile });
    r.ical.start();
    await sleep(500);
    await r.ical.stop();
    expect(r.calls.length).toBeGreaterThan(0);
    for (const c of r.calls) {
      expect(c.items.length).toBeGreaterThan(0);
      for (const e of c.items) expect(e.calendar).toBe("casa");
    }
  }, 30_000);

  it("un archivo dañado, o de más de 4 MiB, se ignora sin romper el arranque", async () => {
    const { stateFile } = await seed();
    const good = readFileSync(stateFile, "utf8");
    fake.offline = true;
    const broken = join(dir, "roto.json");
    writeFileSync(broken, "{no es json", { mode: 0o600 });
    const huge = join(dir, "enorme.json");
    writeFileSync(huge, good + " ".repeat(4 * 1024 * 1024 + 1), { mode: 0o600 });
    for (const file of [broken, huge]) {
      const r = rig(["casa", "trabajo"], { stateFile: file });
      r.ical.start();
      await sleep(400);
      await r.ical.stop();
      for (const c of r.calls) expect(c.items, file).toHaveLength(0);
    }
  }, 30_000);
});
