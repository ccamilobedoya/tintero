import { defineConfig } from "vitest/config";

// Unit tests live next to the code (*.test.ts). Acceptance tests and the agent
// regression fixture run only through their own scripts.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "tests/acceptance/**", "tests/agents/**"],
  },
});
