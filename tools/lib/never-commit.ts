// Files that never go into the repo, even with `git add -f` (F-018, R5).
// The list is tools/never-commit.txt: one glob per line, "**/" also matches the root, "!" = exception.
// CLI: --staged (pre-commit) | --tree (every tracked file) · exit 0 clean, 1 blocked or the list is unreadable.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { globToRegExp, parsePatterns } from "./glob.ts";

export interface NeverRules {
  block: RegExp[];
  except: RegExp[];
}

function compile(pattern: string): RegExp[] {
  const regexps = [globToRegExp(pattern)];
  if (pattern.startsWith("**/")) regexps.push(globToRegExp(pattern.slice(3)));
  return regexps;
}

export function parseNeverRules(text: string): NeverRules {
  const patterns = parsePatterns(text);
  if (patterns.length === 0) throw new Error("la lista está vacía");
  return {
    block: patterns.filter((p) => !p.startsWith("!")).flatMap(compile),
    except: patterns.filter((p) => p.startsWith("!")).flatMap((p) => compile(p.slice(1))),
  };
}

export function isNeverCommit(path: string, rules: NeverRules): boolean {
  return rules.block.some((re) => re.test(path)) && !rules.except.some((re) => re.test(path));
}

function main(): number {
  const mode = process.argv[2];
  const args =
    mode === "--staged"
      ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
      : mode === "--tree"
        ? ["ls-files", "-z"]
        : undefined;
  if (args === undefined) {
    process.stderr.write("Uso: never-commit --staged | --tree\n");
    return 1;
  }
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    const rules = parseNeverRules(
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed file of this repo
      readFileSync(`${root}/tools/never-commit.txt`, "utf8").slice(0, 64 * 1024),
    );
    const files = execFileSync("git", args, {
      encoding: "utf8",
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\0")
      .filter(Boolean);
    const blocked = files.filter((file) => isNeverCommit(file, rules));
    if (blocked.length === 0) return 0;
    process.stderr.write("❌ Estos archivos nunca van al repo (tools/never-commit.txt):\n");
    for (const file of blocked) process.stderr.write(`  - ${file}\n`);
    return 1;
  } catch (error) {
    process.stderr.write(
      `❌ never-commit no pudo revisar (falla cerrado): ${(error as Error).message}\n`,
    );
    return 1;
  }
}

if (import.meta.main) process.exitCode = main();
