/* eslint-disable security/detect-non-literal-fs-filename -- temp folder of the test */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConfigError,
  loadDataFile,
  loadViewsConfig,
  parseDataFile,
  parseViewsConfig,
  type ViewsConfig,
} from "./config.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const VIEWS = join(REPO, "config/views.example.json");
const DATA = join(REPO, "config/data.example.json");

interface SlotJson {
  block: string;
  source: string;
  title?: string;
  options?: Record<string, unknown>;
}
interface ViewJson {
  id: string;
  title: string;
  grid: Record<string, unknown>;
  portrait?: unknown;
  slots: Record<string, SlotJson>;
  tab?: string[];
  colour?: string;
}
interface RootJson {
  version: number;
  timezone: string;
  theme: string;
  devices: Record<string, { views: string[] }>;
  views: ViewJson[];
}

const slot: SlotJson = { block: "task-list", source: "tareas" };
const baseView: ViewJson = {
  id: "v",
  title: "V",
  grid: { columns: [100], rows: [100], areas: [["a"]] },
  slots: { a: slot },
};
const baseViews: RootJson = {
  version: 1,
  timezone: "UTC",
  theme: "base",
  devices: { "*": { views: ["v"] } },
  views: [baseView],
};
const copy = (): RootJson => structuredClone(baseViews);
const first = (root: RootJson): ViewJson => root.views[0] ?? baseView;
const slotA = (root: RootJson): SlotJson => first(root).slots.a ?? slot;

