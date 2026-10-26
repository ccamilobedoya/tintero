/* eslint-disable security/detect-non-literal-fs-filename, security/detect-unsafe-regex, security/detect-non-literal-regexp -- PKI de prueba en carpetas temporales, archivos del repo y nombres fijos de la prueba */
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig, runWake } from "../../../emulator/src/index.ts";
import { pkiDevice, pkiInit, pkiServer } from "../../../server/scripts/pki.ts";
import { startServer } from "../../../server/src/index.ts";
import { makePki, rmDir, tlsConfig, type Pki } from "../F-004/helpers.ts";
import { ROOT, cleanTmp, cloneRepo, mkTmp, node, run } from "./helpers.ts";

afterAll(cleanTmp);

const HOST = "tintero.example.ts.net";
const TOOL = "server/scripts/pki.ts";

// --- lectura de las constantes del encabezado generado ---------------------------------------

const UNESCAPE: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  "\\": "\\",
  '"': '"',
  "'": "'",
};

/** Lee los literales de cadena de C/C++ que empiezan en `from` (con concatenación y R"x(...)x"). */
function literalsAt(s: string, from: number): string | undefined {
  let i = from;
  let out = "";
  let found = false;
  for (;;) {
    while (i < s.length && (/\s/.test(s.charAt(i)) || s.startsWith("\\\n", i))) {
      i += s.startsWith("\\\n", i) ? 2 : 1;
    }
    const raw = /^(?:u8|u|U|L)?R"([^()\\\s]{0,16})\(/.exec(s.slice(i));
    if (raw) {
      const end = `)${raw[1] ?? ""}"`;
      const start = i + raw[0].length;
      const stop = s.indexOf(end, start);
      if (stop < 0) return undefined;
      out += s.slice(start, stop);
      i = stop + end.length;
      found = true;
      continue;
    }
    if (s.charAt(i) === '"') {
      i++;
      while (i < s.length && s.charAt(i) !== '"') {
        if (s.charAt(i) === "\\") {
          out += UNESCAPE[s.charAt(i + 1)] ?? s.charAt(i + 1);
          i += 2;
        } else out += s.charAt(i++);
      }
      i++;
      found = true;
      continue;
    }
    return found ? out : undefined;
  }
}

/** Valor de la constante `name` (`const char NAME[] = "…"` o `#define NAME "…"`). */
function constant(header: string, name: string): string {
  for (const m of header.matchAll(new RegExp(`\\b${name}\\b`, "g"))) {
    const after = header.slice(m.index + name.length);
    const decl = /^\s*(\[[^\]]*\])?\s*=?/.exec(after);
    const value = literalsAt(header, m.index + name.length + (decl?.[0].length ?? 0));
    if (value !== undefined) return value;
  }
  throw new Error(`el encabezado no define ${name}`);
}

/** Cuerpo base64 de un PEM, sin cabeceras ni saltos de línea. */
const body = (pem: string): string =>
  pem
    .split("\n")
    .filter((l) => l !== "" && !l.startsWith("-----"))
    .join("");

