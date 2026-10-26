/* eslint-disable security/detect-non-literal-fs-filename, security/detect-unsafe-regex, security/detect-non-literal-regexp -- archivos del repo y expresiones fijas de la prueba sobre texto propio */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, cleanTmp, cloneRepo, has, read, run, walk } from "./helpers.ts";

const GUIDE = [
  "getting-started",
  "hardware",
  "certificates",
  "exposure",
  "configuration",
  "integrations",
  "blocks",
];

/** Líneas de un Markdown sin los bloques de código. */
function prose(text: string): string[] {
  let fenced = false;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) out.push(line);
  }
  return out;
}
const h2 = (text: string): string[] => prose(text).filter((l) => l.startsWith("## "));
const ES_WORDS = /\b(los|las|para|cómo|según|nunca|también|desde|una)\b/i;

describe("CA18 la guía en dos idiomas", () => {
  it("R19: cada archivo de la guía existe en en/ y en es/", () => {
    for (const name of GUIDE) {
      expect(has(`docs/guide/en/${name}.md`), `docs/guide/en/${name}.md`).toBe(true);
      expect(has(`docs/guide/es/${name}.md`), `docs/guide/es/${name}.md`).toBe(true);
    }
  });

  it("cada archivo de en/ tiene su par en es/ (y al revés) con el mismo número de títulos ##", () => {
    const names = (lang: string): string[] =>
      walk(`docs/guide/${lang}`)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.slice(`docs/guide/${lang}/`.length));
    const en = names("en");
    const es = names("es");
    expect(en.length).toBeGreaterThan(0);
    expect(es).toEqual(en);
    const diffs: string[] = [];
    for (const name of en) {
      const a = h2(read(`docs/guide/en/${name}`)).length;
      const b = h2(read(`docs/guide/es/${name}`)).length;
      if (a !== b) diffs.push(`${name}: en ${String(a)} ≠ es ${String(b)}`);
      if (a === 0) diffs.push(`${name}: sin títulos ##`);
    }
    expect(diffs).toEqual([]);
  });

  it("todo enlace relativo de README.md, README.es.md y docs/guide/ apunta a un archivo que existe", () => {
    const docs = [
      "README.md",
      "README.es.md",
      ...walk("docs/guide").filter((f) => f.endsWith(".md")),
    ];
    const broken: string[] = [];
    let checked = 0;
    for (const file of docs) {
      expect(has(file), file).toBe(true);
      for (const line of prose(read(file))) {
        for (const m of line.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
          const target = m[1] ?? "";
          if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
          const path = decodeURIComponent(target.split("#")[0]?.split("?")[0] ?? "");
          if (path === "") continue;
          checked++;
          const full = normalize(join(ROOT, dirname(file), path));
          if (!full.startsWith(ROOT) || !existsSync(full)) broken.push(`${file} → ${target}`);
        }
      }
    }
    expect(checked, "no se revisó ningún enlace relativo").toBeGreaterThan(5);
    expect(broken).toEqual([]);
  });

  it("R18: README.md y README.es.md se enlazan entre sí, llevan una imagen de hoy y no dicen «todavía privado»", () => {
    const en = read("README.md");
    const es = read("README.es.md");
    expect(en).toMatch(/\]\(\.?\/?README\.es\.md\)/);
    expect(es).toMatch(/\]\(\.?\/?README\.md\)/);
    for (const text of [en, es]) {
      expect(text).toMatch(/!\[[^\]]*\]\((?:\.\/)?docs\/guide\/images\/[^)\s]+\.(png|svg)\)/);
      expect(text).not.toMatch(/todav[ií]a privado|still private|not (yet )?public/i);
      expect(text).toMatch(/\]\((?:\.\/)?LICENSE\)/);
    }
    expect(en).toMatch(/\]\((?:\.\/)?docs\/guide\/en\/getting-started\.md/);
    expect(es).toMatch(/\]\((?:\.\/)?docs\/guide\/es\/getting-started\.md/);
    expect(en).not.toMatch(ES_WORDS);
    expect(en).toMatch(/emulator/i);
  });

  it("las imágenes de la guía existen y son PNG o SVG", () => {
    const images = walk("docs/guide/images");
    expect(images.length, "docs/guide/images/ vacía").toBeGreaterThan(0);
    expect(images.some((f) => f.endsWith(".png"))).toBe(true);
    for (const f of images) expect(f).toMatch(/\.(png|svg)$/);
  });
});

