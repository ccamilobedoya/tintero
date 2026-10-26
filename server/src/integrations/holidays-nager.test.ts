/* eslint-disable security/detect-non-literal-fs-filename -- temp folder of the test */
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Holiday } from "../engine/holidays.ts";
import { createHolidays, HOLIDAYS_HTTP_LIMITS, parseNager } from "./holidays-nager.ts";
import { guardedHttp } from "./http.ts";
import { holidaysManifest } from "./manifest.ts";

const entry = (date: string, localName: string, extra: Record<string, unknown> = {}) => ({
  date,
  localName,
  name: localName,
  countryCode: "CO",
  fixed: false,
  global: true,
  counties: null,
  launchYear: null,
  types: ["Public"],
  ...extra,
});
const YEAR_2026 = [
  entry("2026-01-01", "Año Nuevo"),
  entry("2026-10-12", "Día de la Raza"),
  entry("2026-11-02", "Dia de los Santos"),
  entry("2026-12-25", "Navidad"),
];

interface Fake {
  base: URL;
  urls: string[];
  auth: (string | undefined)[];
  answers: Map<string, { status: number; body: string | Buffer }>;
  offline: boolean;
  close(): Promise<void>;
}

async function startFake(): Promise<Fake> {
  const fake: Fake = {
    base: new URL("http://127.0.0.1:1"),
    urls: [],
    auth: [],
    answers: new Map(),
    offline: false,
    close: () => Promise.resolve(),
  };
  const server: Server = createServer((req, res) => {
    fake.urls.push(req.url ?? "");
    fake.auth.push(req.headers.authorization);
    if (fake.offline) {
      req.socket.destroy();
      return;
    }
    const found = fake.answers.get(req.url ?? "");
    res.writeHead(found?.status ?? 404, { "content-type": "application/json" });
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

let fake: Fake;
let dir: string;
let lines: Record<string, unknown>[];
let delivered: Holiday[][];
const clock = { now: new Date("2026-10-25T20:00:00Z") };
const engine = {
  setHolidays: (items: unknown) => {
    delivered.push(items as Holiday[]);
    return { ok: true as const, changed: true };
  },
};

beforeEach(async () => {
  fake = await startFake();
  dir = mkdtempSync(join(tmpdir(), "tintero-festivos-"));
  lines = [];
  delivered = [];
  clock.now = new Date("2026-10-25T20:00:00Z");
  fake.answers.set("/api/v3/PublicHolidays/2026/CO", {
    status: 200,
    body: JSON.stringify(YEAR_2026),
  });
});
afterEach(async () => {
  await fake.close();
  rmSync(dir, { recursive: true, force: true });
});

function make(options: { country?: string; stateFile?: string } = {}) {
  const http = guardedHttp(fake.base, undefined, holidaysManifest, HOLIDAYS_HTTP_LIMITS);
  return createHolidays({
    http,
    country: options.country ?? "CO",
    engine,
    ...(options.stateFile === undefined ? {} : { stateFile: options.stateFile }),
    clock: () => clock.now,
    log: (line) => lines.push(line),
  });
}

describe("parseNager (R5)", () => {
  it("keeps global public holidays, cuts the name and drops the rest", () => {
    const out = parseNager([
      entry("2026-01-01", "x".repeat(80)),
      entry("2026-01-02", "Regional", { global: false }),
      entry("2026-01-03", "Banco", { types: ["Bank"] }),
      entry("2026-01-04", "Mixto", { types: ["Bank", "Public"] }),
    ]);
    expect(out).toEqual([
      { date: "2026-01-01", name: "x".repeat(60) },
      { date: "2026-01-04", name: "Mixto" },
    ]);
  });

  it("rejects what is not a list", () => {
    expect(() => parseNager({})).toThrow();
    expect(() => parseNager([1])).toThrow();
  });
});

describe("createHolidays", () => {
  it("reads the local year once, delivers it and saves it with mode 600 (CA12)", async () => {
    const stateFile = join(dir, "festivos.json");
    const holidays = make({ stateFile });
    await holidays.cycle();
    await holidays.idle();
    expect(fake.urls).toEqual(["/api/v3/PublicHolidays/2026/CO"]);
    expect(fake.auth).toEqual([undefined]);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toHaveLength(4);
    expect(statSync(stateFile).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(readFileSync(stateFile, "utf8")) as Record<string, unknown>;
    expect(saved).toMatchObject({ version: 1, country: "CO" });
    await holidays.cycle(); // fresh: nothing to ask
    expect(fake.urls).toHaveLength(1);
    await holidays.stop();
  });

  it("asks also for the next year from 1 December", async () => {
    clock.now = new Date("2026-12-01T15:00:00Z");
    fake.answers.set("/api/v3/PublicHolidays/2027/CO", {
      status: 200,
      body: JSON.stringify([entry("2027-01-01", "Año Nuevo")]),
    });
    const holidays = make();
    await holidays.cycle();
    expect(fake.urls).toEqual(["/api/v3/PublicHolidays/2026/CO", "/api/v3/PublicHolidays/2027/CO"]);
    expect(delivered.at(-1)).toHaveLength(5);
    expect(delivered.at(-1)?.at(-1)?.date).toBe("2027-01-01");
    await holidays.stop();
  });

  it("starts from the file without asking, and keeps it when a renewal fails (CA13)", async () => {
    const stateFile = join(dir, "festivos.json");
    const first = make({ stateFile });
    await first.cycle();
    await first.idle();
    await first.stop();
    fake.urls.length = 0;
    delivered = [];
    fake.offline = true;

    const second = make({ stateFile });
    second.start();
    await second.idle();
    expect(delivered[0]).toHaveLength(4);
    expect(fake.urls).toHaveLength(0);
    await second.stop();

    clock.now = new Date("2026-11-25T20:00:01Z"); // over 30 days later
    delivered = [];
    const third = make({ stateFile });
    third.start();
    await third.idle();
    expect(delivered[0]).toHaveLength(4);
    expect(fake.urls).toHaveLength(1);
    expect(lines.some((line) => line.event === "error")).toBe(true);
    expect(delivered).toHaveLength(1);
    await third.stop();
  });

  it("ignores a cache that is broken, big, or from another country (R6)", async () => {
    const stateFile = join(dir, "festivos.json");
    for (const text of [
      "no json",
      JSON.stringify({ version: 1, country: "PE", years: {} }),
      JSON.stringify({
        version: 1,
        country: "CO",
        years: { "2026": { readAt: "no", items: [] } },
      }),
      " ".repeat(70_000),
    ]) {
      writeFileSync(stateFile, text);
      delivered = [];
      const holidays = make({ stateFile });
      holidays.start();
      await holidays.idle();
      expect(delivered).toHaveLength(1); // only what the read brought
      await holidays.stop();
    }
  });

  it("does not deliver anything new when the answer is too big (CA14)", async () => {
    fake.answers.set("/api/v3/PublicHolidays/2026/CO", {
      status: 200,
      body: Buffer.alloc(65_537, 32),
    });
    const holidays = make();
    await holidays.cycle();
    expect(delivered).toHaveLength(0);
    expect(lines.find((line) => line.event === "error")).toMatchObject({ code: "too-large" });
    await holidays.stop();
  });

  it("registers an unknown country once and does not ask again for 24 h (CA15)", async () => {
    fake.answers.clear();
    const holidays = make({ country: "XX" });
    await holidays.cycle();
    expect(lines.filter((line) => line.event === "unknown-country")).toHaveLength(1);
    expect(fake.urls).toEqual(["/api/v3/PublicHolidays/2026/XX"]);
    clock.now = new Date("2026-10-25T21:00:00Z");
    await holidays.cycle();
    expect(fake.urls).toHaveLength(1);
    clock.now = new Date("2026-10-26T21:00:00Z");
    await holidays.cycle();
    expect(fake.urls).toHaveLength(2);
    expect(lines.filter((line) => line.event === "unknown-country")).toHaveLength(1);
    expect(delivered).toHaveLength(0);
    await holidays.stop();
  });

  it("retries a failed read after one hour, not before", async () => {
    fake.offline = true;
    const holidays = make();
    await holidays.cycle();
    clock.now = new Date("2026-10-25T20:30:00Z");
    await holidays.cycle();
    expect(fake.urls).toHaveLength(1);
    fake.offline = false;
    clock.now = new Date("2026-10-25T21:00:01Z");
    await holidays.cycle();
    expect(fake.urls).toHaveLength(2);
    expect(delivered).toHaveLength(1);
    await holidays.stop();
  });

  it("never logs a holiday name (CA18)", async () => {
    const stateFile = join(dir, "festivos.json");
    const holidays = make({ stateFile });
    holidays.start();
    await holidays.idle();
    await holidays.cycle();
    await holidays.stop();
    const text = JSON.stringify(lines);
    for (const item of YEAR_2026) expect(text).not.toContain(item.localName);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.integration).toBe("festivos");
  });

  it("refuses a country that is not two capital letters", () => {
    expect(() => make({ country: "../x" })).toThrow();
  });
});
