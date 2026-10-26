import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadDataFile, loadViewsConfig } from "../engine/config.ts";
import {
  checkAgainstData,
  DEFAULT_COLUMNS,
  loadCalendars,
  loadIntegrations,
  parseCalendars,
  parseIntegrations,
} from "./config.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const good = {
  source: "tablero",
  baseUrl: "http://127.0.0.1:8080/etapi",
  keyFile: "/ruta/privada/k",
  boardNoteId: "abc123",
  allowWrite: true,
};
const wrap = (tasks: unknown): string =>
  JSON.stringify({ version: 1, integrations: { "trilium-tareas": tasks } });

function errorOf(raw: string): string {
  try {
    parseIntegrations(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  return "";
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tintero-cfg-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadIntegrations", () => {
  it("loads the example and fills the default columns", () => {
    const file = loadIntegrations(join(REPO, "config/integrations.example.json"));
    expect(file.integrations["trilium-tareas"]?.columns).toEqual(DEFAULT_COLUMNS);
  });

  it("rejects a file over 64 KiB", () => {
    const file = join(dir, "big.json");
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- temporary test folder
    writeFileSync(file, " ".repeat(65_537));
    expect(() => loadIntegrations(file)).toThrow(ConfigError);
    expect(() => loadIntegrations(join(dir, "nada.json"))).toThrow(ConfigError);
  });

  it("reports the JSON path and never the value", () => {
    expect(errorOf(wrap({ ...good, token: "secreto-1" }))).toContain(
      "/integrations/trilium-tareas/token",
    );
    const byPosition = errorOf(
      wrap({ ...good, columns: { "Por hacer": "todo", Hecho: "closed" } }),
    );
    expect(byPosition).toContain("/integrations/trilium-tareas/columns/1");
    expect(byPosition).not.toContain("Hecho");
    expect(byPosition).not.toContain("closed");
    expect(errorOf(wrap({ ...good, columns: { A: "todo", B: "doing" } }))).toContain("/columns");
    expect(errorOf(wrap({ ...good, columns: { A: "done", B: "doing" } }))).toContain("/columns");
    const bad = errorOf(wrap({ ...good, baseUrl: "http://192.168.1.10:8080/etapi" }));
    expect(bad).toContain("/integrations/trilium-tareas/baseUrl");
    expect(bad).not.toContain("192.168");
    const id = errorOf(wrap({ ...good, boardNoteId: "../x" }));
    expect(id).toContain("/integrations/trilium-tareas/boardNoteId");
    expect(id).not.toContain("../x");
    expect(errorOf(wrap({ ...good, keyFile: "relativa" }))).toContain("keyFile");
    expect(errorOf("{")).toContain("not valid JSON");
    expect(errorOf(JSON.stringify({ version: 2, integrations: {} }))).toContain("/version");
  });
});

describe("checkAgainstData", () => {
  const views = loadViewsConfig(join(REPO, "config/tablero.views.example.json"));
  const data = loadDataFile(join(REPO, "config/tablero.data.example.json"), views);
  const check = (tasks: unknown): void => {
    checkAgainstData(parseIntegrations(wrap(tasks)), data);
  };

  it("needs a tasks source and allowWrite opposite to readonly", () => {
    expect(() => {
      check(good);
    }).not.toThrow();
    expect(() => {
      check({ ...good, source: "nada" });
    }).toThrow("/integrations/trilium-tareas/source");
    expect(() => {
      check({ ...good, source: "calendario" });
    }).toThrow("/integrations/trilium-tareas/source");
    expect(() => {
      check({ ...good, allowWrite: false });
    }).toThrow("/integrations/trilium-tareas/allowWrite");
  });
});

describe("festivos entry (F-013)", () => {
  const wrapHolidays = (value: unknown): string =>
    JSON.stringify({ version: 1, integrations: { festivos: value } });

  it("takes the default base, an optional absolute state file and nothing else", () => {
    expect(parseIntegrations(wrapHolidays({})).integrations.festivos).toEqual({
      baseUrl: "https://date.nager.at",
    });
    expect(
      parseIntegrations(
        wrapHolidays({ baseUrl: "http://127.0.0.1:9000", stateFile: "/ruta/privada/f.json" }),
      ).integrations.festivos,
    ).toEqual({ baseUrl: "http://127.0.0.1:9000", stateFile: "/ruta/privada/f.json" });
  });

  it("rejects a base that is not https or loopback, a relative path and unknown fields", () => {
    expect(errorOf(wrapHolidays({ baseUrl: "http://ejemplo.org" }))).toContain(
      "/integrations/festivos/baseUrl",
    );
    expect(errorOf(wrapHolidays({ stateFile: "f.json" }))).toContain(
      "/integrations/festivos/stateFile",
    );
    expect(errorOf(wrapHolidays({ key: "x" }))).toContain("/integrations/festivos/key");
  });

  it("the example file loads", () => {
    const file = loadIntegrations(join(REPO, "config/integrations.example.json"));
    expect(file.integrations.festivos?.baseUrl).toBe("https://date.nager.at");
    expect(file.integrations["ical-calendario"]?.source).toBe("calendario");
  });
});

describe("calendars file (F-014)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const fileWith = (content: unknown, mode = 0o600): string => {
    const dir = mkdtempSync(join(tmpdir(), "tintero-cals-"));
    dirs.push(dir);
    const file = join(dir, "calendarios.json");
    /* eslint-disable security/detect-non-literal-fs-filename -- temp folder of the test */
    writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
    chmodSync(file, mode);
    /* eslint-enable security/detect-non-literal-fs-filename */
    return file;
  };
  const one = (extra: Record<string, unknown> = {}) => ({
    id: "casa",
    icon: "casa",
    url: "https://calendario.example/s/x.ics",
    ...extra,
  });
  const message = (run: () => unknown): string => {
    try {
      run();
    } catch (error) {
      return (error as Error).message;
    }
    return "";
  };
  const parse = (value: unknown): string => message(() => parseCalendars(JSON.stringify(value)));

  it("loads the example, turning webcal:// into https://", () => {
    const example = readFileSync(resolve(REPO, "config/calendarios.example.json"), "utf8");
    const list = loadCalendars(fileWith(example));
    expect(list.map((c) => c.id)).toEqual(["casa", "personal", "trabajo"]);
    expect(list[0]?.url).toBe("https://calendario.example/publico/casa.ics");
  });

  it("is treated as a key: mode 644 is key-permissions", () => {
    expect(() => loadCalendars(fileWith([one()], 0o644))).toThrow(
      expect.objectContaining({ code: "key-permissions" }),
    );
    expect(() => loadCalendars("/no/such/calendars.json")).toThrow(
      expect.objectContaining({ code: "key-missing" }),
    );
  });

  it("limits size, count and shape, with positions and no values", () => {
    expect(message(() => loadCalendars(fileWith("x".repeat(40_000))))).toBe(
      "calendars: /: file too large",
    );
    const eleven = Array.from({ length: 11 }, (_, i) => one({ id: `c${i}` }));
    expect(parse(eleven)).toContain("1 to 10");
    expect(parse([])).toContain("1 to 10");
    expect(parse([one(), one()])).toBe("calendars: /1/id: repeated id");
    const plain = parse([one({ url: "http://secreto.example/privado.ics" })]);
    expect(plain).toBe("calendars: /0/url: must be https:// or webcal://");
    expect(parse([one({ url: "https://a.example/x?t=1" })])).toBe(
      "calendars: /0/url: must be https:// or webcal://",
    );
    expect(parse([one({ extra: 1 })])).toBe("calendars: /0/extra: unknown field");
    expect(parse([one({ icon: "gato" })])).toContain("/0/icon");
    expect(parse([one({ id: "Mi Cal" })])).toContain("/0/id");
    expect(parseCalendars(JSON.stringify([one({ url: "webcal://a.example/x.ics" })]))).toHaveLength(
      1,
    );
  });

  it("is declared in the integrations file and its source must be events", () => {
    const parsed = parseIntegrations(
      JSON.stringify({
        version: 1,
        integrations: {
          "ical-calendario": { source: "calendario", calendarsFile: "/ruta/privada/c.json" },
        },
      }),
    );
    expect(parsed.integrations["ical-calendario"]?.calendarsFile).toBe("/ruta/privada/c.json");
    const bad = JSON.stringify({
      version: 1,
      integrations: { "ical-calendario": { source: "calendario", calendarsFile: "relativo" } },
    });
    expect(errorOf(bad)).toContain("/integrations/ical-calendario/calendarsFile");
    const data = {
      version: 1 as const,
      sources: { calendario: { type: "tasks" as const, readonly: true, items: [] } },
    };
    expect(() => {
      checkAgainstData(parsed, data);
    }).toThrow(
      "integrations: /integrations/ical-calendario/source: must be a source of type events",
    );
  });
});
