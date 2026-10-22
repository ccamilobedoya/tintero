// What each agent role may change (P5). Checked with git, not with the agent's good will.
import { matchesAny } from "./glob.ts";

export type Role = "programador" | "verificador" | "revisor";

interface RoleRule {
  /** When set, only these paths may change. */
  allow?: readonly string[];
  /** These paths may never change. */
  deny: readonly string[];
}

const ARCHITECT_OWNED = [
  "docs/fichas/**",
  "docs/decisiones/**",
  "docs/plantillas/**",
  "docs/informes/**",
  "docs/lecciones.md",
  "docs/metricas.md",
  ".claude/**",
  "CLAUDE.md",
  "tools/**",
  "tests/agents/**",
];

const RULES: ReadonlyMap<Role, RoleRule> = new Map<Role, RoleRule>([
  ["programador", { deny: [...ARCHITECT_OWNED, "tests/acceptance/**"] }],
  ["verificador", { allow: ["tests/acceptance/**"], deny: [] }],
  ["revisor", { allow: [], deny: [] }],
]);

export function isRole(value: string): value is Role {
  return RULES.has(value as Role);
}

/** Returns the files the role was not allowed to change. */
export function outOfScope(role: Role, files: readonly string[]): string[] {
  const rule = RULES.get(role) ?? { allow: [], deny: [] };
  return files.filter((file) => {
    if (matchesAny(file, rule.deny)) return true;
    return rule.allow !== undefined && !matchesAny(file, rule.allow);
  });
}
