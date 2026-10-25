// Installs Tintero as a systemd user service (F-010). Fills deploy/tintero.service.in with the paths
// from the local config ($TINTERO_LOCAL_ENV or ~/.config/tintero/local.env), writes
// ~/.config/systemd/user/tintero.service (600) and enables it. Never starts it, never uses sudo.
// CLI: tools/instalar-servicio [--dry-run]
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEYS = ["TINTERO_DIR", "TINTERO_NODE", "TINTERO_ARGS"] as const;
type Key = (typeof KEYS)[number];
const MAX_ENV_BYTES = 16_384;

export class InstallError extends Error {}

/** KEY=VALUE lines; the file is never executed. Missing keys or unsafe values throw. */
export function parseServiceEnv(text: string): Record<Key, string> {
  const values = new Map<string, string>();
  for (const raw of text.split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(raw.replace(/\r$/, ""));
    if (match?.[1] !== undefined && match[2] !== undefined) values.set(match[1], match[2].trim());
  }
  const missing = KEYS.filter((key) => (values.get(key) ?? "") === "");
  if (missing.length > 0) {
    throw new InstallError(`Falta en la configuración local: ${missing.join(", ")}`);
  }
  const out = {} as Record<Key, string>;
  for (const key of KEYS) {
    const value = values.get(key) ?? "";
    // A newline (or a stray marker) would inject lines into the unit; systemd expands % and $.
    if (/[\r\n\0@%$]/.test(value)) throw new InstallError(`Valor no permitido en ${key}`);
    // eslint-disable-next-line security/detect-object-injection -- key is one of three literals
    out[key] = value;
  }
  return out;
}

export function renderUnit(template: string, env: Record<Key, string>): string {
  const unit = template
    .replaceAll("@TINTERO_DIR@", env.TINTERO_DIR)
    .replaceAll("@NODE@", env.TINTERO_NODE)
    .replaceAll("@ARGS@", env.TINTERO_ARGS);
  if (/@[A-Z_]+@/.test(unit)) throw new InstallError("La plantilla tiene marcadores sin rellenar");
  return unit;
}

function readEnv(file: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- local config chosen by the owner
  if (!existsSync(file)) throw new InstallError("No existe la configuración local");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- local config chosen by the owner
  if (statSync(file).size > MAX_ENV_BYTES)
    throw new InstallError("Configuración local demasiado grande");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- local config chosen by the owner
  return readFileSync(file, "utf8");
}

function main(argv: string[]): number {
  const dryRun = argv.includes("--dry-run");
  if (argv.some((arg) => arg !== "--dry-run")) {
    console.error("Uso: tools/instalar-servicio [--dry-run]");
    return 2;
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const envFile = process.env.TINTERO_LOCAL_ENV ?? join(homedir(), ".config/tintero/local.env");
  let unit: string;
  try {
    const env = parseServiceEnv(readEnv(envFile));
    unit = renderUnit(readFileSync(join(root, "deploy/tintero.service.in"), "utf8"), env);
  } catch (error) {
    if (!(error instanceof InstallError)) throw error;
    console.error(`${error.message} (ver docs/configuracion-local.md)`);
    return 2;
  }
  if (dryRun) {
    process.stdout.write(unit);
    return 0;
  }
  const target = join(homedir(), ".config/systemd/user/tintero.service");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed path under ~/.config/systemd/user
  mkdirSync(dirname(target), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed path under ~/.config/systemd/user
  writeFileSync(target, unit, { mode: 0o600 });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed path under ~/.config/systemd/user
  chmodSync(target, 0o600);
  execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
  execFileSync("systemctl", ["--user", "enable", "tintero.service"], { stdio: "inherit" });
  console.log("Instalado y habilitado (no arrancado): systemctl --user start tintero");
  return 0;
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`)
  process.exit(main(process.argv.slice(2)));
