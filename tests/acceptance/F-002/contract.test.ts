import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateIndex } from "../../../contract/src/index.ts";
import { ROOT, runNpm } from "./helpers.ts";

const FIX = join(ROOT, "contract/fixtures/v1");

function read(rel: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed repo paths
  return readFileSync(join(ROOT, rel), "utf8");
}

function indexWith(views: Record<string, unknown>[], current = "todo"): string {
  return JSON.stringify({
    protocol: 1,
    server_time: 1761096000,
    next_wake_s: 1800,
    full_refresh: false,
    panel: { w: 800, h: 480, dpi: 124, depth: 1 },
    current,
    views,
  });
}
const v = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  hash: "9f2c1a7b",
  format: "raw1",
  bytes: 48000,
  crc32: "3a1f09c4",
  ...over,
});

function findKey(node: unknown, key: string): unknown {
  if (node === null || typeof node !== "object") return undefined;
  for (const [k, val] of Object.entries(node)) {
    if (k === key) return val;
    const inner = findKey(val, key);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

describe("CA19 contrato: parent (D1)", () => {
  it("acepta una vista con parent existente", () => {
    const r = validateIndex(indexWith([v("todo"), v("detalle", { parent: "todo" })], "detalle"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.views[1]).toMatchObject({ id: "detalle", parent: "todo" });
  });

  it("rechaza parent inexistente con unknown_parent", () => {
    const r = validateIndex(indexWith([v("todo"), v("detalle", { parent: "nada" })]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("unknown_parent");
  });

  it("rechaza parent igual a su propio id con unknown_parent", () => {
    const r = validateIndex(indexWith([v("todo", { parent: "todo" })]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("unknown_parent");
  });

  it("parent con formato inválido sigue siendo un error de esquema", () => {
    const r = validateIndex(indexWith([v("todo"), v("detalle", { parent: "NOPE!" })]));
    expect(r.ok).toBe(false);
  });

  it("sin parent sigue siendo válido (aditivo)", () => {
    expect(validateIndex(indexWith([v("todo")])).ok).toBe(true);
  });

  it("los tres ejemplos nuevos existen y validan como dice su nombre", () => {
    const valid = join(FIX, "valid/index-parent-detail.json");
    const missing = join(FIX, "invalid/index-unknown_parent-missing.json");
    const self = join(FIX, "invalid/index-unknown_parent-self.json");
    for (const f of [valid, missing, self]) expect(existsSync(f), f).toBe(true);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed repo paths
    const ok = validateIndex(readFileSync(valid, "utf8"));
    expect(ok.ok).toBe(true);
    if (ok.ok)
      expect(ok.value.views.some((x) => (x as { parent?: string }).parent !== undefined)).toBe(
        true,
      );
    for (const f of [missing, self]) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed repo paths
      const r = validateIndex(readFileSync(f, "utf8"));
      expect(r.ok, f).toBe(false);
      if (!r.ok)
        expect(
          r.errors.map((e) => e.code),
          f,
        ).toContain("unknown_parent");
    }
  });

  it("el esquema JSON y el OpenAPI declaran parent como opcional", () => {
    const schema = JSON.parse(read("contract/schema/v1/index.schema.json")) as unknown;
    const parent = findKey(schema, "parent") as { pattern?: string } | undefined;
    expect(parent?.pattern).toBe("^[a-z0-9_-]{1,16}$");
    const spec = JSON.parse(read("contract/openapi/v1.json")) as unknown;
    expect(findKey(spec, "parent")).toBeDefined();
    const items = findKey(schema, "items") as { required?: string[] } | undefined;
    expect(items?.required ?? []).not.toContain("parent");
  });

  it("ningún ejemplo existente cambió respecto a main (solo se agregan)", () => {
    const out = execFileSync(
      "git",
      ["diff", "--name-status", "main", "--", "contract/fixtures/v1"],
      {
        cwd: ROOT,
        encoding: "utf8",
      },
    );
    const changes = out.split("\n").filter((l) => l.trim() !== "");
    expect(changes.filter((l) => !l.startsWith("A"))).toEqual([]);
  });

  it("npm run contract:check pasa", async () => {
    const r = await runNpm("contract:check", []);
    expect(r.code, r.stdout + r.stderr).toBe(0);
  }, 60_000);
});
