/* eslint-disable security/detect-non-literal-fs-filename, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- JSON de prueba */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEngine, parseDataFile, parseViewsConfig } from "../../../server/src/engine/index.ts";
import {
  P124,
  ROOT,
  V124,
  index8,
  launchChromium,
  makeClock,
  runNpm,
  type TestChromium,
} from "./helpers.ts";

// Aclarado por F-015: la igualdad píxel a píxel ya no puede darse (F-015 cambia los títulos); se prueba la propiedad que protegía.
describe("CA13 sin pictogramas, la cuadrícula no cambia", () => {
  let cr: TestChromium;
  beforeAll(async () => {
    cr = await launchChromium();
  }, 300_000);
  afterAll(async () => {
    await cr.stop();
  }, 120_000);

  it.each([
    ["P124", P124],
    ["V124", V124],
  ] as const)(
    "views.example + data.example en %s: ningún bloque agenda tiene <svg y su cuadrícula no lleva columna de pictograma",
    async (_name, panel) => {
      const config = parseViewsConfig(
        readFileSync(join(ROOT, "config/views.example.json"), "utf8"),
      );
      const data = parseDataFile(
        readFileSync(join(ROOT, "config/data.example.json"), "utf8"),
        config,
      );
      const engine = createEngine({
        nextWakeS: 1800,
        clock: makeClock("2026-10-23T12:00:00Z").clock,
        config,
        data,
        renderer: cr.renderer,
      });
      const n0 = cr.renderer.calls.length;
      try {
        await index8(engine, "local", panel);
        await engine.idle();
      } finally {
        await engine.close();
      }
      const grids: string[] = [];
      for (const c of cr.renderer.calls.slice(n0)) {
        for (const m of c.html.matchAll(
          /class="a"\s+style="[^"]*?grid-template-columns:([^;"]*)/g,
        )) {
          grids.push(m[1] ?? "");
        }
        // solo la agenda dibuja pictogramas: una página con bloque agenda no debe traer <svg
        if (c.html.includes('class="a"')) expect(c.html).not.toContain("<svg");
      }
      expect(grids.length).toBeGreaterThan(0);
      for (const g of grids) {
        // sin pictograma: "max-content minmax(0,1fr)" (más "max-content" delante si hay columna de día); nunca "Npx …"
        expect(g, g).not.toMatch(/\d+px/);
        expect(g, g).toContain("minmax(0,1fr)");
        expect(g.trim().split(/\s+(?![^()]*\))/).length, g).toBeLessThanOrEqual(3);
      }
    },
    300_000,
  );
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
