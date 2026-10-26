/* eslint-disable security/detect-non-literal-fs-filename -- archivos del repo y de las copias temporales */
import { deflateSync, crc32 } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ROOT,
  cleanTmp,
  cloneRepo,
  git,
  has,
  mkTmp,
  node,
  put,
  read,
  run,
  useHooks,
} from "./helpers.ts";
import { walk } from "./helpers.ts";

afterAll(cleanTmp);

const SCAN = ["tools/lib/public-scan.ts"];

// Los valores de relleno de CA5 se arman por partes: así este archivo no los trae completos y el
// propio barrido de publicación no lo marca (no hace falta una excepción en public-scan-allow.txt).
const V = {
  home: ["", "home", "ana", "x"].join("/"),
  winHome: ["C:", "Users", "ana", "x"].join("\\"),
  mail: ["ana", "gmail.com"].join("@"),
  tsnet: ["casa", "tail1234", "ts", "net"].join("."),
  publicIp: [100, 101, 102, 103].join("."),
  privateIp: [10, 1, 2, 3].join("."),
  key: ["-----BEGIN EC", "PRIVATE KEY-----"].join(" "),
  entropy: ["Zx8Qp2Lm9R", "t4Vb7Nc1Kd6", "Hf3Jg5Ws0Ye"].join(""),
};

describe("R5 y R6 listas de archivos que nunca van al repo", () => {
  it("tools/never-commit.txt trae cada patrón de R5", () => {
    expect(has("tools/never-commit.txt"), "no existe tools/never-commit.txt").toBe(true);
    const lines = read("tools/never-commit.txt")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"));
    for (const pattern of [
      "**/secrets.h",
      "**/tintero_certs.h",
      "**/*.key",
      "**/*.p12",
      "**/*.pfx",
      "**/*.pem",
      "**/devices.txt",
      "**/calendarios.json",
      "**/integrations.json",
      "**/views.json",
      "**/state.json",
      "**/.env*",
    ]) {
      expect(
        lines.some((l) => l.includes(pattern)),
        pattern,
      ).toBe(true);
    }
    expect(lines.some((l) => l.includes("example.pem"))).toBe(true);
    expect(lines.some((l) => l.includes(".env.example"))).toBe(true);
  });

  it("R6: .gitignore cubre lo del firmware", () => {
    for (const path of [
      "firmware/.pio/x",
      "firmware/include/secrets.h",
      "firmware/include/tintero_certs.h",
    ]) {
      const r = git(ROOT, "check-ignore", "-q", path);
      expect(r.code, `${path} debería estar ignorado`).toBe(0);
    }
    expect(git(ROOT, "check-ignore", "-q", "firmware/include/secrets.h.example").code).toBe(1);
  });

  it("ningún archivo que sigue git coincide con la lista (revisión 1, paso 7)", () => {
    const files = git(ROOT, "ls-files").out.split("\n").filter(Boolean);
    const bad = files.filter((f) => {
      const base = f.slice(f.lastIndexOf("/") + 1);
      if (base.endsWith(".example.pem") || base === ".env.example") return false;
      return (
        [
          "secrets.h",
          "tintero_certs.h",
          "devices.txt",
          "calendarios.json",
          "integrations.json",
        ].includes(base) ||
        ["views.json", "state.json"].includes(base) ||
        /\.(key|p12|pfx|pem)$/.test(base) ||
        base.startsWith(".env")
      );
    });
    expect(bad).toEqual([]);
  });
});

