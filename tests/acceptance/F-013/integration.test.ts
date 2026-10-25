/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, security/detect-non-literal-fs-filename -- JSON de prueba y carpetas temporales propias */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHolidays } from "../../../server/src/integrations/holidays-nager.ts";
import { triliumTasksManifest } from "../../../server/src/integrations/manifest.ts";
import {
  fixture,
  festivosManifest,
  guardedHttp13,
  nagerCo2026,
  nagerCo2027,
  nagerPath,
  rmDir,
  startNager,
  tmpDir,
  type FakeNager,
  type Loose,
} from "./helpers.ts";

type Line = Record<string, unknown>;

let fake: FakeNager;
let dir: string;
const dirs: string[] = [];

beforeEach(async () => {
  fake = await startNager();
  dir = tmpDir("tintero-f013-");
  dirs.push(dir);
  fake.routes.set(nagerPath(2026, "CO"), { status: 200, body: fixture("nager-CO-2026.json") });
  fake.routes.set(nagerPath(2027, "CO"), { status: 200, body: fixture("nager-CO-2027.json") });
});
afterEach(async () => {
  await fake.close();
});
afterAll(() => {
  for (const d of dirs) rmDir(d);
});

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

interface Rig {
  h: ReturnType<typeof createHolidays>;
  calls: { items: Loose[]; readAt: Date | undefined }[];
  logs: Line[];
  now: { t: Date };
  stateFile: string;
}

function rig(
  iso: string,
  opts: { country?: string; stateFile?: string; maxBytes?: number } = {},
): Rig {
  const now = { t: new Date(iso) };
  const calls: Rig["calls"] = [];
  const logs: Line[] = [];
  const stateFile = opts.stateFile ?? join(dir, "festivos.json");
  const http = guardedHttp13(fake.base, undefined, festivosManifest, {
    maxBytes: opts.maxBytes ?? 65_536,
    timeoutMs: 5000,
    log: (l) => logs.push(l),
    clock: () => new Date(now.t),
  });
  const engine = {
    setHolidays: (items: unknown, meta?: { readAt?: Date }) => {
      calls.push({ items: items as Loose[], readAt: meta?.readAt });
      return { ok: true as const, changed: true };
    },
  };
  const h = createHolidays({
    http,
    country: opts.country ?? "CO",
    engine,
    stateFile,
    clock: () => new Date(now.t),
    log: (l) => logs.push(l),
  });
  return { h, calls, logs, now, stateFile };
}

const paths = (): string[] => fake.requests.map((r) => r.path);