/** El encabezado sin comillas, `\n` literales ni espacios, para buscar cuerpos base64. */
const squashed = (header: string): string => header.replaceAll("\\n", "").replace(/[\s"\\]/g, "");

/** El uso de la herramienta antes de esta ficha: el subcomando `firmware` aún no existía. */
const OLD_USAGE =
  "usage: pki init <folder> | pki server <folder> <dns-name> | pki device <folder> <id>";

/** Salida 2 por un error propio de `firmware`, no por el subcomando desconocido de antes. */
function refused(r: ReturnType<typeof node>): void {
  expect(r.code, r.all.slice(0, 300)).toBe(2);
  expect(r.err.trim(), "es el uso viejo: no existe el subcomando firmware").not.toBe(OLD_USAGE);
}

const fw = (cwd: string, tool: string, args: string[]): ReturnType<typeof node> =>
  node(cwd, [tool, "firmware", ...args], 60_000);

describe("el lector del encabezado (herramienta de esta prueba)", () => {
  it("entiende cadenas crudas, literales concatenados con \\n y #define", () => {
    const sample = [
      "// TINTERO_HOST is set below",
      'static const char TINTERO_HOST[] = "a.example";',
      'static const char TINTERO_CA_PEM[] = R"PEM(-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----\n)PEM";',
      "const char* const TINTERO_DEVICE_CERT_PEM =",
      '    "-----BEGIN CERTIFICATE-----\\n"',
      '    "REVG\\n"',
      '    "-----END CERTIFICATE-----\\n";',
      '#define TINTERO_DEVICE_ID "p1"',
    ].join("\n");
    expect(constant(sample, "TINTERO_HOST")).toBe("a.example");
    expect(constant(sample, "TINTERO_CA_PEM")).toBe(
      "-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----\n",
    );
    expect(constant(sample, "TINTERO_DEVICE_CERT_PEM")).toBe(
      "-----BEGIN CERTIFICATE-----\nREVG\n-----END CERTIFICATE-----\n",
    );
    expect(constant(sample, "TINTERO_DEVICE_ID")).toBe("p1");
    expect(body("-----BEGIN X-----\nQUJD\nREVG\n-----END X-----\n")).toBe("QUJDREVG");
  });
});

// --- PKI de prueba ----------------------------------------------------------------------------

let pki: string;
beforeAll(async () => {
  pki = join(mkTmp(), "pki");
  await pkiInit(pki);
  await pkiServer(pki, HOST);
  await pkiDevice(pki, "p1");
  await pkiDevice(pki, "p2");
}, 120_000);

const pem = (rel: string): string => readFileSync(join(pki, rel), "utf8");

describe("CA13 pki firmware escribe el encabezado de una sola pantalla", () => {
  let out: string;
  let header: string;
  let run1: ReturnType<typeof node>;
  beforeAll(() => {
    out = join(mkTmp(), "c.h");
    run1 = fw(ROOT, TOOL, [pki, "--host", HOST, "p1", "--out", out]);
    header = existsSync(out) ? readFileSync(out, "utf8") : "";
  });

  it("sale 0 y el archivo tiene modo 600", () => {
    expect(run1.code, run1.all.slice(0, 400)).toBe(0);
    expect(statSync(out).mode & 0o777).toBe(0o600);
  });

  it("TINTERO_HOST y TINTERO_DEVICE_ID", () => {
    expect(constant(header, "TINTERO_HOST")).toBe(HOST);
    expect(constant(header, "TINTERO_DEVICE_ID")).toBe("p1");
  });

  it("cada PEM es igual al de su archivo", () => {
    expect(constant(header, "TINTERO_CA_PEM").trim()).toBe(pem("ca.crt").trim());
    expect(constant(header, "TINTERO_DEVICE_CERT_PEM").trim()).toBe(pem("devices/p1.crt").trim());
    expect(constant(header, "TINTERO_DEVICE_KEY_PEM").trim()).toBe(pem("devices/p1.key").trim());
  });

  it("ningún byte del certificado ni de la llave de p2 (y sí los de p1: la prueba mide algo)", () => {
    const flat = squashed(header);
    expect(flat).toContain(body(pem("devices/p1.key")));
    for (const file of ["devices/p2.crt", "devices/p2.key"]) {
      const p2 = body(pem(file));
      expect(flat, file).not.toContain(p2);
      expect(flat, `${file} (primeros 40 caracteres)`).not.toContain(p2.slice(0, 40));
    }
  });

  it("la salida de la herramienta no contiene PRIVATE KEY ni el cuerpo de la llave", () => {
    expect(run1.all).not.toContain("PRIVATE KEY");
    expect(run1.all).not.toContain(body(pem("devices/p1.key")).slice(0, 40));
  });

  it("si el destino existe lo reemplaza (modo 600, sin temporales) con la otra pantalla", () => {
    const again = fw(ROOT, TOOL, [pki, "--host", HOST, "p2", "--out", out]);
    expect(again.code, again.all.slice(0, 400)).toBe(0);
    const now = readFileSync(out, "utf8");
    expect(constant(now, "TINTERO_DEVICE_ID")).toBe("p2");
    expect(squashed(now)).not.toContain(body(pem("devices/p1.key")));
    expect(statSync(out).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(out, ".."))).toEqual(["c.h"]);
  });

  it("también funciona con npm run pki -- firmware …", () => {
    const dest = join(mkTmp(), "n.h");
    const r = run("npm", [
      "run",
      "--silent",
      "pki",
      "--",
      "firmware",
      pki,
      "--host",
      HOST,
      "p1",
      "--out",
      dest,
    ]);
    expect(r.code, r.all.slice(0, 400)).toBe(0);
    expect(constant(readFileSync(dest, "utf8"), "TINTERO_DEVICE_ID")).toBe("p1");
  }, 60_000);
});

describe("CA14 errores de uso: salida 2 y no escribe nada", () => {
  /** Corre con `--out` en una carpeta vacía propia; comprueba salida 2 y la carpeta sigue vacía. */
  function bad(args: string[], folder: string = pki): void {
    const dir = mkTmp();
    const r = fw(ROOT, TOOL, [folder, ...args, "--out", join(dir, "c.h")]);
    refused(r);
    expect(existsSync(join(dir, "c.h"))).toBe(false);
    expect(readdirSync(dir), "quedó algo (¿un temporal?) en la carpeta de destino").toEqual([]);
    expect(r.all).not.toContain("PRIVATE KEY");
  }

  it("sin --host", () => {
    bad(["p1"]);
  });
  for (const host of ["a b", "-bad.example", "bad_host.example", "a..b", "", "x".repeat(64)]) {
    it(`--host ${JSON.stringify(host.length > 20 ? `${host.slice(0, 10)}…` : host)} no es un DNS válido`, () => {
      bad(["--host", host, "p1"]);
    });
  }
  it("sin pantalla", () => {
    bad(["--host", HOST]);
  });
  it("con p1 p2 (más de una pantalla)", () => {
    bad(["--host", HOST, "p1", "p2"]);
  });
  it("con p9, que no tiene certificado", () => {
    bad(["--host", HOST, "p9"]);
  });

  describe("con un PEM de 5 000 bytes", () => {
    const huge = (): string => {
      const lines = ["-----BEGIN CERTIFICATE-----"];
      while (lines.join("\n").length < 4960) lines.push("A".repeat(64));
      lines.push("-----END CERTIFICATE-----", "");
      return lines.join("\n").padEnd(5000, "\n");
    };
    for (const file of ["devices/p1.crt", "devices/p1.key", "ca.crt"]) {
      it(`${file} de 5 000 bytes`, () => {
        const copy = join(mkTmp(), "pki");
        cpSync(pki, copy, { recursive: true });
        writeFileSync(join(copy, file), huge());
        expect(statSync(join(copy, file)).size).toBe(5000);
        bad(["--host", HOST, "p1"], copy);
      });
    }
  });
});

describe("CA15 --out dentro del repo solo donde git ignora", () => {
  let repo: string;
  beforeAll(() => {
    repo = cloneRepo();
  }, 120_000);

  it("docs/c.h (git no lo ignora) → salida 2 y no se escribe", () => {
    const r = fw(repo, join(repo, TOOL), [
      pki,
      "--host",
      HOST,
      "p1",
      "--out",
      join(repo, "docs/c.h"),
    ]);
    refused(r);
    expect(existsSync(join(repo, "docs/c.h"))).toBe(false);
  }, 60_000);

  it("la misma ruta escrita en relativo → salida 2", () => {
    const r = fw(repo, join(repo, TOOL), [pki, "--host", HOST, "p1", "--out", "docs/c.h"]);
    refused(r);
    expect(existsSync(join(repo, "docs/c.h"))).toBe(false);
  }, 60_000);

  it("un .h cualquiera de firmware/include que git no ignora → salida 2", () => {
    const r = fw(repo, join(repo, TOOL), [
      pki,
      "--host",
      HOST,
      "p1",
      "--out",
      join(repo, "firmware/include/other.h"),
    ]);
    refused(r);
    expect(existsSync(join(repo, "firmware/include/other.h"))).toBe(false);
  }, 60_000);

  it("firmware/include/tintero_certs.h (ignorado) → escribe, con modo 600", () => {
    const dest = join(repo, "firmware/include/tintero_certs.h");
    const r = fw(repo, join(repo, TOOL), [pki, "--host", HOST, "p1", "--out", dest]);
    expect(r.code, r.all.slice(0, 300)).toBe(0);
    expect(statSync(dest).mode & 0o777).toBe(0o600);
    expect(constant(readFileSync(dest, "utf8"), "TINTERO_DEVICE_ID")).toBe("p1");
  }, 60_000);

  it("sin --out escribe en firmware/include/tintero_certs.h del repo", () => {
    const dest = join(repo, "firmware/include/tintero_certs.h");
    run("rm", ["-f", dest]);
    const r = fw(repo, join(repo, TOOL), [pki, "--host", HOST, "p2"]);
    expect(r.code, r.all.slice(0, 300)).toBe(0);
    expect(statSync(dest).mode & 0o777).toBe(0o600);
    expect(constant(readFileSync(dest, "utf8"), "TINTERO_DEVICE_ID")).toBe("p2");
  }, 60_000);
});

describe("CA16 el emulador despierta con la CA y los certificados de la PKI", () => {
  let good: Pki;
  beforeAll(async () => {
    good = await makePki();
  }, 120_000);
  afterAll(() => {
    rmDir(good.root);
  });

  it("índice e imagen de current, con los PEM tal como salen de pki firmware", async () => {
    // Los PEM salen del encabezado generado (no de los archivos): se prueba lo que irá al aparato.
    const dir = mkTmp();
    const header = join(dir, "c.h");
    const r = fw(ROOT, TOOL, [good.goodDir, "--host", "localhost", "p1", "--out", header]);
    expect(r.code, r.all.slice(0, 300)).toBe(0);
    const text = readFileSync(header, "utf8");
    const caFile = join(dir, "ca.crt");
    const certFile = join(dir, "p1.crt");
    const keyFile = join(dir, "p1.key");
    writeFileSync(caFile, constant(text, "TINTERO_CA_PEM"));
    writeFileSync(certFile, constant(text, "TINTERO_DEVICE_CERT_PEM"));
    writeFileSync(keyFile, constant(text, "TINTERO_DEVICE_KEY_PEM"), { mode: 0o600 });

    const server = await startServer(tlsConfig(good), 0);
    try {
      const port = new URL(server.url).port;
      const config = {
        ...defaultConfig(`https://localhost:${port}`, join(dir, "store")),
        tls: { caFile, certFile, keyFile },
      };
      const report = await runWake(config);
      expect(report.errors).toEqual([]);
      expect(report.current, "no hay vista current").not.toBeNull();
      expect(report.downloaded.length).toBeGreaterThan(0);
      expect(
        report.requests.some((q) => q.path.startsWith("/api/v1/index") && q.status === 200),
      ).toBe(true);
      expect(
        report.requests.some(
          (q) => q.path.includes(`/views/${report.current ?? ""}/image`) && q.status === 200,
        ),
      ).toBe(true);
    } finally {
      await server.close();
    }
  }, 60_000);
});
