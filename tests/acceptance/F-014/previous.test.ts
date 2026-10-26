/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- carpetas temporales propias y JSON de prueba */
import { execFile, spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { decodePng1 } from "../F-002/helpers.ts";
import { ROOT, rmDir, runNpm, tmpDir } from "./helpers.ts";

const dir = tmpDir("tintero-f014-prev-");
afterAll(() => {
  rmDir(dir);
});

/** El último commit de `ficha/F-014` antes de esta ficha (lo que había al aprobarse). */
const BASE_REF = "1cd67561643a2ad890698539bae8ebc6cb8fe33c";

function renderIn(
  cwd: string,
  out: string,
  panel: string,
): Promise<{ code: number | null; log: string }> {
  mkdirSync(out, { recursive: true });
  return new Promise((resolve) => {
    const p = spawn(
      process.execPath,
      [
        "server/scripts/render.ts",
        "--views",
        "config/views.example.json",
        "--data",
        "config/data.example.json",
        "--panel",
        panel,
        "--out",
        out,
        "--now",
        "2026-10-23T12:00:00Z",
      ],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );
    let log = "";
    p.stdout.on("data", (d: Buffer) => (log += d.toString()));
    p.stderr.on("data", (d: Buffer) => (log += d.toString()));
    const t = setTimeout(() => p.kill("SIGKILL"), 280_000);
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, log });
    });
  });
}

describe("CA13 sin pictogramas, la imagen no cambia", () => {
  it("views.example + data.example: cada vista idéntica píxel a píxel a la de antes de la ficha", async () => {
    const base = join(dir, "base");
    mkdirSync(base);
    const tar = join(dir, "base.tar");
    const a = spawnSync("git", ["-C", ROOT, "archive", "--format=tar", "-o", tar, BASE_REF]);
    expect(a.status, String(a.stderr)).toBe(0);
    const x = spawnSync("tar", ["-xf", tar, "-C", base]);
    expect(x.status, String(x.stderr)).toBe(0);
    symlinkSync(join(ROOT, "node_modules"), join(base, "node_modules"));

    for (const [name, panel] of [
      ["p124", "w=800,h=480,dpi=124,depth=1"],
      ["v124", "w=480,h=800,dpi=124,depth=1"],
    ] as const) {
      const before = join(dir, `antes-${name}`);
      const now = join(dir, `ahora-${name}`);
      const rb = await renderIn(base, before, panel);
      expect(rb.code, rb.log).toBe(0);
      const rn = await renderIn(ROOT, now, panel);
      expect(rn.code, rn.log).toBe(0);
      const files = readdirSync(before).sort();
      expect(files.length).toBeGreaterThan(0);
      expect(readdirSync(now).sort()).toEqual(files);
      for (const f of files.filter((n) => n.endsWith(".png"))) {
        const pa = decodePng1(new Uint8Array(readFileSync(join(before, f))));
        const pn = decodePng1(new Uint8Array(readFileSync(join(now, f))));
        expect(Buffer.from(pn.rows).equals(Buffer.from(pa.rows)), `${name}/${f}`).toBe(true);
      }
    }
  }, 700_000);
});

describe("CA14 lo que ya existe", () => {
  it("las pruebas de aceptación de F-005, F-006, F-008, F-009 y F-013 siguen pasando", async () => {
    const r = await runNpm(
      "test:acceptance",
      [
        "tests/acceptance/F-005",
        "tests/acceptance/F-006",
        "tests/acceptance/F-008",
        "tests/acceptance/F-009",
        "tests/acceptance/F-013/cli.test.ts",
        "tests/acceptance/F-013/draw.test.ts",
        "tests/acceptance/F-013/integration.test.ts",
        "tests/acceptance/F-013/logic.test.ts",
      ],
      1_700_000,
    );
    expect(r.code, (r.out + r.err).slice(-4000)).toBe(0);
  }, 1_800_000);
});

function run(cmd: string, args: string[], ms: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, timeout: ms, maxBuffer: 1 << 20 }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === "number" ? error.code : 1;
      resolve({ code, out: stdout + stderr });
    });
  });
}

describe("CA15 ical.js exacta", () => {
  it("npm ls da 2.2.1 y package.json la fija sin ^ ni ~", async () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const wanted = { ...pkg.dependencies, ...pkg.devDependencies }["ical.js"];
    expect(wanted).toBe("2.2.1");
    const r = await run("npm", ["ls", "ical.js"], 60_000);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("ical.js@2.2.1");
  }, 90_000);

  it("npm audit signatures pasa", async () => {
    const r = await run("npm", ["audit", "signatures"], 120_000);
    expect(r.code, r.out).toBe(0);
  }, 150_000);
});
