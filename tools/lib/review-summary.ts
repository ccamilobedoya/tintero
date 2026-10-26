// Builds the short review summary (.revisar/resumen.md) from the tool outputs
// written by tools/revisar, and decides the exit code:
//   0 = clean, 1 = blocking findings (or a tool that did not run), 3 = needs the model reviewer.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Finding,
  parseEslint,
  parseGitleaks,
  parseHadolint,
  parseKnip,
  parseNpmAudit,
  parseOsv,
  parsePrivacy,
  parsePublication,
  parsePrettier,
  parseSemgrep,
  parseTrivyConfig,
  parseTrufflehog,
  parseTsc,
  parseVitest,
} from "./findings.ts";
import { changedFiles, defaultBase, showFile } from "./git.ts";
import { matchesAny, parsePatterns } from "./glob.ts";
import { asRecord } from "./json.ts";
import { allowed, parseAllow } from "./public-scan.ts";

/** The exceptions of tools/public-scan-allow.txt (F-018), also for trufflehog. */
function allowIn(root: string): (file: string, kind: string) => boolean {
  const rules = parseAllow(
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed file of this repo
    readFileSync(join(root, "tools/public-scan-allow.txt"), "utf8").slice(0, 64 * 1024),
  );
  return (file, kind) => allowed({ file, kind }, rules);
}

const MAX_FINDING_LINES = 15;
const MAX_LIST = 6;

interface ToolSpec {
  name: string;
  output: string;
  parse: (raw: string, root: string) => Finding[];
}

const json = (raw: string): unknown => JSON.parse(raw);

const TOOLS: readonly ToolSpec[] = [
  { name: "tsc", output: "tsc.txt", parse: (raw) => parseTsc(raw) },
  { name: "eslint", output: "eslint.json", parse: (raw, root) => parseEslint(json(raw), root) },
  { name: "prettier", output: "prettier.txt", parse: (raw) => parsePrettier(raw) },
  { name: "vitest", output: "vitest.json", parse: (raw, root) => parseVitest(json(raw), root) },
  { name: "knip", output: "knip.json", parse: (raw) => parseKnip(json(raw)) },
  { name: "npm-audit", output: "npm-audit.json", parse: (raw) => parseNpmAudit(json(raw)) },
  { name: "npm-signatures", output: "npm-signatures.txt", parse: () => [] },
  { name: "semgrep", output: "semgrep.json", parse: (raw) => parseSemgrep(json(raw)) },
  {
    name: "gitleaks",
    output: "gitleaks.json",
    parse: (raw, root) => parseGitleaks(json(raw), root),
  },
  {
    name: "gitleaks-history",
    output: "gitleaks-history.json",
    parse: (raw, root) => parseGitleaks(json(raw), root),
  },
  { name: "osv-scanner", output: "osv.json", parse: (raw) => parseOsv(json(raw)) },
  { name: "hadolint", output: "hadolint.json", parse: (raw) => parseHadolint(json(raw)) },
  { name: "trivy", output: "trivy.json", parse: (raw) => parseTrivyConfig(json(raw)) },
  { name: "privacidad", output: "privacidad.json", parse: (raw) => parsePrivacy(json(raw)) },
  { name: "publicacion", output: "publicacion.json", parse: (raw) => parsePublication(json(raw)) },
  { name: "nunca", output: "nunca.txt", parse: () => [] },
  {
    name: "trufflehog",
    output: "trufflehog.json",
    parse: (raw, root) => parseTrufflehog(raw, allowIn(root)),
  },
  {
    name: "trufflehog-history",
    output: "trufflehog-history.json",
    parse: (raw, root) => parseTrufflehog(raw, allowIn(root)),
  },
];

/** Tools that exit non-zero when they find something; for the rest a non-zero exit means failure. */
const EXITS_ON_FINDINGS = new Set([
  "privacidad",
  "publicacion",
  "tsc",
  "eslint",
  "prettier",
  "vitest",
  "knip",
  "npm-audit",
  "osv-scanner",
  "hadolint",
]);

export interface ToolResult {
  name: string;
  status: "ok" | "skipped" | "failed";
  note: string;
  findings: Finding[];
}

