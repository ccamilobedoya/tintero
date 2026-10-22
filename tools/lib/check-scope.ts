// CLI: tools/check-scope <rol> [--base <ref>]. Exit 1 when the role changed files outside its scope.
import { changedFiles, defaultBase } from "./git.ts";
import { isRole, outOfScope } from "./scope.ts";

function main(): number {
  const [role, flag, baseArg] = process.argv.slice(2);
  if (role === undefined || !isRole(role)) {
    process.stderr.write(
      "Uso: tools/check-scope <programador|verificador|revisor> [--base <ref>]\n",
    );
    return 2;
  }
  const base = flag === "--base" && baseArg !== undefined ? baseArg : defaultBase();
  const bad = outOfScope(role, changedFiles(base));
  if (bad.length === 0) {
    process.stdout.write(
      `✅ ${role}: todos los cambios están dentro de su alcance (base ${base}).\n`,
    );
    return 0;
  }
  process.stdout.write(`❌ ${role}: cambios fuera de su alcance (base ${base}):\n`);
  for (const file of bad) process.stdout.write(`  - ${file}\n`);
  return 1;
}

process.exitCode = main();
