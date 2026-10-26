/* eslint-disable security/detect-non-literal-fs-filename, security/detect-unsafe-regex -- archivos del repo, copias temporales y expresiones fijas sobre texto propio */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ROOT, cleanTmp, cloneRepo, git, has, node, read, walk } from "./helpers.ts";

afterAll(cleanTmp);

const files = (): string[] => walk("firmware").filter((f) => !f.startsWith("firmware/.pio/"));
const text = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const code = (): string[] => files().filter((f) => /\.(c|cc|cpp|h|hpp|ino)$/.test(f));
const sources = (): string[] => code().filter((f) => !f.endsWith("tintero_certs.h"));

describe("R11 contenido de firmware/", () => {
  it("trae platformio.ini, src/, include/secrets.h.example y README.md", () => {
    expect(has("firmware/platformio.ini"), "firmware/platformio.ini").toBe(true);
    expect(has("firmware/README.md"), "firmware/README.md").toBe(true);
    expect(has("firmware/include/secrets.h.example"), "firmware/include/secrets.h.example").toBe(
      true,
    );
    expect(files().some((f) => f.startsWith("firmware/src/") && /\.(cpp|ino|c)$/.test(f))).toBe(
      true,
    );
  });

  it("platformio.ini fija la plataforma (versión exacta) y nombra GxEPD2 y ArduinoJson", () => {
    const ini = text("firmware/platformio.ini");
    expect(ini).toMatch(/^platform\s*=\s*\S*\d+\.\d+\.\d+/m);
    expect(ini).toContain("GxEPD2");
    expect(ini).toContain("ArduinoJson");
  });

  it("no hay llaves ni secretos generados dentro de firmware/ (secrets.h, tintero_certs.h)", () => {
    const bad = files().filter((f) => /(^|\/)(secrets|tintero_certs)\.h$/.test(f));
    expect(bad).toEqual([]);
    const tracked = git(ROOT, "ls-files", "firmware").out.split("\n");
    expect(tracked.filter((f) => /(^|\/)(secrets|tintero_certs)\.h$/.test(f))).toEqual([]);
  });

  it("los comentarios del código están en inglés (sin letras ni signos del español)", () => {
    const spanish: string[] = [];
    for (const rel of code()) {
      text(rel)
        .split("\n")
        .forEach((line, i) => {
          const comment = /\/\/(.*)$|\/\*(.*?)(\*\/|$)/.exec(line);
          if (comment && /[áéíóúñ¿¡]/i.test(comment[0])) spanish.push(`${rel}:${String(i + 1)}`);
        });
    }
    expect(spanish).toEqual([]);
  });
});

describe("CA11 firmware limpio", () => {
  it("public-scan --tree y la lista de términos privados sobre firmware/ solo → salida 0", () => {
    const dir = cloneRepo();
    // Se deja en la copia solo firmware/ y las herramientas.
    const keep = new Set(["firmware", "tools"]);
    const top = git(dir, "ls-tree", "--name-only", "HEAD")
      .out.split("\n")
      .filter((n) => n !== "" && !keep.has(n));
    for (const name of top) git(dir, "rm", "-q", "-r", "-f", "--ignore-unmatch", name);
    git(dir, "commit", "--quiet", "--no-verify", "--allow-empty", "-m", "solo firmware");
    const listed = git(dir, "ls-files", "firmware").out.split("\n").filter(Boolean);
    expect(listed.length, "firmware/ no tiene archivos que sigan git").toBeGreaterThan(0);

    const scan = node(dir, ["tools/lib/public-scan.ts", "--tree"]);
    expect(scan.code, scan.all.slice(0, 800)).toBe(0);
    const terms = node(dir, ["tools/lib/private-terms.ts", "--tree"]);
    expect(terms.code, terms.all.slice(0, 800)).toBe(0);
  }, 180_000);

  it("grep -rn setInsecure firmware/ → nada", () => {
    const hits = files().filter((f) => text(f).includes("setInsecure"));
    expect(hits).toEqual([]);
  });

  it("grep -rn 'TINTERO_HOST[] = \"' firmware/src firmware/include → nada (ni #define con valor)", () => {
    const hits = files()
      .filter((f) => f.startsWith("firmware/src/") || f.startsWith("firmware/include/"))
      .filter((f) =>
        /TINTERO_HOST\s*(\[\s*\])?\s*=\s*"|#\s*define\s+TINTERO_HOST\s+"/.test(text(f)),
      );
    expect(hits).toEqual([]);
  });
});

describe("R12, R13 y R14 el firmware usa solo la CA de Tintero y las constantes generadas", () => {
  it("valida al servidor con setCACert y con las constantes de tintero_certs.h", () => {
    const all = sources().map(text).join("\n");
    expect(all).toContain("setCACert(");
    expect(all).toContain("TINTERO_CA_PEM");
    expect(all).not.toMatch(/setCACertBundle|setInsecure|attachCertBundle/);
    for (const name of [
      "TINTERO_HOST",
      "TINTERO_DEVICE_ID",
      "TINTERO_DEVICE_CERT_PEM",
      "TINTERO_DEVICE_KEY_PEM",
    ]) {
      expect(all, name).toContain(name);
    }
    expect(all).toMatch(/#\s*include\s+[<"]tintero_certs\.h[>"]/);
    expect(all).toMatch(/setCertificate\(/);
    expect(all).toMatch(/setPrivateKey\(/);
  });

  it("pone tiempos de espera y límites antes de leer", () => {
    const all = sources().map(text).join("\n");
    expect(all).toMatch(/setTimeout|setConnectionTimeout|setHandshakeTimeout|timeout/i);
    expect(all).toMatch(/MAX_|max[A-Z]\w*|limit/i);
  });

  it("firmware/README.md: llaves legibles en la flash mientras no haya cifrado, y cómo revocar", () => {
    const readme = read("firmware/README.md");
    expect(readme).toMatch(/flash/i);
    expect(readme).toMatch(/cifrad|encrypt/i);
    expect(readme).toMatch(/revoc|revok/i);
    expect(readme).toMatch(/devices\.txt|lista de aparatos|device list/i);
    expect(readme).toMatch(/pio run|platformio/i);
  });
});