function viewsError(mutate: (root: RootJson) => void): string {
  const root = copy();
  mutate(root);
  try {
    parseViewsConfig(JSON.stringify(root));
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error("it did not throw");
}

describe("the examples", () => {
  it("load without error", () => {
    const config = loadViewsConfig(VIEWS);
    const data = loadDataFile(DATA, config);
    expect(config.views.map((v) => v.id)).toEqual(["hoy", "pendientes", "agenda"]);
    expect(Object.keys(data.sources)).toEqual(["tareas", "jira", "calendario"]);
    expect(data.sources.jira?.readonly).toBe(true);
    expect(data.sources.tareas?.readonly).toBe(false);
    expect(config.views[1]?.slots.lista?.options).toEqual({ group_by: "category" });
  });
});

describe("parseViewsConfig", () => {
  it("names the JSON Pointer of each error", () => {
    const pointer = (mutate: (root: RootJson) => void): string => viewsError(mutate);
    expect(
      pointer((r) => {
        first(r).id = "h-oy";
      }),
    ).toContain("/views/0/id");
    expect(
      pointer((r) => {
        slotA(r).block = "clock";
      }),
    ).toContain("/views/0/slots/a/block");
    expect(
      pointer((r) => {
        Reflect.deleteProperty(r.devices, "*");
      }),
    ).toContain("/devices");
    expect(
      pointer((r) => {
        r.devices.p1 = { views: ["nope"] };
      }),
    ).toContain("/devices/p1/views/0");
    expect(
      pointer((r) => {
        first(r).grid = { columns: [60, 50], rows: [100], areas: [["a", "b"]] };
      }),
    ).toContain("/views/0/grid/columns");
    expect(
      pointer((r) => {
        first(r).grid = {
          columns: [50, 50],
          rows: [50, 50],
          areas: [
            ["a", "b"],
            ["b", "a"],
          ],
        };
      }),
    ).toContain("rectangle");
    expect(
      pointer((r) => {
        Reflect.deleteProperty(first(r).slots, "a");
      }),
    ).toContain("/views/0/slots/a");
    expect(
      pointer((r) => {
        first(r).slots.extra = slot;
      }),
    ).toContain("/views/0/slots/extra");
    expect(
      pointer((r) => {
        first(r).portrait = { columns: [100], rows: [100], areas: [["z"]] };
      }),
    ).toContain("/views/0/portrait");
    expect(
      pointer((r) => {
        first(r).colour = "red";
      }),
    ).toContain("/views/0/colour");
  });

  it("checks the rest of the schema", () => {
    const pointer = (mutate: (root: RootJson) => void): string => viewsError(mutate);
    expect(
      pointer((r) => {
        r.timezone = "Mars/Base";
      }),
    ).toContain("/timezone");
    expect(
      pointer((r) => {
        r.version = 2;
      }),
    ).toContain("/version");
    expect(
      pointer((r) => {
        slotA(r).options = { days: 3 };
      }),
    ).toContain("/options/days");
    expect(
      pointer((r) => {
        slotA(r).title = "";
      }),
    ).toContain("/title");
    expect(
      pointer((r) => {
        r.views.push(structuredClone(baseView));
      }),
    ).toContain("/views/1/id");
    expect(
      pointer((r) => {
        first(r).tab = ["a", "a"];
      }),
    ).toContain("/tab/1");
    expect(
      pointer((r) => {
        r.devices["Bad Id"] = { views: ["v"] };
      }),
    ).toContain("/devices/");
    expect(
      pointer((r) => {
        first(r).grid.columns = [50, 50];
      }),
    ).toContain("/views/0/grid");
  });

  it("accepts a valid minimal file and a tab list", () => {
    const root = copy();
    first(root).tab = ["a"];
    expect(parseViewsConfig(JSON.stringify(root)).views[0]?.tab).toEqual(["a"]);
  });

  it("keeps a slot called __proto__ as an own property", () => {
    const root = copy();
    const view = first(root);
    view.grid = { columns: [100], rows: [100], areas: [["__proto__"]] };
    view.slots = JSON.parse(`{"__proto__":${JSON.stringify(slot)}}`) as Record<string, SlotJson>;
    const parsed = parseViewsConfig(JSON.stringify(root));
    expect(Object.keys(parsed.views[0]?.slots ?? {})).toEqual(["__proto__"]);
  });

  it("rejects a file of 70 000 bytes without parsing it", () => {
    const text = `{"version":1,"pad":"${"x".repeat(70_000)}"`; // not even valid JSON
    expect(() => parseViewsConfig(text)).toThrow(/views: too large/);
  });

  it("rejects invalid JSON with only a fixed reason", () => {
    expect(() => parseViewsConfig("{ nope")).toThrow("views: /: invalid JSON");
  });
});

describe("parseDataFile", () => {
  const config: ViewsConfig = parseViewsConfig(JSON.stringify(baseViews));
  const data = (sources: unknown): string => JSON.stringify({ version: 1, sources });
  const task = (id: string, extra: object = {}): object => ({
    id,
    title: "Secreto",
    done: false,
    ...extra,
  });
  const tasks = (items: object[]): unknown => ({ tareas: { type: "tasks", items } });
  const withBlock = (block: string, source: string): ViewsConfig =>
    parseViewsConfig(
      JSON.stringify({ ...baseViews, views: [{ ...baseView, slots: { a: { block, source } } }] }),
    );

  function dataError(raw: string, cfg: ViewsConfig = config): string {
    try {
      parseDataFile(raw, cfg);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      return (error as ConfigError).message;
    }
    throw new Error("it did not throw");
  }

  it("accepts valid data", () => {
    const parsed = parseDataFile(
      data(tasks([task("t-1", { due: "2026-10-25", key: "P-1" })])),
      config,
    );
    expect(parsed.sources.tareas?.items).toHaveLength(1);
    expect(parsed.sources.tareas?.readonly).toBe(false);
  });

  it("fails when a view uses a missing source or one of another type", () => {
    expect(dataError(data({ otra: { type: "tasks", items: [] } }))).toContain(
      "/views/0/slots/a/source",
    );
    expect(dataError(data(tasks([])), withBlock("agenda", "tareas"))).toContain("another type");
  });

  it("fails on long titles, too many items, repeated ids and bad dates", () => {
    const long = "x".repeat(201);
    expect(dataError(data(tasks([{ id: "t", title: long, done: false }])))).toContain("/title");
    const many = Array.from({ length: 501 }, (_, i) => task(`t${i}`));
    expect(dataError(data(tasks(many)))).toContain("/sources/tareas/items");
    expect(dataError(data(tasks([task("a"), task("a")])))).toContain("repeated id");
    expect(dataError(data(tasks([task("a", { due: "2026-02-30" })])))).toContain("/due");
    expect(dataError(data(tasks([task("a", { colour: 1 })])))).toContain("unknown field");
    expect(dataError(data({ tareas: { type: "tasks", readonly: "yes", items: [] } }))).toContain(
      "/readonly",
    );
  });

  it("checks events: end before start, forms of date", () => {
    const agenda = withBlock("agenda", "cal");
    const events = (items: object[]): string => data({ cal: { type: "events", items } });
    expect(
      dataError(
        events([
          { id: "e", title: "T", start: "2026-10-23T10:00:00Z", end: "2026-10-23T09:00:00Z" },
        ]),
        agenda,
      ),
    ).toContain("before start");
    expect(dataError(events([{ id: "e", title: "T", start: "23/10/2026" }]), agenda)).toContain(
      "/start",
    );
    const ok = parseDataFile(events([{ id: "e", title: "T", start: "2026-10-23" }]), agenda);
    expect(ok.sources.cal?.type).toBe("events");
  });

  it("never puts a value of the file in a message", () => {
    const messages = [
      dataError(data(tasks([{ id: "t", title: "x".repeat(201), done: false }]))),
      dataError(data(tasks([task("a"), task("a")]))),
      dataError(data(tasks([task("a", { due: "no" })]))),
      dataError(data(tasks([task("a", { colour: 1 })]))),
    ];
    for (const message of messages) expect(message).not.toMatch(/Secreto|x{5}/);
    expect(messages[3]).toContain("unknown field");
  });

  it("rejects a file of 600 000 bytes", () => {
    expect(() => parseDataFile(" ".repeat(600_000), config)).toThrow("data: too large");
  });
});

describe("loading from disk", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "tintero-config-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads with a cap and hides the system error", () => {
    const big = join(dir, "big.json");
    writeFileSync(big, " ".repeat(65_537));
    expect(() => loadViewsConfig(big)).toThrow("views: too large");
    expect(() => loadViewsConfig(join(dir, "missing.json"))).toThrow("views: cannot be read");
    expect(() => loadDataFile(join(dir, "missing.json"), loadViewsConfig(VIEWS))).toThrow(
      "data: cannot be read",
    );
  });
});

