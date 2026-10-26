// Public holidays from Nager.Date (F-013, ADR-0052): one read per country and year, kept in a file.
// Never blocks drawing or start-up. Logs carry the year, the status and counts, never the names.
import { open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { Engine } from "../engine/engine.ts";
import { localParts, validDate, validDateTime } from "../engine/dates.ts";
import type { Holiday } from "../engine/holidays.ts";
import { readCapped } from "../tls.ts";
import { IntegrationHttpError, type GuardedHttp } from "./http.ts";
import { holidaysManifest } from "./manifest.ts";

type Log = (line: Record<string, unknown>) => void;

const INTEGRATION = "festivos";
const MAX_BYTES = 65_536; // the answer and the cache file
const MAX_NAME = 60;
const MAX_ITEMS = 400;
const VALID_FOR_MS = 30 * 24 * 3_600_000;
const RETRY_MS = 3_600_000;
const UNKNOWN_MS = 24 * 3_600_000;
const COUNTRY = /^[A-Z]{2}$/;
const YEAR = /^\d{4}$/;

/** Limits the guarded client must be built with for this integration. */
export const HOLIDAYS_HTTP_LIMITS = { maxBytes: MAX_BYTES, timeoutMs: 5000 } as const;

interface YearEntry {
  readAt: Date;
  items: Holiday[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const cut = (text: string): string => Array.from(text).slice(0, MAX_NAME).join("");

/** Nager.Date answer → the global, public holidays (R5); anything else in the answer is dropped. */
export function parseNager(json: unknown): Holiday[] {
  if (!Array.isArray(json) || json.length > MAX_ITEMS) throw new IntegrationHttpError("bad-json");
  const out: Holiday[] = [];
  for (const entry of json as unknown[]) {
    if (!isObj(entry)) throw new IntegrationHttpError("bad-json");
    const { date, localName, global, types } = entry;
    if (global !== true || !Array.isArray(types) || !types.includes("Public")) continue;
    if (typeof date !== "string" || !validDate(date) || typeof localName !== "string") continue;
    const name = cut(localName.trim());
    if (name !== "") out.push({ date, name });
  }
  return out;
}

function shapeItems(value: unknown): Holiday[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return undefined;
  const out: Holiday[] = [];
  for (const entry of value as unknown[]) {
    if (!isObj(entry)) return undefined;
    const { date, name } = entry;
    if (typeof date !== "string" || !validDate(date)) return undefined;
    if (typeof name !== "string" || name.length < 1 || name.length > MAX_NAME) return undefined;
    out.push({ date, name });
  }
  return out;
}

/** Never throws: a missing, big, broken or foreign file gives an empty cache (as in ADR-0044). */
function loadCache(file: string | undefined, country: string): Map<number, YearEntry> {
  const years = new Map<number, YearEntry>();
  if (file === undefined) return years;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readCapped(file, MAX_BYTES).toString("utf8"));
  } catch {
    return years;
  }
  if (!isObj(parsed) || parsed.version !== 1 || parsed.country !== country) return years;
  if (!isObj(parsed.years) || Object.keys(parsed.years).length > 8) return years;
  for (const [key, value] of Object.entries(parsed.years)) {
    if (!YEAR.test(key) || !isObj(value)) return new Map();
    const readAt = value.readAt;
    const items = shapeItems(value.items);
    if (typeof readAt !== "string" || !validDateTime(readAt) || items === undefined) {
      return new Map();
    }
    years.set(Number(key), { readAt: new Date(readAt), items });
  }
  return years;
}

/** Atomic: temporary file (600) + fsync + rename. Throws if it cannot. */
async function saveCache(file: string, text: string): Promise<void> {
  const temp = `${file}.tmp-${process.pid}`;
  try {
    /* eslint-disable security/detect-non-literal-fs-filename -- path from the owner's configuration */
    await rm(temp, { force: true });
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.chmod(0o600);
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
    const dir = await open(dirname(file), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
    /* eslint-enable security/detect-non-literal-fs-filename */
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export interface Holidays {
  start(): void;
  cycle(): Promise<void>;
  idle(): Promise<void>;
  stop(): Promise<void>;
}

export function createHolidays(options: {
  http: GuardedHttp;
  country: string;
  engine: Pick<Engine, "setHolidays">;
  stateFile?: string;
  clock?: () => Date;
  log?: Log;
  /** Zone of "the local year of today"; UTC when not given. */
  timeZone?: string;
}): Holidays {
  const { http, country, engine, stateFile } = options;
  if (!COUNTRY.test(country)) throw new IntegrationHttpError("bad-path");
  const clock = options.clock ?? ((): Date => new Date());
  const rawLog = options.log ?? ((): void => undefined);
  const zone = options.timeZone ?? "UTC";
  const log: Log = (line) => {
    rawLog({ ts: clock().toISOString(), integration: INTEGRATION, ...line });
  };

  const years = loadCache(stateFile, country);
  const retryAt = new Map<number, number>(); // after an error: not before this instant
  const unknownUntil = new Map<number, number>(); // after a 404: not before this instant
  const flags = { stopped: false, unknownLogged: false };
  let timer: NodeJS.Timeout | undefined;

  const merged = (): Holiday[] =>
    [...years.values()]
      .flatMap((entry) => entry.items)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const deliver = (): void => {
    if (years.size > 0) engine.setHolidays(merged());
  };

  let saving: Promise<void> = Promise.resolve();
  function persist(): void {
    if (stateFile === undefined) return;
    const body = {
      version: 1,
      country,
      years: Object.fromEntries(
        [...years].map(([year, entry]) => [
          String(year),
          { readAt: entry.readAt.toISOString(), items: entry.items },
        ]),
      ),
    };
    const text = JSON.stringify(body);
    // The cache must stay inside the cap it is loaded with; older years go first.
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) return;
    saving = saving
      .then(() => saveCache(stateFile, text))
      .catch(() => {
        log({ event: "error", year: 0, code: "state-write" });
      });
  }

  let tail: Promise<void> = Promise.resolve();
  let active = 0;
  function enqueue(job: () => Promise<void>): Promise<void> {
    active++;
    const run = tail.then(() => (flags.stopped ? undefined : job())).catch(() => undefined);
    tail = run.finally(() => {
      active--;
    });
    return run;
  }

  /** The years wanted now: the local year, and the next one from 1 December. */
  function wanted(now: Date): number[] {
    const today = localParts(now, zone).day;
    return today.m === 12 ? [today.y, today.y + 1] : [today.y];
  }

  async function readYear(year: number, now: Date): Promise<boolean> {
    const have = years.get(year);
    if (have !== undefined && now.getTime() - have.readAt.getTime() < VALID_FOR_MS) return false;
    if ((unknownUntil.get(year) ?? 0) > now.getTime()) return false;
    if ((retryAt.get(year) ?? 0) > now.getTime()) return false;
    try {
      const answer = await http.request("GET", `/api/v3/PublicHolidays/${year}/${country}`);
      const items = parseNager(answer.json);
      if (flags.stopped) return false;
      years.set(year, { readAt: now, items });
      retryAt.delete(year);
      unknownUntil.delete(year);
      log({ event: "read", year, status: answer.status, items: items.length });
      return true;
    } catch (error) {
      if (flags.stopped) return false;
      const status = error instanceof IntegrationHttpError ? error.httpStatus : undefined;
      if (status === 404) {
        unknownUntil.set(year, now.getTime() + UNKNOWN_MS);
        if (!flags.unknownLogged) {
          flags.unknownLogged = true;
          log({ event: "unknown-country", year, status });
        }
        return false;
      }
      retryAt.set(year, now.getTime() + RETRY_MS);
      log({
        event: "error",
        year,
        ...(status === undefined ? {} : { status }),
        code: error instanceof IntegrationHttpError ? error.code : "error",
      });
      return false;
    }
  }

  async function runCycle(): Promise<void> {
    const now = clock();
    let changed = false;
    const list = wanted(now);
    for (const year of list) {
      if (flags.stopped) return;
      if (await readYear(year, now)) changed = true;
    }
    for (const year of [...years.keys()]) {
      if (year < Math.min(...list)) years.delete(year);
    }
    if (changed) {
      deliver();
      persist();
    }
  }

  const schedule = (): void => {
    if (flags.stopped) return;
    enqueue(runCycle)
      .then(() => {
        if (flags.stopped) return;
        timer = setTimeout(schedule, holidaysManifest.pollS * 1000);
        timer.unref();
      })
      .catch(() => undefined);
  };

  return {
    start() {
      for (const [year, entry] of years) log({ event: "cached", year, items: entry.items.length });
      deliver();
      schedule();
    },
    cycle: () => enqueue(runCycle),
    async idle() {
      for (;;) {
        while (active > 0) await tail;
        await saving;
        if (active === 0) return;
      }
    },
    async stop() {
      flags.stopped = true;
      if (timer) clearTimeout(timer);
      while (active > 0) await tail;
      await saving;
    },
  };
}
