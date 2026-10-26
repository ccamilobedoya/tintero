import { describe, expect, it } from "vitest";
import { isNeverCommit, parseNeverRules } from "./never-commit.ts";

const RULES = parseNeverRules(
  [
    "# c",
    "**/secrets.h",
    "**/*.key",
    "**/*.pem",
    "!**/*.example.pem",
    "**/.env*",
    "!**/.env.example",
  ].join("\n"),
);

describe("never-commit", () => {
  it("blocks at any depth, including the root", () => {
    expect(isNeverCommit("firmware/include/secrets.h", RULES)).toBe(true);
    expect(isNeverCommit("secrets.h", RULES)).toBe(true);
    expect(isNeverCommit("a/b/x.key", RULES)).toBe(true);
    expect(isNeverCommit(".env.local", RULES)).toBe(true);
  });

  it("keeps the exceptions and unrelated files", () => {
    expect(isNeverCommit("config/x.example.pem", RULES)).toBe(false);
    expect(isNeverCommit(".env.example", RULES)).toBe(false);
    expect(isNeverCommit("firmware/include/secrets.h.example", RULES)).toBe(false);
    expect(isNeverCommit("docs/keys.md", RULES)).toBe(false);
  });

  it("refuses an empty list (fails closed)", () => {
    expect(() => parseNeverRules("# nada\n\n")).toThrow();
  });
});
