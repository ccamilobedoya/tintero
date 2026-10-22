// Small wrappers around git, used by the review and scope tools.
import { execFileSync } from "node:child_process";

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function lines(output: string): string[] {
  return output.split("\n").filter((line) => line !== "");
}

function hasCommits(): boolean {
  try {
    git(["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function currentBranch(): string {
  return git(["branch", "--show-current"]).trim();
}

/** Default base for a review: main when working on another branch, otherwise HEAD. */
export function defaultBase(): string {
  return currentBranch() === "main" ? "HEAD" : "main";
}

/** Files that differ from `base`, including uncommitted and untracked files. */
export function changedFiles(base: string): string[] {
  const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]));
  if (!hasCommits()) {
    return [...new Set([...lines(git(["ls-files"])), ...untracked])].sort();
  }
  const changed = lines(git(["diff", "--name-only", base]));
  return [...new Set([...changed, ...untracked])].sort();
}

/** File content at `ref`, or undefined when it does not exist there. */
export function showFile(ref: string, path: string): string | undefined {
  if (!hasCommits()) return undefined;
  try {
    return git(["show", `${ref}:${path}`]);
  } catch {
    return undefined;
  }
}
