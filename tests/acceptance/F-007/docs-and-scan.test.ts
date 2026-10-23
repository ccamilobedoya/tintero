import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.ts";

describe("CA5 server/README.md documenta el conteo de paneles", () => {
  it("dice que no se poda y que está acotado por aparatos listados × --max-panels", () => {
    const text = readFileSync(join(ROOT, "server/README.md"), "utf8");
    const joined = text
      .split("\n")
      .filter((l) => /panel/i.test(l))
      .join("\n");
    expect(joined).toMatch(/no se poda/i);
    expect(joined).toMatch(/--max-panels/);
    expect(joined).toMatch(/acotad/i);
    expect(joined).toMatch(/aparatos listados/i);
    expect(joined).toMatch(/arranc/i);
  });
});

const RULE = /nosemgrep:\s*tintero-lectura-sin-tope/;
const WITH_REASON = /nosemgrep:\s*tintero-lectura-sin-tope\s+--\s+\S/;

function repoFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return out
    .split("\n")
    .filter((f) => /\.(ts|js|mjs|cjs)$/.test(f))
    .filter((f) => !f.startsWith("tests/") && !f.startsWith("tools/"));
}

describe("CA6 regla tintero-lectura-sin-tope", () => {
  it("tools/revisar no deja hallazgos de la regla (.revisar/semgrep.json)", () => {
    const file = join(ROOT, ".revisar/semgrep.json");
    if (!existsSync(file)) {
      throw new Error("falta .revisar/semgrep.json: corre `tools/revisar --base main` antes");
    }
    const data = JSON.parse(readFileSync(file, "utf8")) as {
      results?: { check_id?: string; path?: string; start?: { line?: number } }[];
    };
    expect(Array.isArray(data.results)).toBe(true);
    const hits = (data.results ?? [])
      .filter((r) => (r.check_id ?? "").endsWith("tintero-lectura-sin-tope"))
      .map((r) => `${r.path ?? "?"}:${String(r.start?.line ?? 0)}`);
    expect(hits).toEqual([]);
  });

  it("emulator/src/http.ts no tiene ningún nosemgrep", () => {
    const src = readFileSync(join(ROOT, "emulator/src/http.ts"), "utf8");
    expect(src).not.toMatch(/nosemgrep/);
  });

  it("todo nosemgrep: tintero-lectura-sin-tope lleva un motivo después de `--`", () => {
    const bad: string[] = [];
    for (const f of repoFiles()) {
      const lines = readFileSync(join(ROOT, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (RULE.test(line) && !WITH_REASON.test(line)) bad.push(`${f}:${String(i + 1)}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
