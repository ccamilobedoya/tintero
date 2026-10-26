/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access -- ejemplos del repo y JSON de prueba */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ConfigError,
  createEngine,
  parseDataFile,
  parseViewsConfig,
} from "../../../server/src/engine/index.ts";
import {
  NOW15,
  NOW_NOV2_17,
  P124,
  ROOT,
  closeEngines15,
  edited,
  fakeRenderer,
  holidays2026,
  hoyDataText,
  hoyViewsText,
  index8,
  launchChromium,
  mkEngine15,
  setHolidays,
  spyRenderer,
  view8,
  type Loose,
} from "../F-017/helpers.ts";
import { importRepo } from "./helpers.ts";

const FIX = new URL("./fixtures/", import.meta.url).pathname;
const config = (name: string): string => readFileSync(join(ROOT, "config", name), "utf8");

// --- dibujo con renderer falso: solo el HTML ------------------------------------------------

interface DrawOpts {
  views: string;
  data: string;
  now?: string;
  /** Cambia el JSON de vistas antes de leerlo. */
  viewsFn?: (o: Loose) => void;
  /** Cambia el JSON de datos antes de leerlo. */
  dataFn?: (o: Loose) => void;
  /** Fuentes leídas por última vez en esta fecha (aviso «sin datos desde»). */
  staleSince?: string;
}

const spare: ReturnType<typeof createEngine>[] = [];
afterAll(async () => {
  await closeEngines15();
  for (const e of spare) {
    await e.idle();
    await e.close();
  }
});

/** HTML de todos los dibujos completos de las vistas de la configuración. */
async function htmlOf(o: DrawOpts): Promise<string> {
  const spy = spyRenderer(fakeRenderer());
  const cfg = parseViewsConfig(o.viewsFn ? edited(o.views, o.viewsFn) : o.views);
  const data = parseDataFile(o.dataFn ? edited(o.data, o.dataFn) : o.data, cfg);
  const now = o.now ?? NOW15;
  const engine = createEngine({
    nextWakeS: 1800,
    clock: () => new Date(now),
    config: cfg,
    data,
    renderer: spy,
  });
  spare.push(engine);
  const h = setHolidays(engine, holidays2026());
  if (!h.ok) throw new Error(`setHolidays: ${h.error}`);
  if (o.staleSince !== undefined) {
    const sources = (JSON.parse(o.data) as { sources: Record<string, { items: unknown[] }> })
      .sources;
    for (const [id, source] of Object.entries(sources)) {
      const r = engine.setSource(id, source.items, { readAt: new Date(o.staleSince) });
      if (!r.ok) throw new Error(`setSource ${id}: ${JSON.stringify(r)}`);
    }
  }
  await index8(engine, "local", P124);
  await engine.idle();
  return spy.calls
    .filter((c) => c.html.includes("data-fit="))
    .map((c) => c.html)
    .join("\n");
}

const entities = (s: string): string =>
  s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");

/** Los nodos de texto del HTML, recortados y sin vacíos. */
function textNodes(html: string): string[] {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .split(/<[^>]*>/)
    .map((s) => entities(s).trim())
    .filter((s) => s !== "");
}

const lower = (list: string[]): string[] => list.map((s) => s.toLowerCase());
const hasNode = (nodes: string[], text: string): boolean =>
  lower(nodes).includes(text.toLowerCase());

// Textos fijos de `es` que NO están en `en` (R10b: lo que `en` define es distinto).
const ES_ONLY_NODES = [
  "hoy",
  "mañana",
  "hoy festivo",
  "en progreso",
  "por hacer",
  "hecho hoy",
  "nada en progreso.",
  "nada por hacer.",
  "nada hecho hoy.",
  "todo el día",
  "sin categoría",
  // iniciales de los días de la semana de `es` que `en` (M T W T F S S) no usa
  "l",
  "j",
  "v",
  "d",
];
const ES_ONLY_WORDS = new Set([
  ...["lun", "mié", "jue", "vie", "sáb", "dom", "ene", "abr", "ago", "dic"],
  ...["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto"],
  ...["septiembre", "octubre", "noviembre", "diciembre"],
  ...["hoy", "mañana", "festivo", "más", "hecho", "nada", "progreso", "hacer"],
  ...["datos", "desde", "categoría", "todo", "sin"],
]);

