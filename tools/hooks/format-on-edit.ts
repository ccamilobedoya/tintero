// Claude Code PostToolUse hook (P5): formats the file an agent just edited with prettier.
// Reads the hook payload from stdin; never fails the agent's turn.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, relative } from "node:path";
import { asRecord, asString } from "../lib/json.ts";

const FORMATTED = new Set([".ts", ".js", ".mjs", ".json", ".yaml", ".yml", ".css", ".html"]);

try {
  const payload = asRecord(JSON.parse(readFileSync(0, "utf8")));
  const file = asString(asRecord(payload.tool_input).file_path);
  const root = asString(payload.cwd, process.cwd());
  const inside = file !== "" && !relative(root, file).startsWith("..");
  if (inside && FORMATTED.has(extname(file))) {
    execFileSync("npx", ["--no-install", "prettier", "--write", "--log-level", "silent", file], {
      cwd: root,
      stdio: "ignore",
    });
  }
} catch {
  // Formatting is best effort; tools/revisar still checks it.
}