describe("CA12 primer ciclo", () => {
  it("pide solo 2026/CO, entrega 19 y escribe el stateFile con modo 600", async () => {
    const r = rig("2026-10-25T20:00:00Z");
    await r.h.cycle();
    expect(paths()).toEqual(["/api/v3/PublicHolidays/2026/CO"]);
    expect(fake.requests[0]?.authorization).toBeUndefined();
    expect(r.calls.length).toBeGreaterThanOrEqual(1);
    const last = r.calls[r.calls.length - 1];
    expect(last?.items).toHaveLength(19);
    expect(last?.items[0]).toEqual({ date: "2026-01-01", name: "Año Nuevo" });
    expect(statSync(r.stateFile).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(readFileSync(r.stateFile, "utf8"));
    expect(saved.version).toBe(1);
    expect(saved.country).toBe("CO");
    expect(saved.years["2026"].items).toHaveLength(19);
    expect(Number.isNaN(Date.parse(saved.years["2026"].readAt))).toBe(false);
    await r.h.stop();
  });

  it("desde el 1 de diciembre pide 2026 y 2027", async () => {
    const r = rig("2026-12-01T15:00:00Z");
    await r.h.cycle();
    expect([...paths()].sort()).toEqual([
      "/api/v3/PublicHolidays/2026/CO",
      "/api/v3/PublicHolidays/2027/CO",
    ]);
    const dates = (r.calls[r.calls.length - 1]?.items ?? []).map((i) => i.date);
    expect(dates).toContain("2026-12-25");
    expect(dates).toContain("2027-01-01");
    await r.h.stop();
  });

  it("el 30 de noviembre solo pide el año en curso", async () => {
    const r = rig("2026-11-30T15:00:00Z");
    await r.h.cycle();
    expect(paths()).toEqual(["/api/v3/PublicHolidays/2026/CO"]);
    await r.h.stop();
  });
});

describe("CA13 caché en archivo", () => {
  async function seed(): Promise<string> {
    const r = rig("2026-10-25T20:00:00Z");
    await r.h.cycle();
    await r.h.stop();
    return r.stateFile;
  }

  it("con el servidor apagado, start() entrega las 19 sin pedir nada", async () => {
    const file = await seed();
    fake.requests.length = 0;
    fake.offline = true;
    const r = rig("2026-10-26T20:00:00Z", { stateFile: file });
    r.h.start();
    await r.h.idle();
    for (let i = 0; i < 40 && r.calls.length === 0; i++) await sleep(50);
    expect(r.calls[r.calls.length - 1]?.items).toHaveLength(19);
    expect(fake.requests).toHaveLength(0);
    await r.h.stop();
  });

  it("una entrada de hace 31 días se vuelve a pedir; si falla sigue con las 19 y registra error", async () => {
    const file = await seed();
    const saved = JSON.parse(readFileSync(file, "utf8"));
    saved.years["2026"].readAt = new Date(
      Date.parse("2026-10-25T20:00:00Z") - 31 * 86_400_000,
    ).toISOString();
    writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
    fake.requests.length = 0;
    fake.offline = true;
    const r = rig("2026-10-25T20:00:00Z", { stateFile: file });
    r.h.start();
    await r.h.idle();
    for (let i = 0; i < 40 && r.calls.length === 0; i++) await sleep(50);
    expect(fake.requests.length).toBeGreaterThanOrEqual(1);
    expect(r.calls.length).toBeGreaterThanOrEqual(1);
    for (const c of r.calls) expect(c.items).toHaveLength(19);
    expect(r.logs.some((l) => l.integration === "festivos" && l.event === "error")).toBe(true);
    await r.h.stop();
  });

  it("un archivo dañado o de otro país se ignora: el ciclo pide y entrega", async () => {
    const file = join(dir, "malo.json");
    writeFileSync(file, "{no es json", { mode: 0o600 });
    const r = rig("2026-10-25T20:00:00Z", { stateFile: file });
    await r.h.cycle();
    expect(paths()).toEqual(["/api/v3/PublicHolidays/2026/CO"]);
    expect(r.calls[r.calls.length - 1]?.items).toHaveLength(19);
    await r.h.stop();

    const other = join(dir, "otro.json");
    writeFileSync(
      other,
      JSON.stringify({
        version: 1,
        country: "PE",
        years: {
          "2026": {
            readAt: "2026-10-25T19:00:00Z",
            items: [{ date: "2026-07-28", name: "Fiestas Patrias" }],
          },
        },
      }),
      { mode: 0o600 },
    );
    fake.requests.length = 0;
    const r2 = rig("2026-10-25T20:00:00Z", { stateFile: other });
    await r2.h.cycle();
    expect(paths()).toEqual(["/api/v3/PublicHolidays/2026/CO"]);
    expect(r2.calls.every((c) => c.items.every((i) => i.name !== "Fiestas Patrias"))).toBe(true);
    await r2.h.stop();
  });
});

describe("CA14 tamaño y filtros", () => {
  it("65 537 bytes → too-large y no se entregan datos nuevos", async () => {
    fake.routes.set(nagerPath(2026, "CO"), { status: 200, body: Buffer.alloc(65_537, 0x20) });
    const r = rig("2026-10-25T20:00:00Z");
    await r.h.cycle();
    expect(r.calls.filter((c) => c.items.length > 0)).toHaveLength(0);
    expect(JSON.stringify(r.logs)).toContain("too-large");
    expect(r.logs.some((l) => l.event === "error")).toBe(true);
    await r.h.stop();
  });

  it("65 536 bytes exactos sí se aceptan", async () => {
    const base = JSON.stringify(nagerCo2026());
    // relleno con espacios dentro de un JSON válido hasta los 65 536 bytes
    const pad = 65_536 - Buffer.byteLength(base);
    expect(pad).toBeGreaterThan(0);
    fake.routes.set(nagerPath(2026, "CO"), { status: 200, body: base + " ".repeat(pad) });
    const r = rig("2026-10-25T20:00:00Z");
    await r.h.cycle();
    expect(r.calls[r.calls.length - 1]?.items).toHaveLength(19);
    await r.h.stop();
  });

  it("descarta global:false y types Bank; recorta localName a 60", async () => {
    const list = nagerCo2026();
    list.push({ ...list[0], date: "2026-09-09", localName: "Regional", global: false });
    list.push({ ...list[0], date: "2026-09-10", localName: "Banco", types: ["Bank"] });
    list.push({
      ...list[0],
      date: "2026-09-11",
      localName: "y".repeat(80),
      types: ["Public", "Bank"],
    });
    fake.routes.set(nagerPath(2026, "CO"), { status: 200, body: JSON.stringify(list) });
    const r = rig("2026-10-25T20:00:00Z");
    await r.h.cycle();
    const items = r.calls[r.calls.length - 1]?.items ?? [];
    const dates = items.map((i) => i.date);
    expect(dates).not.toContain("2026-09-09");
    expect(dates).not.toContain("2026-09-10");
    expect(items).toHaveLength(20);
    const long = items.find((i) => i.date === "2026-09-11");
    expect(long).toEqual({ date: "2026-09-11", name: "y".repeat(60) });
    for (const i of items) expect(Object.keys(i).sort()).toEqual(["date", "name"]);
    await r.h.stop();
  });
});

describe("CA15 país desconocido", () => {
  it("404: un solo registro; 1 h después nada; 25 h después otra petición", async () => {
    const r = rig("2026-10-25T20:00:00Z", { country: "XX" });
    const unknown = (): number => r.logs.filter((l) => l.event === "unknown-country").length;
    await r.h.cycle();
    expect(paths()).toEqual(["/api/v3/PublicHolidays/2026/XX"]);
    expect(unknown()).toBe(1);

    r.now.t = new Date("2026-10-25T21:00:00Z");
    await r.h.cycle();
    expect(fake.requests).toHaveLength(1);
    expect(unknown()).toBe(1);

    r.now.t = new Date("2026-10-26T21:00:00Z");
    await r.h.cycle();
    expect(fake.requests).toHaveLength(2);
    await r.h.stop();
  });
});

describe("CA16 cliente con guardia", () => {
  it("festivos sin keyFile: la petición sale sin Authorization", async () => {
    const http = guardedHttp13(fake.base, undefined, festivosManifest, { maxBytes: 65_536 });
    const res = await http.request("GET", nagerPath(2026, "CO"));
    expect(res.status).toBe(200);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.authorization).toBeUndefined();
  });

  it("trilium-tareas sin keyFile → key-missing", async () => {
    let code: unknown;
    try {
      const http = guardedHttp13(fake.base, undefined, triliumTasksManifest);
      await http.request("GET", "/notes/abc");
    } catch (e) {
      code = (e as { code?: unknown }).code;
    }
    expect(code).toBe("key-missing");
    expect(fake.requests).toHaveLength(0);
  });

  it("baseUrl http://ejemplo.org → host", async () => {
    let code: unknown;
    try {
      const http = guardedHttp13("http://ejemplo.org", undefined, festivosManifest);
      await http.request("GET", nagerPath(2026, "CO"));
    } catch (e) {
      code = (e as { code?: unknown }).code;
    }
    expect(code).toBe("host");
  });

  it("otra ruta que no sea PublicHolidays → route; PATCH → route o write-denied", async () => {
    const http = guardedHttp13(fake.base, undefined, festivosManifest);
    for (const p of ["/api/v3/Version", "/api/v3/NextPublicHolidays/CO"]) {
      let code: unknown;
      try {
        await http.request("GET", p);
      } catch (e) {
        code = (e as { code?: unknown }).code;
      }
      expect(code, p).toBe("route");
    }
    let patch: unknown;
    try {
      await http.request("PATCH", nagerPath(2026, "CO"), {});
    } catch (e) {
      patch = (e as { code?: unknown }).code;
    }
    expect(["route", "write-denied"]).toContain(patch);
    expect(fake.requests).toHaveLength(0);
  });
});