/** Los textos de usuario (títulos de tareas y eventos) no cuentan: no son del catálogo. */
function userTitles(data: string): string[] {
  const sources = (JSON.parse(data) as { sources: Record<string, { items: { title: string }[] }> })
    .sources;
  return Object.values(sources).flatMap((s) => s.items.map((i) => i.title));
}

/** Textos del catálogo `es` que quedaron en el dibujo (vacío = ninguno). */
function spanishLeft(html: string, data: string): string[] {
  const titles = userTitles(data);
  const isUser = (node: string): boolean => {
    const cut = node.replace(/(…|\.\.\.)$/, "");
    return titles.some((t) => t === node || (cut.length >= 8 && t.startsWith(cut)));
  };
  const found: string[] = [];
  for (const node of textNodes(html)) {
    if (isUser(node)) continue;
    if (ES_ONLY_NODES.includes(node.toLowerCase())) found.push(node);
    if (/\+\d+ más|sin datos desde|todo el día|\bfestivo\b/i.test(node)) found.push(node);
    for (const word of node.toLowerCase().split(/[^\p{L}]+/u)) {
      if (ES_ONLY_WORDS.has(word)) found.push(`${node} → ${word}`);
    }
  }
  return [...new Set(found)];
}

/** Vistas de `hoy` y `tablero` con título en inglés (el título es del usuario, no del catálogo). */
const englishTitles = (o: Loose): void => {
  o.locale = "en";
  const titles = ["Today view", "Board view", "Schedule view", "Extra view"];
  for (const [i, v] of (o.views as { title: string }[]).entries()) {
    v.title = titles.at(i) ?? "Another view";
  }
};

// --- CA8 ------------------------------------------------------------------------------------

describe("CA8 con es la imagen no cambia", () => {
  const before = new Uint8Array(readFileSync(`${FIX}hoy-main-P124.raw1`));

  it("el dato grabado de main es una imagen de 800 × 480 (6000 × 8 bytes)", () => {
    expect(before.length).toBe(Math.ceil(P124.w / 8) * P124.h);
  });

  async function drawHoy(fn?: (o: Loose) => void): Promise<Uint8Array> {
    const cr = await launchChromium();
    try {
      const e = mkEngine15(cr.renderer, {
        views: ["hoy"],
        clock: () => new Date(NOW15),
        ...(fn ? { cfgFn: fn } : {}),
      });
      const { views } = await index8(e, "local", P124);
      await e.idle();
      return view8(views, "hoy").raw1;
    } finally {
      await closeEngines15();
      await cr.stop();
    }
  }

  it("con locale ausente: byte a byte igual a main", async () => {
    const now = await drawHoy();
    expect(Buffer.from(now).equals(Buffer.from(before))).toBe(true);
  }, 180_000);

  it('con "locale": "es": byte a byte igual a main', async () => {
    const now = await drawHoy((o) => {
      o.locale = "es";
    });
    expect(Buffer.from(now).equals(Buffer.from(before))).toBe(true);
  }, 180_000);
});

// --- CA9 ------------------------------------------------------------------------------------

