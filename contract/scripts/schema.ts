// Generates (or with --check, verifies) contract/schema/v1/*.schema.json and contract/openapi/v1.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { openApiDocument } from "../src/openapi.ts";
import {
  ActionsRequestSchema,
  ActionsResponseSchema,
  ErrorBodySchema,
  IndexResponseSchema,
  LogRequestSchema,
  ZonesResponseSchema,
} from "../src/schemas.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const schemas: Record<string, object> = {
  index: IndexResponseSchema,
  zones: ZonesResponseSchema,
  "actions-request": ActionsRequestSchema,
  "actions-response": ActionsResponseSchema,
  "log-request": LogRequestSchema,
  error: ErrorBodySchema,
};

async function render(document: object): Promise<string> {
  return format(JSON.stringify(document), { parser: "json", printWidth: 100 });
}

async function outputs(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const [name, schema] of Object.entries(schemas)) {
    const document = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `https://tintero.example/contract/v1/${name}.schema.json`,
      ...schema,
    };
    files.set(join(ROOT, "schema", "v1", `${name}.schema.json`), await render(document));
  }
  files.set(join(ROOT, "openapi", "v1.json"), await render(openApiDocument));
  return files;
}

const check = process.argv.includes("--check");
const stale: string[] = [];
for (const [file, content] of await outputs()) {
  if (check) {
    let current = "";
    try {
      // nosemgrep: tintero-lectura-sin-tope -- fixed output files of this repo, written by this script
      current = readFileSync(file, "utf8"); // eslint-disable-line security/detect-non-literal-fs-filename -- fixed output paths
    } catch {
      // missing counts as stale
    }
    if (current !== content) stale.push(file);
  } else {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed output paths
    mkdirSync(dirname(file), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed output paths
    writeFileSync(file, content);
  }
}
if (stale.length > 0) {
  console.error(`Out of date (run npm run contract:schema):\n${stale.join("\n")}`);
  process.exitCode = 1;
}
