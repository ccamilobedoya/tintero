import { defineConfig } from "vitest/config";

// Acceptance tests (written by the verifier). Filter one spec with:
//   npm run test:acceptance -- tests/acceptance/F-NNN
export default defineConfig({
  test: {
    include: ["tests/acceptance/**/*.test.ts"],
  },
});