describe("CA9 con en los textos salen en inglés", () => {
  const views = hoyViewsText();
  const data = hoyDataText();

  it("comprobación de la herramienta: con es (sin locale) sí salen los textos en español", async () => {
    const html = await htmlOf({ views, data, dataFn: (o) => (o.sources.tablero.items = []) });
    const nodes = textNodes(html);
    for (const text of ["OCTUBRE 2026", "FESTIVO LUN 2 NOV", "Nada hecho hoy.", "Hoy", "Mañana"]) {
      expect(hasNode(nodes, text), text).toBe(true);
    }
    expect(spanishLeft(html, data).length).toBeGreaterThan(0);
    // Las mismas situaciones de las pruebas en inglés existen en español (la prueba mide algo real).
    const stale = textNodes(await htmlOf({ views, data, staleSince: "2026-10-26T11:00:00Z" }));
    expect(stale).toContain("sin datos desde 06:00");
    const older = textNodes(await htmlOf({ views, data, staleSince: "2026-10-24T15:00:00Z" }));
    expect(older).toContain("sin datos desde 24/10 10:00");
    const nov2 = textNodes(await htmlOf({ views, data, now: NOW_NOV2_17 }));
    expect(nov2).toContain("HOY FESTIVO");
  }, 60_000);

  it("hoy: el mes dice OCTOBER 2026 y la próxima festividad HOLIDAY MON 2 NOV", async () => {
    const nodes = textNodes(await htmlOf({ views, data, viewsFn: englishTitles }));
    expect(hasNode(nodes, "OCTOBER 2026")).toBe(true);
    expect(hasNode(nodes, "HOLIDAY MON 2 NOV")).toBe(true);
  }, 60_000);

  it("hoy: el día de la festividad dice HOLIDAY TODAY", async () => {
    const nodes = textNodes(
      await htmlOf({ views, data, viewsFn: englishTitles, now: NOW_NOV2_17 }),
    );
    expect(hasNode(nodes, "HOLIDAY TODAY")).toBe(true);
    expect(hasNode(nodes, "NOVEMBER 2026")).toBe(true);
  }, 60_000);

  it("hoy: Today, Tomorrow, fechas en inglés y +N more", async () => {
    const nodes = textNodes(await htmlOf({ views, data, viewsFn: englishTitles }));
    expect(hasNode(nodes, "Today")).toBe(true);
    expect(hasNode(nodes, "Tomorrow")).toBe(true);
    expect(hasNode(nodes, "mon 26 oct")).toBe(true);
    expect(nodes.some((n) => /^\+\d+ more$/.test(n))).toBe(true);
  }, 60_000);

  it("tablero con las listas vacías: el texto en inglés del catálogo", async () => {
    const nodes = textNodes(
      await htmlOf({
        views,
        data,
        viewsFn: englishTitles,
        dataFn: (o) => (o.sources.tablero.items = []),
      }),
    );
    for (const text of [
      "IN PROGRESS",
      "TO DO",
      "DONE TODAY",
      "Nothing in progress.",
      "Nothing to do.",
      "Nothing done today.",
    ]) {
      expect(hasNode(nodes, text), text).toBe(true);
    }
  }, 60_000);

  it("agenda: días y meses en inglés, All day, y el aviso HOLIDAY", async () => {
    const nodes = textNodes(
      await htmlOf({
        views: config("agenda.views.example.json"),
        data: config("agenda.data.example.json"),
        viewsFn: (o) => {
          o.locale = "en";
        },
      }),
    );
    for (const text of ["MON 26 OCT", "TUE 27 OCT", "WED 28 OCT", "All day", "OCTOBER 2026"]) {
      expect(hasNode(nodes, text), text).toBe(true);
    }
  }, 60_000);

  it("«no data since HH:MM» y «no data since DD/MM HH:MM» (fuentes sin leer hace rato)", async () => {
    // 13:00Z = 08:00 en Lima. Leída por última vez a las 06:00 locales, el mismo día.
    const same = textNodes(
      await htmlOf({
        views,
        data,
        viewsFn: englishTitles,
        staleSince: "2026-10-26T11:00:00Z",
      }),
    );
    expect(same.some((n) => n === "no data since 06:00")).toBe(true);
    // Leída el 24/10 a las 10:00 locales.
    const other = textNodes(
      await htmlOf({
        views,
        data,
        viewsFn: englishTitles,
        staleSince: "2026-10-24T15:00:00Z",
      }),
    );
    expect(other.some((n) => n === "no data since 24/10 10:00")).toBe(true);
  }, 60_000);

  for (const [name, v, d] of [
    ["hoy y tablero", "hoy.views.example.json", "hoy.data.example.json"],
    ["agenda", "agenda.views.example.json", "agenda.data.example.json"],
  ] as const) {
    it(`${name}: ningún texto del catálogo es que no esté en en`, async () => {
      const dataText = config(d);
      const html = await htmlOf({
        views: config(v),
        data: dataText,
        viewsFn: v.startsWith("hoy") ? englishTitles : (o) => (o.locale = "en"),
      });
      expect(spanishLeft(html, dataText)).toEqual([]);
    }, 60_000);
  }

  it("tablero vacío y fuentes sin leer: tampoco quedan textos en español", async () => {
    const empty = (o: Loose): void => {
      o.sources.tablero.items = [];
    };
    const html = await htmlOf({ views, data, viewsFn: englishTitles, dataFn: empty });
    expect(spanishLeft(html, data)).toEqual([]);
    const stale = await htmlOf({
      views,
      data,
      viewsFn: englishTitles,
      staleSince: "2026-10-24T15:00:00Z",
    });
    expect(spanishLeft(stale, data)).toEqual([]);
  }, 60_000);
});

