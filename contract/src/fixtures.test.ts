import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Panel, Validation } from "./index.ts";
import {
  validateActionsRequest,
  validateActionsResponse,
  validateErrorBody,
  validateIndex,
  validateLogRequest,
  validateZones,
} from "./index.ts";

const ROOT = join(import.meta.dirname, "..", "fixtures", "v1");
const PANEL: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };

const validators = new Map<string, (raw: string) => Validation<unknown>>([
  ["index", validateIndex],
  ["zones", (raw) => validateZones(raw, PANEL)],
  ["actions-request", validateActionsRequest],
  ["actions-response", validateActionsResponse],
  ["log-request", validateLogRequest],
  ["error", validateErrorBody],
]);

function split(name: string): { message: string; rest: string } {
  const message = [...validators.keys()]
    .sort((a, b) => b.length - a.length)
    .find((key) => name.startsWith(`${key}-`));
  if (message === undefined) throw new Error(`fixture without known message: ${name}`);
  return { message, rest: name.slice(message.length + 1).replace(/\.json$/, "") };
}

function files(kind: "valid" | "invalid"): { name: string; raw: string }[] {
  const dir = join(ROOT, kind);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed fixtures folder
  return readdirSync(dir).map((name) => ({
    name,
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed fixtures folder
    raw: readFileSync(join(dir, name), "utf8"),
  }));
}

describe("fixtures v1 (compatibility, M2)", () => {
  it("has fixtures for every message", () => {
    const seen = new Set(files("valid").map((file) => split(file.name).message));
    expect([...seen].sort()).toEqual([...validators.keys()].sort());
  });

  for (const { name, raw } of files("valid")) {
    it(`valid/${name} validates`, () => {
      const { message } = split(name);
      const validate = validators.get(message);
      expect(validate?.(raw).ok).toBe(true);
    });
  }

  for (const { name, raw } of files("invalid")) {
    it(`invalid/${name} fails with the code in its name`, () => {
      const { message, rest } = split(name);
      const code = rest.split("-")[0];
      const result = validators.get(message)?.(raw);
      expect(result?.ok).toBe(false);
      if (result && !result.ok) expect(result.errors.map((error) => error.code)).toContain(code);
    });
  }
});