describe("CA4 el pre-commit bloquea archivos que nunca van al repo", () => {
  let dir: string;
  beforeAll(() => {
    dir = cloneRepo();
    useHooks(dir);
  }, 120_000);

  const BLOCKED = [
    "firmware/include/secrets.h",
    "firmware/include/tintero_certs.h",
    "x.key",
    "deep/er/y.p12",
    "z.pfx",
    "config/leaf.pem",
    "devices.txt",
    "config/calendarios.json",
    "integrations.json",
    "views.json",
    "state.json",
    ".env.local",
    "config/.env.production",
  ];

  for (const path of BLOCKED) {
    it(`bloquea ${path} aunque se agregue con git add -f (salida 1 y nombra la ruta)`, () => {
      put(dir, path, "PLACEHOLDER=1\n");
      expect(git(dir, "add", "-f", path).code).toBe(0);
      const before = git(dir, "rev-list", "--count", "HEAD").out.trim();
      const commit = git(dir, "commit", "-m", "x");
      const after = git(dir, "rev-list", "--count", "HEAD").out.trim();
      git(dir, "rm", "-q", "-f", "--cached", path);
      expect(commit.code).toBe(1);
      expect(commit.all).toContain(path);
      expect(after, "no debió quedar ningún commit nuevo").toBe(before);
    }, 60_000);
  }

  it("el valor de relleno de secrets.h tampoco sale en el mensaje", () => {
    put(dir, "firmware/include/secrets.h", '#define WIFI_PASSWORD "placeholder-password"\n');
    git(dir, "add", "-f", "firmware/include/secrets.h");
    const commit = git(dir, "commit", "-m", "x");
    git(dir, "rm", "-q", "-f", "--cached", "firmware/include/secrets.h");
    expect(commit.code).toBe(1);
    expect(commit.all).not.toContain("placeholder-password");
  }, 60_000);

  it("config/x.example.pem y .env.example pasan", () => {
    put(
      dir,
      "config/x.example.pem",
      "-----BEGIN CERTIFICATE-----\nplaceholder\n-----END CERTIFICATE-----\n",
    );
    put(dir, "sub/.env.example", "EXAMPLE_KEY=placeholder\n");
    expect(git(dir, "add", "-f", "config/x.example.pem", "sub/.env.example").code).toBe(0);
    const commit = git(dir, "commit", "-m", "ejemplos");
    expect(commit.code, commit.all.slice(0, 500)).toBe(0);
  }, 120_000);

  it("con tools/never-commit.txt borrado, bloquea todo commit", () => {
    expect(has("tools/never-commit.txt"), "no existe tools/never-commit.txt").toBe(true);
    run("rm", ["-f", join(dir, "tools/never-commit.txt")]);
    put(dir, "docs-nota.txt", "una nota cualquiera\n");
    git(dir, "add", "docs-nota.txt");
    const commit = git(dir, "commit", "-m", "nota");
    expect(commit.code).toBe(1);
  }, 60_000);
});

// --- public-scan ------------------------------------------------------------

