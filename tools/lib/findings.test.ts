import { describe, expect, it } from "vitest";
import { parseGitleaks, parseNpmAudit, parsePrettier, parseTsc } from "./findings.ts";

describe("parseTsc", () => {
  it("reads file, line and code from tsc output", () => {
    expect(parseTsc("server/a.ts(6,9): error TS2322: Type 'string' is not assignable.")).toEqual([
      { tool: "tsc", rule: "TS2322", file: "server/a.ts", line: 6, blocking: true },
    ]);
  });
});

describe("parseGitleaks", () => {
  it("reports paths relative to the repo, not to the container mount", () => {
    const [finding] = parseGitleaks(
      [{ RuleID: "github-pat", File: "/src/server/a.ts", StartLine: 2 }],
      "/home/x/repo",
    );
    expect(finding?.file).toBe("server/a.ts");
  });
});

describe("parseNpmAudit", () => {
  it("blocks moderate and worse, not low", () => {
    const findings = parseNpmAudit({
      vulnerabilities: { a: { severity: "low" }, b: { severity: "high" } },
    });
    expect(findings.map((finding) => finding.blocking)).toEqual([false, true]);
  });
});

describe("parsePrettier", () => {
  it("ignores the closing summary line", () => {
    const text = "[warn] a.ts\n[warn] Code style issues found in the above file.";
    expect(parsePrettier(text).map((finding) => finding.file)).toEqual(["a.ts"]);
  });
});