// --- CA10 y R10 -----------------------------------------------------------------------------

describe("CA10 locale desconocido y catálogos", () => {
  it('"locale": "fr" → ConfigError con la ruta locale', () => {
    let error: unknown;
    try {
      parseViewsConfig(
        edited(hoyViewsText(), (o) => {
          o.locale = "fr";
        }),
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toMatch(/\/?locale/);
    expect(message).not.toMatch(/\bfr\b/);
    // Un valor desconocido de un campo que existe, no «campo desconocido».
    expect(message).not.toMatch(/unknown field/);
  });

  for (const ok of ["es", "en"]) {
    it(`"locale": "${ok}" se acepta`, () => {
      expect(() =>
        parseViewsConfig(
          edited(hoyViewsText(), (o) => {
            o.locale = ok;
          }),
        ),
      ).not.toThrow();
    });
  }

  it("los catálogos es y en tienen el mismo conjunto de claves", async () => {
    const mod = await importRepo<{ messages: (l: "es" | "en") => unknown }>(
      "server/src/engine/i18n/index.ts",
    );
    const paths = (value: unknown, prefix = ""): string[] => {
      if (typeof value === "object" && value !== null) {
        return Object.entries(value).flatMap(([k, v]) => paths(v, `${prefix}.${k}`));
      }
      return [`${prefix}:${typeof value}`];
    };
    const es = paths(mod.messages("es")).sort();
    const en = paths(mod.messages("en")).sort();
    expect(es.length).toBeGreaterThan(10);
    expect(en).toEqual(es);
  });

  it("R10b: el catálogo en trae los textos fijos de la ficha", async () => {
    const mod = await importRepo<{ messages: (l: "es" | "en") => unknown }>(
      "server/src/engine/i18n/index.ts",
    );
    const leaves = (value: unknown): string[] => {
      if (typeof value === "string") return [value];
      if (typeof value === "object" && value !== null) return Object.values(value).flatMap(leaves);
      return [];
    };
    const have = new Set(leaves(mod.messages("en")).map((s) => s.toLowerCase()));
    const wanted = [
      ...["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
      ...["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
      ...["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST"],
      ...["SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"],
      ...["Today", "Tomorrow", "All day", "No category"],
      ...["IN PROGRESS", "TO DO", "DONE TODAY"],
      ...["Nothing in progress.", "Nothing to do.", "Nothing done today."],
    ];
    const missing = wanted.filter((w) => !have.has(w.toLowerCase()));
    expect(missing).toEqual([]);
  });
});

// --- CA10b y R10c ---------------------------------------------------------------------------

describe("CA10b y R10c ejemplos en inglés", () => {
  const viewsEn = (): string => config("hoy.views.example.en.json");
  const dataEn = (): string => config("hoy.data.example.en.json");

  it("R10c: pasan la validación de vistas y datos, con locale en", () => {
    const cfg = parseViewsConfig(viewsEn());
    expect((JSON.parse(viewsEn()) as { locale?: string }).locale).toBe("en");
    expect(() => parseDataFile(dataEn(), cfg)).not.toThrow();
  });

  it("hoy se dibuja sin error y su HTML no trae ninguno de los textos de es", async () => {
    const html = await htmlOf({ views: viewsEn(), data: dataEn() });
    expect(html.length).toBeGreaterThan(1000);
    for (const text of [
      "Hoy",
      "Mañana",
      "FESTIVO",
      "sin datos desde",
      "más",
      "OCTUBRE",
      "POR HACER",
      "HECHO HOY",
      "Todo el día",
    ]) {
      expect(html, text).not.toContain(text);
    }
    expect(spanishLeft(html, dataEn())).toEqual([]);
  }, 60_000);

  it("y trae los de en: OCTOBER 2026 y HOLIDAY MON 2 NOV", async () => {
    const nodes = textNodes(await htmlOf({ views: viewsEn(), data: dataEn() }));
    expect(hasNode(nodes, "OCTOBER 2026")).toBe(true);
    expect(hasNode(nodes, "HOLIDAY MON 2 NOV")).toBe(true);
  }, 60_000);
});