/** PNG mínimo de 1×1 en gris; `extra` son bloques ya armados que van antes de IDAT. */
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function png(extra: Buffer[] = []): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 0; // gris
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...extra,
    chunk("IDAT", deflateSync(Buffer.from([0, 0]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("CA5 public-scan --tree", () => {
  it("sobre main (la carpeta de trabajo) → salida 0", () => {
    expect(has("tools/lib/public-scan.ts"), "no existe tools/lib/public-scan.ts").toBe(true);
    const r = node(ROOT, [...SCAN, "--tree"]);
    expect(r.code, r.all.slice(0, 800)).toBe(0);
  }, 120_000);

  it("R7: sin opciones o con una opción desconocida → salida 2", () => {
    expect(node(ROOT, [...SCAN]).code).toBe(2);
    expect(node(ROOT, [...SCAN, "--nope"]).code).toBe(2);
    expect(node(ROOT, [...SCAN, "--tree", "--history"]).code).not.toBe(0);
  });

  describe("en una copia de prueba", () => {
    let dir: string;
    beforeAll(() => {
      dir = cloneRepo();
    }, 120_000);

    /** Agrega `files`, hace commit (sin hooks), corre el barrido y deja la copia como estaba. */
    function scanWith(files: Record<string, string | Buffer>): ReturnType<typeof node> {
      for (const [rel, content] of Object.entries(files)) put(dir, rel, content);
      git(dir, "add", "-f", ...Object.keys(files));
      git(dir, "commit", "--quiet", "--no-verify", "-m", "caso");
      const r = node(dir, [...SCAN, "--tree"]);
      git(dir, "rm", "-q", "-f", "-r", ...Object.keys(files));
      git(dir, "commit", "--quiet", "--no-verify", "-m", "quita el caso");
      return r;
    }

    const CASES: { name: string; file: string; value: string; check: string }[] = [
      { name: "ruta /home/<usuario>", file: "leak/home.txt", value: V.home, check: V.home },
      {
        name: "ruta C:\\Users\\<usuario>",
        file: "leak/win.txt",
        value: V.winHome,
        check: V.winHome,
      },
      { name: "correo", file: "leak/mail.txt", value: V.mail, check: V.mail },
      { name: "nombre *.ts.net", file: "leak/tsnet.txt", value: V.tsnet, check: V.tsnet },
      { name: "IPv4 pública", file: "leak/ip1.txt", value: V.publicIp, check: V.publicIp },
      { name: "IPv4 privada", file: "leak/ip2.txt", value: V.privateIp, check: V.privateIp },
      {
        name: "bloque de llave privada",
        file: "leak/key.txt",
        value: `${V.key}\nQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFB\n-----END EC PRIVATE KEY-----`,
        check: V.key,
      },
      {
        name: "cadena de 32 caracteres con entropía alta",
        file: "leak/ent.txt",
        value: V.entropy,
        check: V.entropy,
      },
    ];

    for (const c of CASES) {
      it(`${c.name}: salida 1, archivo y línea 3, y sin el valor`, () => {
        const body = `primera linea\nsegunda linea\n${c.value}\ncuarta linea\n`;
        const r = scanWith({ [c.file]: body });
        expect(r.code, r.all.slice(0, 600)).toBe(1);
        const lineWithFile = r.all.split("\n").find((l) => l.includes(c.file));
        expect(lineWithFile, `la salida no nombra ${c.file}`).toBeDefined();
        expect(lineWithFile).toMatch(/\b3\b/);
        expect(r.all).not.toContain(c.check);
        if (c.check === V.key) expect(r.all).not.toContain("QUFBQUFB");
      }, 120_000);
    }

    it("--json <salida> escribe un informe con la ruta y sin el valor, y sale 1", () => {
      const out = join(mkTmp(), "scan.json");
      put(dir, "leak/json.txt", `a\nb\n${V.mail}\n`);
      git(dir, "add", "-f", "leak/json.txt");
      git(dir, "commit", "--quiet", "--no-verify", "-m", "caso json");
      const r = node(dir, [...SCAN, "--tree", "--json", out]);
      git(dir, "rm", "-q", "-f", "leak/json.txt");
      git(dir, "commit", "--quiet", "--no-verify", "-m", "quita");
      expect(r.code).toBe(1);
      expect(existsSync(out)).toBe(true);
      const text = readFileSync(out, "utf8");
      expect(text).toContain("leak/json.txt");
      expect(text).not.toContain(V.mail);
      expect(() => JSON.parse(text) as unknown).not.toThrow();
    }, 120_000);

    it("los valores de relleno permitidos no marcan nada → salida 0", () => {
      const ok = [
        "tintero.example.ts.net",
        "192.0.2.1",
        "198.51.100.7",
        "203.0.113.9",
        "127.0.0.1",
        "0.0.0.0",
        "192.168.1.10",
        "10.0.0.1",
        "noreply@github.com",
        ["someone", "example.com"].join("@"),
        ["someone", "example.org"].join("@"),
      ].join("\n");
      const r = scanWith({ "leak/ok.txt": `${ok}\n` });
      expect(r.code, r.all.slice(0, 600)).toBe(0);
    }, 120_000);

    it("un archivo ilegible o inexistente en el índice no hace pasar el barrido (falla cerrado)", () => {
      expect(has("tools/lib/public-scan.ts"), "no existe tools/lib/public-scan.ts").toBe(true);
      put(dir, "leak/gone.txt", `x\ny\n${V.mail}\n`);
      git(dir, "add", "-f", "leak/gone.txt");
      git(dir, "commit", "--quiet", "--no-verify", "-m", "caso borrado");
      run("rm", ["-f", join(dir, "leak/gone.txt")]);
      const r = node(dir, [...SCAN, "--tree"]);
      git(dir, "rm", "-q", "-f", "--ignore-unmatch", "leak/gone.txt");
      git(dir, "commit", "--quiet", "--no-verify", "-m", "quita");
      expect(r.code).toBe(1);
    }, 120_000);
  });
});

describe("CA6 metadatos de imágenes", () => {
  let dir: string;
  beforeAll(() => {
    dir = cloneRepo();
  }, 120_000);

  function scanPng(file: string, buf: Buffer): ReturnType<typeof node> {
    put(dir, file, buf);
    git(dir, "add", "-f", file);
    git(dir, "commit", "--quiet", "--no-verify", "-m", "png");
    const r = node(dir, [...SCAN, "--tree"]);
    git(dir, "rm", "-q", "-f", file);
    git(dir, "commit", "--quiet", "--no-verify", "-m", "quita png");
    return r;
  }

  it("un PNG con bloque tEXt (Author=ana) → salida 1 con la ruta", () => {
    const text = chunk("tEXt", Buffer.from("Author\0ana", "latin1"));
    const r = scanPng("img/with-text.png", png([text]));
    expect(r.code, r.all.slice(0, 500)).toBe(1);
    expect(r.all).toContain("img/with-text.png");
    expect(r.all).not.toContain("Author=ana");
  }, 120_000);

  it("el mismo PNG sin el bloque → salida 0", () => {
    const r = scanPng("img/clean.png", png());
    expect(r.code, r.all.slice(0, 500)).toBe(0);
  }, 120_000);

  for (const [type, data] of [
    ["iTXt", Buffer.from("Comment\0\0\0\0\0ana", "latin1")],
    [
      "zTXt",
      Buffer.concat([Buffer.from("Comment\0\0", "latin1"), deflateSync(Buffer.from("ana"))]),
    ],
    ["eXIf", Buffer.from("MM\0*\0\0\0\b\0\0", "latin1")],
  ] as const) {
    it(`un PNG con bloque ${type} → salida 1 con la ruta`, () => {
      const file = `img/with-${type}.png`;
      const r = scanPng(file, png([chunk(type, data)]));
      expect(r.code, r.all.slice(0, 500)).toBe(1);
      expect(r.all).toContain(file);
    }, 120_000);
  }

  it("un JPEG con bloque EXIF (APP1) → salida 1 con la ruta", () => {
    const exif = Buffer.from("Exif\0\0MM\0*\0\0\0\b\0\0", "latin1");
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, exif.length + 2]), exif]);
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      app1,
      Buffer.from([0xff, 0xdb, 0, 3, 0, 0xff, 0xd9]),
    ]);
    const r = scanPng("img/with-exif.jpg", jpeg);
    expect(r.code, r.all.slice(0, 500)).toBe(1);
    expect(r.all).toContain("img/with-exif.jpg");
  }, 120_000);

  it("todo PNG de docs/ sale sin bloques de metadatos", () => {
    const META = new Set(["tEXt", "iTXt", "zTXt", "eXIf"]);
    const pngs = walk("docs").filter((f) => f.endsWith(".png"));
    const bad: string[] = [];
    for (const rel of pngs) {
      const buf = readFileSync(join(ROOT, rel));
      let at = 8;
      while (at + 8 <= buf.length) {
        const len = buf.readUInt32BE(at);
        const type = buf.toString("latin1", at + 4, at + 8);
        if (META.has(type)) bad.push(`${rel}: ${type}`);
        at += 12 + len;
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("CA7 public-scan --history", () => {
  it("sobre main → salida 0 en menos de 60 s", () => {
    expect(has("tools/lib/public-scan.ts"), "no existe tools/lib/public-scan.ts").toBe(true);
    const r = node(ROOT, [...SCAN, "--history"], 180_000);
    expect(r.code, r.all.slice(0, 800)).toBe(0);
    expect(r.ms).toBeLessThan(60_000);
  }, 200_000);
});
