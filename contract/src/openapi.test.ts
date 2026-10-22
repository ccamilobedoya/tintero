import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openApiDocument, validateIndex, validateZones } from "./index.ts";

const doc = JSON.parse(JSON.stringify(openApiDocument)) as {
  openapi: string;
  paths: Map<string, unknown>;
  components: { securitySchemes: Record<string, { type: string }> };
};

// Follows a path of keys through plain JSON data.
function dig(root: unknown, ...keys: string[]): unknown {
  return keys.reduce<unknown>((node, key) => Reflect.get(node as object, key), root);
}

describe("openApiDocument", () => {
  it("is OpenAPI 3.1 with the five routes and mutualTLS", () => {
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(Object.keys(dig(doc, "paths") as object).sort()).toEqual([
      "/api/v1/actions",
      "/api/v1/index",
      "/api/v1/log",
      "/api/v1/views/{id}/image",
      "/api/v1/views/{id}/zones",
    ]);
    expect(Object.values(doc.components.securitySchemes).map((s) => s.type)).toEqual(["mutualTLS"]);
  });

  it("carries examples that pass the validators", () => {
    const example = (route: string): string =>
      JSON.stringify(
        dig(
          doc,
          "paths",
          route,
          "get",
          "responses",
          "200",
          "content",
          "application/json",
          "example",
        ),
      );
    expect(validateIndex(example("/api/v1/index")).ok).toBe(true);
    const zones = example("/api/v1/views/{id}/zones");
    expect(validateZones(zones, { w: 800, h: 480, dpi: 124, depth: 1 }).ok).toBe(true);
  });

  it("matches the generated file", () => {
    const file = join(import.meta.dirname, "..", "openapi", "v1.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(doc);
  });
});
