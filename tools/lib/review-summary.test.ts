import { describe, expect, it } from "vitest";
import { degradeCoveredFailures, type ToolResult } from "./review-summary.ts";

const tool = (name: string, status: ToolResult["status"]): ToolResult => ({
  name,
  status,
  note: "",
  findings: [],
});

describe("degradeCoveredFailures", () => {
  it("does not block on npm audit when osv-scanner covered the lockfile", () => {
    const [audit] = degradeCoveredFailures([
      tool("npm-audit", "failed"),
      tool("osv-scanner", "ok"),
    ]);
    expect(audit?.status).toBe("skipped");
  });

  it("keeps failing closed when osv-scanner did not run either", () => {
    const [audit] = degradeCoveredFailures([
      tool("npm-audit", "failed"),
      tool("osv-scanner", "failed"),
    ]);
    expect(audit?.status).toBe("failed");
  });

  it("never degrades other tools", () => {
    const [tsc] = degradeCoveredFailures([tool("tsc", "failed"), tool("osv-scanner", "ok")]);
    expect(tsc?.status).toBe("failed");
  });
});
