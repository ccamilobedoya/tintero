import { describe, expect, it } from "vitest";
import { globToRegExp, matchesAny, parsePatterns } from "./glob.ts";

describe("globToRegExp", () => {
  it("keeps * inside one folder and lets ** cross folders", () => {
    expect(globToRegExp("docs/*.md").test("docs/a.md")).toBe(true);
    expect(globToRegExp("docs/*.md").test("docs/x/a.md")).toBe(false);
    expect(globToRegExp("tools/**").test("tools/lib/glob.ts")).toBe(true);
  });

  it("escapes regex characters", () => {
    expect(globToRegExp("a.b").test("axb")).toBe(false);
  });
});

describe("parsePatterns", () => {
  it("drops comments and blank lines", () => {
    expect(parsePatterns("# c\n\ntools/**\n  CLAUDE.md \n")).toEqual(["tools/**", "CLAUDE.md"]);
  });
});

describe("matchesAny", () => {
  it("matches when any pattern matches", () => {
    expect(matchesAny("CLAUDE.md", ["tools/**", "CLAUDE.md"])).toBe(true);
    expect(matchesAny("server/a.ts", ["tools/**"])).toBe(false);
  });
});