describe("R16 a R20 contenido de la guía (en inglés y en español)", () => {
  const both = (name: string): Record<"en" | "es", string> => ({
    en: read(`docs/guide/en/${name}.md`),
    es: read(`docs/guide/es/${name}.md`),
  });

  it("getting-started: instalar, arrancar con los ejemplos y el emulador", () => {
    for (const text of Object.values(both("getting-started"))) {
      expect(text).toContain("npm ci");
      expect(text).toContain("npm run server");
      expect(text).toContain("npm run emulator");
      expect(text).toContain("hoy.views.example.json");
      expect(text).toContain("hoy.data.example.json");
    }
  });

  it("certificates: init → server → device → firmware, lista de aparatos, emulador, respaldo y reemisión", () => {
    const { en, es } = both("certificates");
    for (const text of [en, es]) {
      for (const sub of ["init", "server", "device", "firmware"]) {
        expect(text, sub).toMatch(new RegExp(`npm run pki -- ${sub}\\b`));
      }
      expect(text).toContain("devices.txt");
      expect(text).toMatch(/emulator|emulador/i);
      expect(text).toContain("/path/to/pki");
      expect(text).toContain("tintero.example.ts.net");
      expect(text).toContain("p1");
    }
    expect(en).toMatch(/backup/i);
    expect(en).toMatch(/re-?issue|renew/i);
    expect(es).toMatch(/respaldo/i);
    expect(es).toMatch(/reemit|renov/i);
  });

  it("exposure: Funnel o una salida TCP con TLS de punta a punta, y nunca HTTP sin TLS", () => {
    const { en, es } = both("exposure");
    for (const text of [en, es]) {
      expect(text).toMatch(/Funnel/);
      expect(text).toMatch(/TLS/);
      expect(text).toContain("127.0.0.1");
    }
    expect(en).toMatch(/never[^.\n]*(plain )?HTTP|HTTP[^.\n]*never/i);
    expect(es).toMatch(/nunca[^.\n]*HTTP|HTTP[^.\n]*nunca/i);
  });

  it("hardware: piezas, cableado de los botones, circuito y firmware", () => {
    for (const text of Object.values(both("hardware"))) {
      expect(text).toContain("GPIO32");
      expect(text).toContain("GPIO33");
      expect(text).toContain("DESPI-C02");
      expect(text).toMatch(/firmware/i);
    }
  });

  it("configuration: vistas, datos, integraciones, locale y llaves en archivos 600 fuera del repo", () => {
    for (const text of Object.values(both("configuration"))) {
      expect(text).toContain("locale");
      expect(text).toMatch(/\b600\b/);
      expect(text).toContain("integrations");
    }
  });

  it("integrations y blocks: la plantilla example-json, festivos como ejemplo y los bloques", () => {
    for (const text of Object.values(both("integrations"))) {
      expect(text).toContain("example-json");
      expect(text).toContain("festivos");
    }
    for (const text of Object.values(both("blocks"))) {
      expect(text).toContain("task-board");
    }
  });

  it("R20: ningún ejemplo de la guía ni de los README trae nombres ts.net, correos o rutas personales que parezcan reales", () => {
    const docs = [
      "README.md",
      "README.es.md",
      ...walk("docs/guide").filter((f) => f.endsWith(".md")),
    ];
    const bad: string[] = [];
    for (const file of docs) {
      read(file)
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(/[a-z0-9.-]+\.ts\.net/gi)) {
            if (!/(^|\.)(example|ejemplo)\./i.test(m[0])) bad.push(`${file}:${String(i + 1)}`);
          }
          if (/\/home\/(?!x\/)[a-z]+\//.test(line) && !line.includes("/home/user"))
            bad.push(`${file}:${String(i + 1)}`);
          if (line.includes("setInsecure") && !/never|nunca|not|no /i.test(line))
            bad.push(`${file}:${String(i + 1)}`);
        });
    }
    expect(bad).toEqual([]);
  });
});

describe("CA19 tools/imagenes-guia es reproducible", () => {
  /** SHA-256 de cada archivo de docs/guide/images/ de la carpeta `base`. */
  const sums = (base: string): Record<string, string> => {
    const dir = join(base, "docs/guide/images");
    if (!existsSync(dir)) return {};
    return Object.fromEntries(
      readdirSync(dir)
        .sort()
        .map((f) => [
          f,
          createHash("sha256")
            .update(readFileSync(join(dir, f)))
            .digest("hex"),
        ]),
    );
  };

  it("existe y es ejecutable", () => {
    expect(has("tools/imagenes-guia"), "no existe tools/imagenes-guia").toBe(true);
    expect(statSync(join(ROOT, "tools/imagenes-guia")).mode & 0o111).not.toBe(0);
  });

  // Se corre en una copia del repo: la carpeta de trabajo no se toca.
  it("dos corridas seguidas dan los mismos bytes, y son los que están en el repo", () => {
    const copy = cloneRepo();
    const first = run(join(copy, "tools/imagenes-guia"), [], { cwd: copy, timeoutMs: 280_000 });
    expect(first.code, first.all.slice(0, 600)).toBe(0);
    const a = sums(copy);
    const second = run(join(copy, "tools/imagenes-guia"), [], { cwd: copy, timeoutMs: 280_000 });
    expect(second.code, second.all.slice(0, 600)).toBe(0);
    const b = sums(copy);
    expect(Object.keys(a).length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(a, "las imágenes del repo no son las que produce el script").toEqual(sums(ROOT));
    cleanTmp();
  }, 600_000);
});

describe("R8 y CA22 lo que ya existe sigue en pie", () => {
  it("tools/revisar corre public-scan --tree como una herramienta más («publicación»)", () => {
    const text = read("tools/revisar");
    expect(text).toContain("public-scan");
    expect(text).toMatch(/publicaci[oó]n/i);
  });

  it("los scripts de package.json de siempre siguen (test, test:acceptance, pki)", () => {
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> })
      .scripts;
    expect(scripts.test).toContain("vitest");
    expect(scripts["test:acceptance"]).toContain("vitest.acceptance.config.ts");
    expect(scripts.pki).toContain("server/scripts/pki.ts");
  });
});
