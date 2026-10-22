import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  validateIndex,
  validateZones,
  validateActionsRequest,
  validateActionsResponse,
  validateLogRequest,
  validateErrorBody,
  openApiDocument,
} from "../../../contract/src/index.ts";
import type { Validation } from "../../../contract/src/index.ts";
import { PANEL } from "./helpers.ts";

const root = join(import.meta.dirname, "../../..");
const npm = (...args: string[]) =>
  execFileSync("npm", ["run", ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });

describe("CA12 fixtures", () => {
  const dir = (k: string) => join(root, "contract/fixtures/v1", k);
  // The fixture name does not say which message it is: try every validator.
  const validators: ((raw: string) => Validation<unknown>)[] = [
    (r) => validateIndex(r),
    (r) => validateZones(r, PANEL),
    (r) => validateActionsRequest(r),
    (r) => validateActionsResponse(r),
    (r) => validateLogRequest(r),
    (r) => validateErrorBody(r),
  ];
  const list = (k: string) =>
    existsSync(dir(k)) ? readdirSync(dir(k)).filter((f) => f.endsWith(".json")) : [];

  it("existen fixtures válidos e inválidos", () => {
    expect(list("valid").length).toBeGreaterThan(0);
    expect(list("invalid").length).toBeGreaterThan(0);
  });
  it.each(list("valid"))("valid/%s lo acepta algún validador", (f) => {
    const raw = readFileSync(join(dir("valid"), f), "utf8");
    expect(validators.some((v) => v(raw).ok)).toBe(true);
  });
  it.each(list("invalid"))("invalid/%s falla con el código de su nombre", (f) => {
    const m = /^invalid-([a-z_0-9]+?)-.+\.json$/.exec(f);
    expect(m, "nombre invalid-<code>-<detalle>.json").not.toBeNull();
    const code = m?.[1];
    const raw = readFileSync(join(dir("invalid"), f), "utf8");
    const results = validators.map((v) => v(raw));
    expect(results.some((r) => r.ok)).toBe(false);
    expect(results.some((r) => !r.ok && r.errors.some((e) => e.code === code))).toBe(true);
  });
});

describe("CA11 / R2 / R5 generación y control", () => {
  const schemaDir = join(root, "contract/schema/v1");
  const names = ["index", "zones", "actions-request", "actions-response", "log-request", "error"];

  it("existen los 6 JSON Schema y el OpenAPI", () => {
    for (const n of names) expect(existsSync(join(schemaDir, n + ".schema.json"))).toBe(true);
    expect(existsSync(join(root, "contract/openapi/v1.json"))).toBe(true);
  });
  it("openapi/v1.json es OpenAPI 3.1 con las 5 rutas y mutualTLS", () => {
    const doc = JSON.parse(readFileSync(join(root, "contract/openapi/v1.json"), "utf8")) as {
      openapi: string;
      paths: Record<string, unknown>;
      components?: { securitySchemes?: Record<string, { type: string }> };
    };
    expect(doc.openapi).toMatch(/^3\.1/);
    const paths = Object.keys(doc.paths);
    for (const p of [
      "/api/v1/index",
      "/api/v1/views/{id}/image",
      "/api/v1/views/{id}/zones",
      "/api/v1/actions",
      "/api/v1/log",
    ])
      expect(paths).toContain(p);
    const types = Object.values(doc.components?.securitySchemes ?? {}).map((s) => s.type);
    expect(types).toContain("mutualTLS");
    expect(JSON.parse(JSON.stringify(openApiDocument))).toEqual(doc);
  });
  it("contract:check pasa y falla si se edita un esquema a mano", () => {
    npm("contract:check");
    const file = join(schemaDir, "index.schema.json");
    const original = readFileSync(file, "utf8");
    try {
      const edited = { ...(JSON.parse(original) as object), "x-editado-a-mano": true };
      writeFileSync(file, JSON.stringify(edited, null, 2) + "\n");
      expect(() => npm("contract:check")).toThrow();
    } finally {
      writeFileSync(file, original);
    }
    npm("contract:check");
  }, 120_000);
  it("README.md tiene primera línea descriptiva", () => {
    const first = readFileSync(join(root, "contract/README.md"), "utf8").split("\n")[0] ?? "";
    expect(first.trim().length).toBeGreaterThan(10);
  });
});