describe("holidays in the views file (F-013)", () => {
  const withHolidays = (holidays: unknown): string => JSON.stringify({ ...copy(), holidays });
  const errorFor = (holidays: unknown): string => {
    try {
      parseViewsConfig(withHolidays(holidays));
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      return (error as ConfigError).message;
    }
    throw new Error("it did not throw");
  };

  it("loads a valid block, with the lists optional", () => {
    const full = parseViewsConfig(
      withHolidays({
        country: "CO",
        add: [{ date: "2026-12-24", name: "Nochebuena" }],
        remove: ["2026-01-12"],
      }),
    );
    expect(full.holidays).toEqual({
      country: "CO",
      add: [{ date: "2026-12-24", name: "Nochebuena" }],
      remove: ["2026-01-12"],
    });
    expect(parseViewsConfig(withHolidays({ country: "CO" })).holidays).toEqual({
      country: "CO",
      add: [],
      remove: [],
    });
    expect(parseViewsConfig(JSON.stringify(copy())).holidays).toBeUndefined();
    expect(loadViewsConfig(join(REPO, "config/tablero.views.example.json")).holidays?.country).toBe(
      "CO",
    );
  });

  it("points at the field that is wrong", () => {
    expect(errorFor({ country: "co" })).toContain("/holidays/country");
    expect(errorFor({})).toContain("/holidays/country");
    expect(errorFor({ country: "CO", add: [{ date: "2026-02-30", name: "x" }] })).toContain(
      "/holidays/add/0/date",
    );
    expect(errorFor({ country: "CO", add: [{ date: "2026-02-03", name: "" }] })).toContain(
      "/holidays/add/0/name",
    );
    expect(
      errorFor({ country: "CO", add: [{ date: "2026-02-03", name: "x", extra: 1 }] }),
    ).toContain("/holidays/add/0/extra");
    expect(errorFor({ country: "CO", remove: Array(51).fill("2026-01-12") })).toContain(
      "/holidays/remove",
    );
    expect(errorFor({ country: "CO", remove: ["2026-13-01"] })).toContain("/holidays/remove/0");
    expect(errorFor({ country: "CO", other: 1 })).toContain("/holidays/other");
  });
});
