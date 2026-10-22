import { describe, expect, it } from "vitest";
import { isRole, outOfScope } from "./scope.ts";

describe("outOfScope", () => {
  it("lets the verifier touch only acceptance tests", () => {
    expect(outOfScope("verificador", ["tests/acceptance/f001.test.ts"])).toEqual([]);
    expect(outOfScope("verificador", ["server/src/index.ts"])).toEqual(["server/src/index.ts"]);
  });

  it("keeps the programmer out of specs, decisions, acceptance tests and agent files", () => {
    const files = [
      "server/src/index.ts",
      "docs/fichas/F-001.md",
      "docs/decisiones/0001.md",
      "tests/acceptance/a.test.ts",
      ".claude/agents/programador.md",
      "package.json",
    ];
    expect(outOfScope("programador", files)).toEqual([
      "docs/fichas/F-001.md",
      "docs/decisiones/0001.md",
      "tests/acceptance/a.test.ts",
      ".claude/agents/programador.md",
    ]);
  });

  it("lets the reviewer change nothing", () => {
    expect(outOfScope("revisor", ["docs/lecciones.md"])).toEqual(["docs/lecciones.md"]);
    expect(outOfScope("revisor", [])).toEqual([]);
  });
});

describe("isRole", () => {
  it("accepts only known roles", () => {
    expect(isRole("verificador")).toBe(true);
    expect(isRole("arquitecto")).toBe(false);
  });
});
