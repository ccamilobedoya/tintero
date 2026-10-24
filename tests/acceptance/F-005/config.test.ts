/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, security/detect-non-literal-fs-filename -- JSON de prueba y carpetas temporales propias */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConfigError,
  loadDataFile,
  loadViewsConfig,
  parseDataFile,
  parseViewsConfig,
} from "../../../server/src/engine/index.ts";
import {
  DATA_PATH,
  VIEWS_PATH,
  cfgFrom,
  dataText,
  edited,
  rmDir,
  tmpDir,
  viewsText,
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

describe("CA2 carga: archivo de vistas", () => {
  it("los ejemplos cargan sin error (texto y archivo)", () => {
    const config = parseViewsConfig(viewsText());
    expect(() => parseDataFile(dataText(), config)).not.toThrow();
    const loaded = loadViewsConfig(VIEWS_PATH);
    expect(() => loadDataFile(DATA_PATH, loaded)).not.toThrow();
  });

  it("id «h-oy» → ruta /views/0/id", () => {
    const raw = edited(viewsText(), (o: Loose) => {
      o.views[0].id = "h-oy";
    });
    expect(message(() => parseViewsConfig(raw))).toContain("/views/0/id");
  });

  const cases: [string, (o: Loose) => void, string][] = [
    [
      "bloque clock",
      (o) => {
        o.views[0].slots.pendientes.block = "clock";
      },
      "/views/0/slots",
    ],
    [
      "devices sin *",
      (o) => {
        delete o.devices["*"];
        o.devices.local = { views: ["hoy"] };
      },
      "/devices",
    ],
    [
      "aparato con una vista que no existe",
      (o) => {
        o.devices.local = { views: ["nada"] };
      },
      "/devices",
    ],
    [
      "columnas que no suman 100",
      (o) => {
        o.views[0].grid.columns = [60, 50];
      },
      "/views/0/grid",
    ],
    [
      "área que no es rectángulo",
      (o) => {
        o.views[0].grid = {
          columns: [50, 50],
          rows: [50, 50],
          areas: [
            ["a", "b"],
            ["b", "a"],
          ],
        };
        o.views[0].slots = {
          a: o.views[0].slots.pendientes,
          b: o.views[0].slots.eventos,
        };
        delete o.views[0].portrait;
      },
      "/views/0/grid",
    ],
    [
      "área sin slots",
      (o) => {
        delete o.views[0].slots.eventos;
      },
      "/views/0/slots",
    ],
    [
      "slots sin área",
      (o) => {
        o.views[0].slots.extra = o.views[0].slots.eventos;
      },
      "/views/0/slots",
    ],
    [
      "portrait con otros nombres",
      (o) => {
        o.views[0].portrait.areas = [["p"], ["e"], ["j"], ["c"]];
      },
      "/views/0/portrait",
    ],
    [
      "campo desconocido colour",
      (o) => {
        o.views[0].colour = "red";
      },
      "/views/0",
    ],
  ];
  for (const [name, fn, path] of cases) {
    it(`${name} → ConfigError con ruta ${path}`, () => {
      const raw = edited(viewsText(), fn);
      const msg = message(() => parseViewsConfig(raw));
      expect(msg).toContain(path);
    });
  }

  it("70 000 bytes → too large, sin parsear (el contenido ni siquiera es JSON)", () => {
    const msg = message(() => parseViewsConfig("x".repeat(70_000)));
    expect(msg).toContain("too large");
  });
});

describe("CA2 carga: archivo de datos", () => {
  const config = cfgFrom();
  const bad = (fn: (o: Loose) => void, cfg = config): string =>
    message(() => parseDataFile(edited(dataText(), fn), cfg));

  it("una vista usa una fuente que falta", () => {
    expect(
      bad((o) => {
        delete o.sources.calendario;
      }),
    ).toContain("/");
  });

  it("agenda sobre una fuente tasks", () => {
    const cfg = cfgFrom((o) => {
      o.views[2].slots.eventos.source = "tareas";
    });
    expect(message(() => parseDataFile(dataText(), cfg))).toContain("/");
  });

  it("título de 201 caracteres, sin filtrar el valor", () => {
    const msg = bad((o) => {
      o.sources.tareas.items[0].title = "SECRETO" + "a".repeat(194);
    });
    expect(msg).toContain("/sources/tareas/items/0/title");
    expect(msg).not.toContain("SECRETO");
  });

  it("501 tareas", () => {
    bad((o) => {
      o.sources.tareas.items = Array.from({ length: 501 }, (_, i) => ({
        id: `t-${String(i)}`,
        title: "x",
        done: false,
      }));
    });
  });

  it("ids repetidos", () => {
    bad((o) => {
      o.sources.tareas.items[1].id = "t-001";
    });
  });

  it("end antes de start", () => {
    bad((o) => {
      o.sources.calendario.items[2].end = "2026-10-23T13:00:00Z";
    });
  });

  it("ningún mensaje contiene el título de una tarea", () => {
    const msgs = [
      bad((o) => {
        o.sources.tareas.items[1].id = "t-001";
      }),
      bad((o) => {
        o.sources.tareas.items[0].colour = "x";
      }),
      bad((o) => {
        o.sources.tareas.items[0].due = "mañana";
      }),
    ];
    for (const m of msgs) {
      for (const t of ["Pagar la factura", "Cambiar el filtro", "Café y azúcar", "Casa"])
        expect(m).not.toContain(t);
    }
  });
});

describe("CA2 carga: lectura con tope", () => {
  let dir: string;
  beforeAll(() => {
    dir = tmpDir("tintero-f005-cfg-");
  });
  afterAll(() => {
    rmDir(dir);
  });

  it("loadViewsConfig con 70 000 bytes → too large", () => {
    const p = join(dir, "views.json");
    writeFileSync(p, " ".repeat(70_000));
    expect(message(() => loadViewsConfig(p))).toContain("too large");
  });

  it("loadDataFile con 600 000 bytes → too large", () => {
    const p = join(dir, "data.json");
    writeFileSync(p, " ".repeat(600_000));
    expect(message(() => loadDataFile(p, cfgFrom()))).toContain("too large");
  });
});
