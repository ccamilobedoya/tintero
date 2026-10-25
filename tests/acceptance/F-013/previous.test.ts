import { describe, expect, it } from "vitest";
import { runNpm } from "./helpers.ts";

describe("CA20 lo que ya existe", () => {
  it("las pruebas de aceptación de F-005, F-006 y F-008 siguen pasando", async () => {
    const r = await runNpm(
      "test:acceptance",
      ["tests/acceptance/F-005", "tests/acceptance/F-006", "tests/acceptance/F-008"],
      1_500_000,
    );
    expect(r.code, (r.out + r.err).slice(-4000)).toBe(0);
  }, 1_600_000);
});
