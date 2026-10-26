/* eslint-disable security/detect-non-literal-fs-filename, security/detect-non-literal-regexp -- paquetes de node_modules del repo y nombres fijos de la prueba */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, has, read, run } from "./helpers.ts";

const MIT = [
  "MIT License",
  "",
  "Copyright (c) 2026 Tintero contributors",
  "",
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  'of this software and associated documentation files (the "Software"), to deal',
  "in the Software without restriction, including without limitation the rights",
  "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
  "copies of the Software, and to permit persons to whom the Software is",
  "furnished to do so, subject to the following conditions:",
  "",
  "The above copyright notice and this permission notice shall be included in all",
  "copies or substantial portions of the Software.",
  "",
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
  "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
  "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
  "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
  "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
  "SOFTWARE.",
];

describe("CA1 licencia", () => {
  it("LICENSE es el texto MIT de la SPDX, línea por línea, con 2026 y Tintero contributors", () => {
    expect(has("LICENSE"), "no existe LICENSE").toBe(true);
    // Same words and paragraphs; the line wrapping inside a paragraph may differ.
    const paragraphs = (t: string): string[] =>
      t
        .replace(/\r\n/g, "\n")
        .trim()
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s+/g, " ").trim());
    expect(paragraphs(read("LICENSE"))).toEqual(paragraphs(MIT.join("\n")));
  });

  it('package.json dice "license": "MIT"', () => {
    const pkg = JSON.parse(read("package.json")) as { license?: string };
    expect(pkg.license).toBe("MIT");
  });

  describe("NOTICE nombra el software de terceros con su licencia", () => {
    const notice = has("NOTICE") ? read("NOTICE") : "";
    const lines = notice.split("\n");
    /** Alguna línea nombra `name` y, en ella o en las dos siguientes, dice `license`. */
    const names = (name: string, license?: string): boolean =>
      lines.some((l, i) => {
        if (!l.includes(name)) return false;
        return (
          license === undefined ||
          lines
            .slice(i, i + 3)
            .join(" ")
            .includes(license)
        );
      });

    it("existe", () => {
      expect(has("NOTICE"), "no existe NOTICE").toBe(true);
    });
    it("GxEPD2 (GPL-3.0)", () => {
      expect(names("GxEPD2", "GPL-3.0")).toBe(true);
    });
    it("ArduinoJson (MIT)", () => {
      expect(names("ArduinoJson", "MIT")).toBe(true);
    });
    it("DejaVu", () => {
      expect(names("DejaVu")).toBe(true);
    });
    it("Terminus (OFL-1.1)", () => {
      expect(names("Terminus", "OFL-1.1")).toBe(true);
    });
    it("R2: el código fuente del firmware es MIT, pero un binario con GxEPD2 va bajo GPL-3.0", () => {
      expect(notice).toMatch(/firmware/i);
      expect(notice).toMatch(/binar(y|ies)/i);
      expect(notice).toContain("MIT");
      expect(notice).toContain("GPL-3.0");
    });
  });
});

interface NpmNode {
  version?: string;
  dependencies?: Record<string, NpmNode>;
}

type LicenseField = string | { type?: string } | undefined;

/** Texto de licencia de un paquete instalado; `undefined` si no declara ninguna. */
function licenseOf(dir: string): string | undefined {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return undefined;
  const pkg = JSON.parse(readFileSync(file, "utf8")) as {
    license?: LicenseField;
    licenses?: { type?: string }[];
  };
  if (typeof pkg.license === "string" && pkg.license !== "") return pkg.license;
  if (typeof pkg.license === "object" && typeof pkg.license.type === "string") {
    return pkg.license.type;
  }
  const first = pkg.licenses?.map((l) => l.type).filter((t) => typeof t === "string");
  return first && first.length > 0 ? first.join(" OR ") : undefined;
}

