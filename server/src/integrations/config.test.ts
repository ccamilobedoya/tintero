import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadDataFile, loadViewsConfig } from "../engine/config.ts";
import {
  checkAgainstData,
  DEFAULT_COLUMNS,
  loadIntegrations,
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
  });
});
