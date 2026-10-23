// Builds the --agents JSON for `claude -p` from the repo's MAIN copy of .claude/agents/<role>.md, so a
// worktree created before an agent change still runs the current agent (lesson of F-003).
// CLI: node tools/lib/agent-json.ts <path-to-agent.md>  → prints {"<name>": {description, prompt, tools, model}}
import { readFileSync } from "node:fs";

export interface AgentDefinition {
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
}

export function parseAgent(markdown: string): { name: string; definition: AgentDefinition } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(markdown);
  if (match?.[1] === undefined || match[2] === undefined)
    throw new Error("El agente no tiene frontmatter.");
  const fields = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    const field = /^([a-z]+):\s*(.*)$/.exec(line);
    if (field?.[1] !== undefined && field[2] !== undefined) fields.set(field[1], field[2].trim());
  }
  const name = fields.get("name") ?? "";
  if (name === "") throw new Error("El agente no tiene nombre.");
  const definition: AgentDefinition = {
    description: fields.get("description") ?? "",
    prompt: match[2].trim(),
  };
  const tools = fields.get("tools");
  if (tools !== undefined && tools !== "")
    definition.tools = tools.split(",").map((tool) => tool.trim());
  const model = fields.get("model");
  if (model !== undefined && model !== "") definition.model = model;
  return { name, definition };
}

if (import.meta.main) {
  const file = process.argv[2];
  if (file === undefined) throw new Error("Uso: agent-json <agente.md>");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- agent file inside the repo, chosen by the launcher
  const { name, definition } = parseAgent(readFileSync(file, "utf8"));
  process.stdout.write(JSON.stringify({ [name]: definition }));
}