function readIfExists(path: string): string | undefined {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the fixed TOOLS table
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function runTool(spec: ToolSpec, dir: string, root: string): ToolResult {
  const skip = readIfExists(join(dir, `${spec.name}.skip`));
  if (skip !== undefined)
    return { name: spec.name, status: "skipped", note: skip.trim(), findings: [] };
  const exitText = readIfExists(join(dir, `${spec.name}.exit`));
  const raw = readIfExists(join(dir, spec.output));
  if (exitText === undefined || raw === undefined) {
    return { name: spec.name, status: "failed", note: "no corrió", findings: [] };
  }
  const exitCode = Number(exitText.trim());
  let findings: Finding[];
  try {
    findings = spec.parse(raw, root);
  } catch {
    return { name: spec.name, status: "failed", note: "salida ilegible", findings: [] };
  }
  // A non-zero exit with nothing parsed means the tool itself broke: fail closed.
  if (exitCode !== 0 && findings.length === 0) {
    return { name: spec.name, status: "failed", note: `falló (código ${exitCode})`, findings: [] };
  }
  // Tools that only signal through their exit code (npm audit signatures).
  if (exitCode !== 0 && !EXITS_ON_FINDINGS.has(spec.name)) {
    return { name: spec.name, status: "failed", note: `falló (código ${exitCode})`, findings };
  }
  return { name: spec.name, status: "ok", note: "", findings };
}

/**
 * npm audit and osv-scanner check the same thing (known vulnerabilities in the lockfile).
 * When the npm registry does not answer but osv-scanner ran, the check is covered: do not block.
 * If both fail, the check stays failed (fail closed).
 */
export function degradeCoveredFailures(results: readonly ToolResult[]): ToolResult[] {
  const osvRan = results.some((result) => result.name === "osv-scanner" && result.status === "ok");
  return results.map((result) =>
    result.name === "npm-audit" && result.status === "failed" && osvRan
      ? {
          ...result,
          status: "skipped",
          note: "sin respuesta del registro; cubierto por osv-scanner",
        }
      : result,
  );
}

function dependencyNames(packageJson: string | undefined): Set<string> {
  if (packageJson === undefined) return new Set();
  const data = asRecord(JSON.parse(packageJson));
  return new Set([
    ...Object.keys(asRecord(data.dependencies)),
    ...Object.keys(asRecord(data.devDependencies)),
  ]);
}

function newDependencies(base: string, root: string): string[] {
  const before = dependencyNames(showFile(base, "package.json"));
  const after = dependencyNames(readIfExists(join(root, "package.json")));
  if (before.size === 0) return [];
  return [...after].filter((name) => !before.has(name)).sort();
}

function list(items: readonly string[]): string {
  const shown = items.slice(0, MAX_LIST).map((item) => `\`${item}\``);
  return items.length > MAX_LIST
    ? `${shown.join(", ")} … y ${items.length - MAX_LIST} más`
    : shown.join(", ");
}

function groupFindings(findings: readonly Finding[]): string[] {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = `${finding.tool}|${finding.rule}|${finding.file}`;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  const ordered = [...groups.values()].sort(
    (a, b) => Number(b[0]?.blocking) - Number(a[0]?.blocking),
  );
  const lines = ordered.slice(0, MAX_FINDING_LINES).map((group) => {
    const first = group[0];
    if (first === undefined) return "";
    const where =
      first.line === undefined || first.line === 0 ? first.file : `${first.file}:${first.line}`;
    const more = group.length > 1 ? ` (×${group.length})` : "";
    return `- ${first.blocking ? "❌" : "·"} **${first.tool}** ${first.rule} — ${where}${more}`;
  });
  if (ordered.length > MAX_FINDING_LINES) {
    lines.push(`- … y ${ordered.length - MAX_FINDING_LINES} grupos más (ver \`.revisar/\`)`);
  }
  return lines;
}

function main(): number {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf("--base");
  const base = baseIndex >= 0 ? (args[baseIndex + 1] ?? defaultBase()) : defaultBase();
  const root = process.cwd();
  const dir = join(root, ".revisar");

  const results = degradeCoveredFailures(TOOLS.map((spec) => runTool(spec, dir, root)));
  const findings = results.flatMap((result) => result.findings);
  const blocking = findings.filter((finding) => finding.blocking);
  const failedTools = results.filter((result) => result.status === "failed");

  const sensitivePatterns = parsePatterns(
    readIfExists(join(root, "tools/sensitive-paths.txt")) ?? "",
  );
  const changed = changedFiles(base);
  const sensitive = changed.filter((file) => matchesAny(file, sensitivePatterns));
  const newDeps = newDependencies(base, root);

  const verdict =
    blocking.length > 0 || failedTools.length > 0
      ? `❌ BLOQUEANTE: ${blocking.length} hallazgo(s)${failedTools.length > 0 ? `, ${failedTools.length} herramienta(s) sin resultado` : ""}`
      : sensitive.length > 0 || newDeps.length > 0
        ? "⚠️ LIMPIO, PERO REQUIERE REVISOR (zona sensible o dependencia nueva)"
        : "✅ LIMPIO";

  const toolLine = results
    .map((result) => {
      if (result.status === "skipped") return `${result.name} –`;
      if (result.status === "failed") return `${result.name} ❗${result.note}`;
      const count = result.findings.filter((finding) => finding.blocking).length;
      return count > 0 ? `${result.name} ❌${count}` : `${result.name} ✅`;
    })
    .join(" · ");

  const out: string[] = [
    `# Revisión · ${new Date().toLocaleString("sv-SE").slice(0, 16)} · base \`${base}\``,
    "",
    `**${verdict}**`,
    "",
    `Herramientas: ${toolLine}`,
    "",
  ];
  if (findings.length > 0) out.push("## Hallazgos", ...groupFindings(findings), "");
  out.push(`## Cambios: ${changed.length} archivo(s)`);
  if (sensitive.length > 0) out.push(`- Zonas sensibles: ${list(sensitive)}`);
  if (newDeps.length > 0) out.push(`- Dependencias nuevas: ${list(newDeps)}`);
  const skipped = results.filter((result) => result.status === "skipped");
  if (skipped.length > 0)
    out.push(
      `- Omitidas: ${skipped.map((result) => `${result.name} (${result.note})`).join(", ")}`,
    );

  const summary = `${out.join("\n")}\n`;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed output file inside the repo
  writeFileSync(join(dir, "resumen.md"), summary);
  process.stdout.write(summary);

  if (blocking.length > 0 || failedTools.length > 0) return 1;
  if (sensitive.length > 0 || newDeps.length > 0) return 3;
  return 0;
}

if (import.meta.main) process.exitCode = main();
