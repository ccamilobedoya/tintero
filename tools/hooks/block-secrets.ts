// Claude Code PreToolUse hook (P5, CA7, ADR-0022): blocks Bash commands that name a .env file or a
// .config folder, and git commands that skip hooks or rewrite/delete remote history. It compares text, so it is a guard against mistakes, not a security boundary:
// agents launched with tools/lanzar-agente only get an allowlist of commands (the real control).
// Any unexpected input blocks (exit 2): the hook fails closed.
import { readFileSync } from "node:fs";
import { asRecord, asString } from "../lib/json.ts";

const CONFIG_HINTS = ["/.config/", "XDG_CONFIG_HOME"];

/** Splits a shell command into rough tokens: enough to spot file paths, not a full parser. */
function tokens(command: string): string[] {
  return command.split(/[\s'"=;:|&()<>]+/).filter((token) => token !== "");
}

export function mentionsSecretPath(command: string): boolean {
  return tokens(command).some((token) => {
    const name = token.slice(token.lastIndexOf("/") + 1);
    const envFile = name === ".env" || (name.startsWith(".env.") && name.length > ".env.".length);
    const configDir =
      token.startsWith(".config/") ||
      token === ".config" ||
      CONFIG_HINTS.some((hint) => token.includes(hint));
    return envFile || configDir;
  });
}

/** Flags and arguments that skip the git hooks or force, delete or rewrite remote history. */
const GIT_FORBIDDEN_ANYWHERE = [
  "--no-verify",
  "core.hookspath",
  "filter-branch",
  "filter-repo",
  "update-ref",
];
const PUSH_FORBIDDEN = [
  "--force",
  "-f",
  "--force-with-lease",
  "--force-if-includes",
  "--delete",
  "-d",
  "--mirror",
  "--prune",
];

export function forbiddenGit(command: string): string | undefined {
  const lower = command.toLowerCase();
  if (!/(^|[\s;&|(])git(\s|$)/.test(lower)) return undefined;
  const found = GIT_FORBIDDEN_ANYWHERE.find((flag) => lower.includes(flag));
  if (found !== undefined) return found;
  const words = lower.split(/[\s;&|()]+/).filter((word) => word !== "");
  if (words.includes("commit") && words.includes("-n")) return "-n";
  const pushAt = words.indexOf("push");
  if (pushAt >= 0) {
    const args = words.slice(pushAt + 1);
    const flag = args.find((arg) => PUSH_FORBIDDEN.includes(arg));
    if (flag !== undefined) return flag;
    if (args.some((arg) => arg.startsWith("+") || (arg.includes(":") && !arg.includes("://")))) {
      return "refspec con + o :";
    }
  }
  return undefined;
}

export function decide(rawPayload: string): number {
  let command: string;
  try {
    command = asString(asRecord(asRecord(JSON.parse(rawPayload)).tool_input).command);
  } catch {
    process.stderr.write("Bloqueado: el hook no pudo leer el comando (falla cerrada).\n");
    return 2;
  }
  const gitProblem = forbiddenGit(command);
  if (gitProblem !== undefined) {
    process.stderr.write(
      `Bloqueado por el proyecto: git con «${gitProblem}» salta hooks o reescribe historia (ADR-0022).\n`,
    );
    return 2;
  }
  if (!mentionsSecretPath(command)) return 0;
  process.stderr.write(
    "Bloqueado por el proyecto: no se leen ni se tocan archivos .env ni ~/.config/ (CLAUDE.md).\n",
  );
  return 2;
}

if (import.meta.main) process.exitCode = decide(readFileSync(0, "utf8"));
