// Privacy guard: personal and infrastructure terms must never reach the repo (files, commit
// messages, history). The list itself is private, so it lives outside the repo:
//   $TINTERO_PRIVATE_TERMS or ~/.config/tintero/private-terms.txt
// Matches are reported as file:line only, never with the term itself.
// CLI: --tree | --staged | --message <file> | --history   [--json <out>]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parsePatterns } from "./glob.ts";

export interface PrivateHit {
  file: string;
  line: number;
}

// Only letters glue a term to a word: «term_x» or «term2» still match (safer than missing them).
const WORD = /\p{L}/u;

/** Case-insensitive, whole-word search for any of the terms. Returns 1-based line numbers. */
export function findPrivateTerms(text: string, terms: readonly string[]): number[] {
  const lines = text.toLowerCase().split("\n");
  const wanted = terms.map((term) => term.toLowerCase()).filter((term) => term !== "");
  const hits: number[] = [];
  lines.forEach((line, index) => {
    const found = wanted.some((term) => {
      let from = line.indexOf(term);
      while (from >= 0) {
        const before = from === 0 ? "" : line.charAt(from - 1);
        const after = line.charAt(from + term.length);
        if (!WORD.test(before) && !WORD.test(after)) return true;
        from = line.indexOf(term, from + 1);
      }
      return false;
    });
    if (found) hits.push(index + 1);
  });
  return hits;
}

function termsPath(): string {
  return process.env.TINTERO_PRIVATE_TERMS ?? join(homedir(), ".config/tintero/private-terms.txt");
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function readRepoFile(file: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- files listed by git in this repo
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const SKIP = [/^node_modules\//, /^package-lock\.json$/, /\.(png|jpg|jpeg|gif|ico|bin)$/i];

function scanFiles(
  files: readonly string[],
  read: (file: string) => string,
  terms: readonly string[],
): PrivateHit[] {
  return files
    .filter((file) => !SKIP.some((pattern) => pattern.test(file)))
    .flatMap((file) => [
      ...(findPrivateTerms(file, terms).length > 0 ? [{ file, line: 0 }] : []),
      ...findPrivateTerms(read(file), terms).map((line) => ({ file, line })),
    ]);
}

function scan(mode: string, arg: string | undefined, terms: readonly string[]): PrivateHit[] {
  switch (mode) {
    case "--tree": {
      const files = git(["ls-files", "--cached", "--others", "--exclude-standard"])
        .split("\n")
        .filter(Boolean);
      return scanFiles(files, readRepoFile, terms);
    }
    case "--staged": {
      const files = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
        .split("\n")
        .filter(Boolean);
      return scanFiles(files, (file) => git(["show", `:${file}`]), terms);
    }
    case "--message": {
      if (arg === undefined) throw new Error("--message necesita la ruta del mensaje");
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path given by git to the hook
      return findPrivateTerms(readFileSync(arg, "utf8"), terms).map((line) => ({
        file: "(mensaje del commit)",
        line,
      }));
    }
    case "--history": {
      const commits = git(["rev-list", "--all"]).split("\n").filter(Boolean);
      return commits.flatMap((sha) => {
        const text = git(["show", "--format=%an <%ae>%n%cn <%ce>%n%B", "-p", sha]);
        return findPrivateTerms(text, terms).map((line) => ({
          file: `(commit ${sha.slice(0, 7)})`,
          line,
        }));
      });
    }
    default:
      throw new Error(
        "Uso: private-terms --tree | --staged | --message <archivo> | --history [--json <salida>]",
      );
  }
}

function main(): number {
  const [mode = "--tree", maybeArg] = process.argv.slice(2);
  const arg = mode === "--message" ? maybeArg : undefined;
  const jsonIndex = process.argv.indexOf("--json");
  const jsonOut = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : undefined;
  const path = termsPath();
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed private file outside the repo
  if (!existsSync(path)) {
    process.stderr.write(
      `Aviso: no existe ${path}; el control de privacidad no corre (ver docs/configuracion-local.md).\n`,
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- review output inside the repo
    if (jsonOut !== undefined) writeFileSync(jsonOut, "[]\n");
    return 0;
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed private file outside the repo
  const terms = parsePatterns(readFileSync(path, "utf8"));
  if (terms.length === 0)
    process.stderr.write(`Aviso: ${path} está vacía; el control de privacidad no revisa nada.\n`);
  const hits = scan(mode, arg, terms);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- review output inside the repo
  if (jsonOut !== undefined) writeFileSync(jsonOut, `${JSON.stringify(hits)}\n`);
  if (hits.length === 0) return 0;
  process.stderr.write("❌ Hay términos privados (nunca deben llegar al repo):\n");
  for (const hit of hits.slice(0, 30)) process.stderr.write(`  - ${hit.file}:${hit.line}\n`);
  return 1;
}

if (import.meta.main) process.exitCode = main();
