// Reglas de calidad y seguridad (F-000). Lint con tipos para todo el TypeScript.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["node_modules/", "coverage/", ".revisar/", "reports/", "firmware/"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  security.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "no-eval": "error",
      "no-new-func": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // F-009 (ADR-0045): un rechazo sin atrapar mata el proceso en Node 24; `void` tampoco lo atrapa.
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
    },
  },
  { files: ["**/*.js", "**/*.mjs"], extends: [tseslint.configs.disableTypeChecked] },
);
