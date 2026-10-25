/* eslint-disable security/detect-non-literal-fs-filename -- scratch dir under the OS tmp */
/* eslint-disable security/detect-non-literal-regexp -- fixed literals from this file */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO = new URL("../../../", import.meta.url).pathname;
const MARK = "\n# config/serve.json\n";
let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "f012-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(env: string): { code: number | null; out: string; err: string } {
  const file = join(dir, "local.env");
  writeFileSync(file, env);
  // Always --dry-run; HOME is a scratch dir so nothing real can be written.
  const r = spawnSync(`${REPO}tools/instalar-funnel`, ["--dry-run"], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1_048_576,
    env: { ...process.env, TINTERO_LOCAL_ENV: file, HOME: dir },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function good(): string {
  return (
    `TINTERO_FUNNEL_DIR=${join(dir, "f")}\nTINTERO_TLS_PORT=8443\n` +
    `TINTERO_AUTHKEY_FILE=${join(dir, "k")}\n`
  );
}

function split(out: string): { compose: string; serve: string } {
  const at = out.indexOf(MARK);
  expect(at).toBeGreaterThan(0);
  return {
    compose: out.slice(0, at).replace(/^# compose\.yaml\n/, ""),
    serve: out.slice(at + MARK.length),
  };
}

describe("CA1 plantillas e instalador", () => {
  it("imprime un compose.yaml con los ajustes exigidos y sin marcadores", () => {
    const r = run(good());
    expect(r.code).toBe(0);
    const { compose, serve } = split(r.out);
    expect(compose).toContain("network_mode: host");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toMatch(/cap_drop:\s*(\[ALL\]|\n\s*- ALL)/);
    // The sheet writes KEY=value; Compose's map form (KEY: value) is the same setting.
    for (const [key, value] of [
      ["TS_USERSPACE", "true"],
      ["TS_ACCEPT_DNS", "false"],
      ["TS_HOSTNAME", "tintero"],
    ] as const) {
      expect(compose).toMatch(new RegExp(`${key}(=|:\\s+)"?${value}"?(\\s|$)`, "m"));
    }
    expect(compose).toContain("--advertise-tags=tag:tintero");
    expect(compose).toContain("--port=0");
    expect(compose).toMatch(/image:\s*\S+@sha256:[0-9a-f]{64}/);
    expect(compose).toContain(join(dir, "k"));
    expect(r.out).not.toMatch(/@[A-Z_]+@/);
    expect(serve.length).toBeGreaterThan(0);
  });

  it("el serve.json es JSON válido: reenvía al 8443 y solo abre el 443", () => {
    const { serve } = split(run(good()).out);
    const json = JSON.parse(serve) as {
      TCP: Record<string, { TCPForward: string }>;
      AllowFunnel: Record<string, boolean>;
    };
    expect(Object.keys(json.TCP)).toEqual(["443"]);
    expect(json.TCP["443"]?.TCPForward).toBe("127.0.0.1:8443");
    const keys = Object.keys(json.AllowFunnel);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/:443$/);
    expect(json.AllowFunnel[keys[0] ?? ""]).toBe(true);
  });

  it("el puerto se toma de la configuración", () => {
    const r = run(good().replace("8443", "9555"));
    expect(split(r.out).serve).toContain("127.0.0.1:9555");
  });

  it("no escribe nada con --dry-run", () => {
    expect(run(good()).code).toBe(0);
    expect(existsSync(join(dir, "f"))).toBe(false);
  });

  it("sin TINTERO_TLS_PORT sale con 2 y la nombra", () => {
    const r = run(`TINTERO_FUNNEL_DIR=${join(dir, "f")}\nTINTERO_AUTHKEY_FILE=${join(dir, "k")}\n`);
    expect(r.code).toBe(2);
    expect(r.err).toContain("TINTERO_TLS_PORT");
    expect(r.out).toBe("");
  });

  it.each(["80", "1023", "65536", "abc", "8443x"])("TINTERO_TLS_PORT=%s sale con 2", (port) => {
    const r = run(good().replace("8443", port));
    expect(r.code).toBe(2);
    expect(r.err).toContain("TINTERO_TLS_PORT");
  });

  it("rechaza un marcador @ en un valor", () => {
    const r = run(good().replace("/k", "/k@x"));
    expect(r.code).toBe(2);
  });

  it("sin configuración local sale con 2", () => {
    const r = spawnSync(`${REPO}tools/instalar-funnel`, ["--dry-run"], {
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, TINTERO_LOCAL_ENV: join(dir, "no-existe"), HOME: dir },
    });
    expect(r.status).toBe(2);
  });

  it("el compose.yaml impreso pasa `docker compose config -q`", (ctx) => {
    const probe = spawnSync("docker", ["compose", "version"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (probe.status !== 0) ctx.skip();
    writeFileSync(join(dir, "k"), "");
    const work = join(dir, "node");
    mkdirSync(work);
    writeFileSync(join(work, "compose.yaml"), split(run(good()).out).compose);
    // Only validates the file; never starts anything.
    const r = spawnSync("docker", ["compose", "-f", join(work, "compose.yaml"), "config", "-q"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });
});