describe("CA18 registros", () => {
  it("nada de lo registrado contiene un localName", async () => {
    const names = [...nagerCo2026(), ...nagerCo2027()].map((h) => String(h.localName));
    // ciclo normal, ciclo desde caché, fallo de red, tamaño y 404
    const ok = rig("2026-12-01T15:00:00Z");
    await ok.h.cycle();
    await ok.h.stop();
    const cached = rig("2026-12-02T15:00:00Z", { stateFile: ok.stateFile });
    cached.h.start();
    await cached.h.idle();
    await cached.h.stop();
    fake.offline = true;
    const failing = rig("2027-01-20T15:00:00Z", { stateFile: join(dir, "otro.json") });
    await failing.h.cycle();
    await failing.h.stop();
    fake.offline = false;
    fake.routes.set(nagerPath(2026, "CO"), { status: 200, body: Buffer.alloc(70_000, 0x20) });
    const big = rig("2026-10-25T20:00:00Z", { stateFile: join(dir, "grande.json") });
    await big.h.cycle();
    await big.h.stop();
    const nf = rig("2026-10-25T20:00:00Z", { country: "XX", stateFile: join(dir, "xx.json") });
    await nf.h.cycle();
    await nf.h.stop();

    const all = [...ok.logs, ...cached.logs, ...failing.logs, ...big.logs, ...nf.logs];
    expect(all.length).toBeGreaterThan(0);
    const text = JSON.stringify(all);
    for (const n of names) expect(text, n).not.toContain(n);
    expect(text).not.toContain("Navidad");
    expect(all.some((l) => l.integration === "festivos" && l.event === "read")).toBe(true);
    for (const l of all.filter((x) => x.integration === "festivos" && "event" in x)) {
      expect(["read", "cached", "error", "unknown-country"]).toContain(l.event);
    }
  });
});
