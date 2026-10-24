/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, security/detect-object-injection -- JSON de prueba */
import { describe, expect, it } from "vitest";
import { ConfigError, parseDataFile, parseViewsConfig } from "../../../server/src/engine/index.ts";
import {
  cfg6,
  cfgFrom,
  data6Text,
  dataText,
  edited,
  fakeRenderer,
  mkEngine,
  mkEngine6,
  setSourceAt,
  stageOf,
  staleLabel,
  tableroItems,
  views6Text,
  type Loose,
} from "./helpers.ts";

function message(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return (e as ConfigError).message;
  }
  throw new Error("no lanzó ConfigError");
}

describe("CA1 compatibilidad", () => {
  it("los datos de F-005 cargan; stageOf: t-002 done, las demás de tareas todo", () => {
    const config = cfgFrom();
    const data = parseDataFile(dataText(), config) as Loose;
    const items = data.sources.tareas.items as Loose[];
    expect(items.length).toBeGreaterThan(1);
    for (const t of items)
      expect(stageOf(t), String(t.id)).toBe(t.id === "t-002" ? "done" : "todo");
  });

  it("stageOf con stage explícito", () => {
    expect(stageOf({ id: "x", title: "a", done: false, stage: "doing" })).toBe("doing");
    expect(stageOf({ id: "x", title: "a", done: true })).toBe("done");
    expect(stageOf({ id: "x", title: "a", done: false })).toBe("todo");
  });

  it("los ejemplos de F-006 cargan", () => {
    const config = parseViewsConfig(views6Text());
    expect(() => parseDataFile(data6Text(), config)).not.toThrow();
  });
});

describe("CA2 validación", () => {
  const config = cfg6();
  const TITLES = ["Soldar", "Pagar la factura", "Cambiar el filtro", "Llamar al técnico"];
  const noTitle = (m: string): void => {
    for (const t of TITLES) expect(m).not.toContain(t);
  };
  const dataCase = (name: string, index: number, fn: (item: Loose) => void): void => {
    it(`datos: ${name}`, () => {
      const raw = edited(data6Text(), (o: Loose) => {
        fn(o.sources.tablero.items[index]);
      });
      const m = message(() => parseDataFile(raw, config));
      expect(m).toContain(`/sources/tablero/items/${String(index)}`);
      noTitle(m);
    });
  };
  dataCase("stage done con done false", 11, (i) => {
    i.done = false;
  });
  dataCase("doneAt con stage todo", 1, (i) => {
    i.doneAt = "2026-10-24T09:00:00-05:00";
  });
  dataCase("doneAt sin zona", 11, (i) => {
    i.doneAt = "2026-10-24 09:00";
  });
  dataCase("stage desconocido", 0, (i) => {
    i.stage = "blocked";
  });

  const viewCase = (name: string, options: Loose): void => {
    it(`vistas: ${name}`, () => {
      const raw = edited(views6Text(), (o: Loose) => {
        o.views[0].slots.tareas.options = options;
      });
      const m = message(() => parseViewsConfig(raw));
      expect(m).toContain("/views/0/slots/tareas/options");
    });
  };
  viewCase("stages vacío", { stages: [] });
  viewCase("stages repetido", { stages: ["todo", "todo"] });
  viewCase("stages desconocido", { stages: ["later"] });
  viewCase("density desconocida", { stages: ["todo"], density: "grid" });
  viewCase("lead no booleano", { stages: ["todo"], lead: "yes" });
  viewCase("campo desconocido colour", { stages: ["todo"], colour: "red" });

  it("setSource rechaza stage/done que no coinciden, sin dejar salir el título", () => {
    const e = mkEngine6(fakeRenderer());
    const items = tableroItems();
    const clone = (): Loose[] => structuredClone(items);
    const bad = clone();
    bad[11].done = false; // stage "done" con done false
    const r = e.setSource("tablero", bad);
    expect(r.ok).toBe(false);
    noTitle(JSON.stringify(r));

    const badDoneAt = clone();
    badDoneAt[1].doneAt = "2026-10-24T09:00:00-05:00";
    expect(e.setSource("tablero", badDoneAt).ok).toBe(false);

    const badStage = clone();
    badStage[0].stage = "blocked";
    expect(e.setSource("tablero", badStage).ok).toBe(false);

    const badFormat = clone();
    badFormat[11].doneAt = "2026-10-24 09:00";
    expect(e.setSource("tablero", badFormat).ok).toBe(false);
  });
});

describe("CA10 staleLabel", () => {
  const now = new Date("2026-10-24T17:00:00Z");
  const tz = "America/Lima";
  it("más de 5 min → «sin datos desde HH:MM» en hora local", () => {
    expect(staleLabel(new Date("2026-10-24T16:50:00Z"), now, tz)).toBe("sin datos desde 11:50");
  });
  it("5 min justos → undefined", () => {
    expect(staleLabel(new Date("2026-10-24T16:55:00Z"), now, tz)).toBeUndefined();
  });
  it("sin readAt → undefined", () => {
    expect(staleLabel(undefined, now, tz)).toBeUndefined();
  });
});

describe("meta.readAt en setSource (motor falso)", () => {
  it("acepta el tercer parámetro y dice changed:false con los mismos datos", () => {
    const e = mkEngine(fakeRenderer(), {
      config: cfg6(),
      data: parseDataFile(data6Text(), cfg6()),
    });
    expect(setSourceAt(e, "tablero", tableroItems(), new Date("2026-10-24T16:50:00Z"))).toEqual({
      ok: true,
      changed: false,
    });
  });
});