describe("CA2 licencias de las dependencias de producción", () => {
  it("ninguna es GPL, AGPL, LGPL, SSPL ni viene sin licencia", () => {
    const r = run("npm", ["ls", "--omit=dev", "--all", "--json"]);
    const tree = JSON.parse(r.out) as NpmNode;
    const seen = new Map<string, string>(); // "nombre@versión" → licencia
    const missing: string[] = [];

    const visit = (nodes: Record<string, NpmNode> | undefined, parentDir: string): void => {
      for (const [name, node] of Object.entries(nodes ?? {})) {
        // npm instala anidado cuando hay choque de versiones: primero bajo el padre, luego arriba.
        const nested = join(parentDir, "node_modules", name);
        const dir = existsSync(join(nested, "package.json"))
          ? nested
          : join(ROOT, "node_modules", name);
        const key = `${name}@${node.version ?? "?"}`;
        if (!seen.has(key)) {
          const license = licenseOf(dir);
          if (license === undefined) missing.push(key);
          else seen.set(key, license);
        }
        visit(node.dependencies, dir);
      }
    };
    visit(tree.dependencies, ROOT);

    const bad = [...seen].filter(([, license]) => /(^|[^A-Za-z])(A|L)?GPL|SSPL/i.test(license));
    expect(seen.size, "npm ls no devolvió paquetes de producción").toBeGreaterThan(0);
    expect(missing, "paquetes de producción sin licencia").toEqual([]);
    expect(bad, "paquetes de producción con GPL/AGPL/LGPL/SSPL").toEqual([]);
  });
});

describe("CA3 SECURITY y CONTRIBUTING", () => {
  const headings = (text: string): string[] =>
    text
      .split("\n")
      .filter((l) => /^#{1,6}\s/.test(l))
      .map((l) => l.replace(/^#+\s*/, ""));
  const ES_WORDS = /\b(los|las|para|cómo|según|nunca|también)\b/i;

  for (const [en, es] of [
    ["SECURITY.md", "SECURITY.es.md"],
    ["CONTRIBUTING.md", "CONTRIBUTING.es.md"],
  ] as const) {
    it(`${en} existe en inglés y enlaza a ${es}, que también existe`, () => {
      expect(has(en), `no existe ${en}`).toBe(true);
      expect(has(es), `no existe ${es}`).toBe(true);
      const text = read(en);
      expect(text).toMatch(new RegExp(`\\]\\(\\.?/?${es.replace(/\./g, "\\.")}[#)]`));
      expect(text).not.toMatch(ES_WORDS);
      expect(read(es).length).toBeGreaterThan(200);
    });
  }

  describe("SECURITY.md (R3)", () => {
    const text = has("SECURITY.md") ? read("SECURITY.md") : "";
    it("dice cómo reportar: private vulnerability reporting de GitHub, nunca un issue público", () => {
      expect(text).toMatch(/private vulnerability reporting/i);
      expect(text).toMatch(/public issue|issue[^.\n]*public/i);
      expect(headings(text).some((h) => /report/i.test(h))).toBe(true);
    });
    it("dice qué se considera vulnerabilidad", () => {
      expect(headings(text).some((h) => /vulnerabilit|in scope|scope/i.test(h))).toBe(true);
    });
    it("trae el modelo de amenazas: mTLS por pantalla, silencio, llaves fuera del repo, vistas sin red, solo 127.0.0.1", () => {
      expect(headings(text).some((h) => /threat model/i.test(h))).toBe(true);
      expect(text).toMatch(/mTLS/);
      expect(text).toMatch(/127\.0\.0\.1/);
      expect(text).toMatch(/(outside|never in) (the )?(repo|repository|git)/i);
      expect(text).toMatch(/silen|no answer|no response|does not answer|stay quiet/i);
      expect(text).toMatch(/no network|without (network|internet)|offline|network access/i);
    });
  });

  describe("CONTRIBUTING.md (R4)", () => {
    const text = has("CONTRIBUTING.md") ? read("CONTRIBUTING.md") : "";
    it("cómo instalar y las comprobaciones", () => {
      expect(text).toContain("npm ci");
      expect(text).toContain("npm run setup");
      for (const check of ["typecheck", "lint", "test", "tools/revisar"]) {
        expect(text, check).toContain(check);
      }
    });
    it("nada personal ni secreto entra", () => {
      expect(text).toMatch(/personal/i);
      expect(text).toMatch(/secret/i);
    });
    it("el proceso con agentes (docs/PROCESO.md) es el del autor y no se exige a quien colabora", () => {
      expect(text).toContain("docs/PROCESO.md");
      expect(text.replace(/[*_`]/g, "")).toMatch(
        /(not|n't)\s+(required|expected|needed|necessary|have to|need to)|optional|no need|does not apply/i,
      );
    });
  });
});
