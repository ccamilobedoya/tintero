import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REPO } from "./helpers.ts";

const UNIT_REL = join("." + "config", "systemd", "user", "tintero.service");
let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "f010-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(env: string): { code: number | null; out: string; err: string } {
  const file = join(dir, "local.env");
  writeFileSync(file, env);
  // Always --dry-run; HOME is a scratch dir so nothing real can be written.
  const r = spawnSync(`${REPO}tools/instalar-servicio`, ["--dry-run"], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1_048_576,
    env: { ...process.env, TINTERO_LOCAL_ENV: file, HOME: dir },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const GOOD = "TINTERO_DIR=/srv/t\nTINTERO_NODE=/usr/bin/node\nTINTERO_ARGS=--port 8790\n";

describe("CA4 plantilla e instalador", () => {
  const realTarget = join(homedir(), UNIT_REL);
  const existed = existsSync(realTarget);

  it("imprime la unidad completa y sin marcadores", () => {
    const r = run(GOOD);
    expect(r.code).toBe(0);
    const lines = r.out.split("\n");
    for (const line of [
      "WorkingDirectory=/srv/t",
      "ExecStart=/usr/bin/node server/src/main.ts --port 8790",
      "Restart=always",
      "RestartSec=5",
      "StartLimitIntervalSec=0",
      "WantedBy=default.target",
    ]) {
      expect(lines).toContain(line);
    }
    expect(r.out).not.toMatch(/@[A-Z_]+@/);
  });

  it("no escribe nada con --dry-run", () => {
    run(GOOD);
    expect(existsSync(join(dir, UNIT_REL))).toBe(false);
    if (!existed) expect(existsSync(realTarget)).toBe(false);
  });

  it("sin TINTERO_DIR sale con 2 y lo nombra", () => {
    const r = run("TINTERO_NODE=/usr/bin/node\nTINTERO_ARGS=--port 8790\n");
    expect(r.code).toBe(2);
    expect(r.err + r.out).toContain("TINTERO_DIR");
  });

  it("un valor con salto de línea (retorno de carro en medio) sale con 2", () => {
    const r = run(
      "TINTERO_DIR=/srv/t\rExecStartPre=/bin/evil\nTINTERO_NODE=/usr/bin/node\nTINTERO_ARGS=a\n",
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toContain("ExecStartPre");
  });

  it("una línea extra no inyecta directivas en la unidad", () => {
    const r = run(GOOD + "ExecStartPre=/bin/evil\n");
    expect(r.out).not.toContain("ExecStartPre");
  });
});
