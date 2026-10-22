// CLI: tools/mapa. Regenerates docs/MAPA.md from the first descriptive line of each folder's README
// and the description of each agent, so agents can find their way without exploring the repo (P6).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".git", ".revisar", "coverage", "reports"]);

export function describe(readme: string): string {
  const line = readme.split("\n").find((entry) => entry.trim() !== "" && !entry.startsWith("#"));
  return (line ?? "").replace(/^>\s*/, "").trim();
}

function folders(dir: string, depth: number): string[] {
  if (depth > 2) return [];
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks the repo itself
  return readdirSync(join(ROOT, dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SKIP.has(entry.name) && !entry.name.startsWith("."))
    .flatMap((entry) => {
      const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
      return [path, ...folders(path, depth + 1)];
    });
}

function readmeLine(path: string): string | undefined {
  const file = join(ROOT, path, "README.md");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- repo paths only
  return existsSync(file) ? describe(readFileSync(file, "utf8")) : undefined;
}

function agentLines(): string[] {
  const dir = join(ROOT, ".claude/agents");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed folder inside the repo
  if (!existsSync(dir)) return [];
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed folder inside the repo
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- repo paths only
      const text = readFileSync(join(dir, name), "utf8");
      const description = /^description:\s*(.+)$/m.exec(text)?.[1] ?? "";
      const model = /^model:\s*(.+)$/m.exec(text)?.[1] ?? "?";
      return `- \`.claude/agents/${name}\` (${model}): ${description.split(". ")[0] ?? ""}.`;
    });
}

function main(): void {
  const rows = folders("", 0)
    .map((path) => ({ path, text: readmeLine(path) }))
    .filter((row): row is { path: string; text: string } => row.text !== undefined)
    .map((row) => `- \`${row.path}/\`: ${row.text}`);
  const content = [
    "# Mapa del repositorio",
    "",
    "> Generado por `tools/mapa` desde el README de cada carpeta. No editar a mano.",
    "",
    "## Carpetas",
    ...rows,
    "",
    "## Agentes",
    ...agentLines(),
    "",
  ].join("\n");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed output file inside the repo
  writeFileSync(join(ROOT, "docs/MAPA.md"), content);
  process.stdout.write("docs/MAPA.md actualizado.\n");
}

if (import.meta.main) main();
