// Prepares the folder of Tintero's own Tailscale node (F-012, ADR-0047) from deploy/funnel/*.in and
// the local config: compose.yaml and config/serve.json. Never starts it (opening to the internet is the
// owner's step) and never touches the node's state folder.
// CLI: tools/instalar-funnel [--dry-run]
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InstallError, parseKeys, readEnv } from "./install-service.ts";

const KEYS = ["TINTERO_FUNNEL_DIR", "TINTERO_TLS_PORT", "TINTERO_AUTHKEY_FILE"] as const;
type Key = (typeof KEYS)[number];

export function funnelValues(env: Record<Key, string>): Record<Key, string> {
  for (const key of ["TINTERO_FUNNEL_DIR", "TINTERO_AUTHKEY_FILE"] as const) {
    // eslint-disable-next-line security/detect-object-injection -- key is one of two literals
    if (!isAbsolute(env[key])) throw new InstallError(`${key} tiene que ser una ruta absoluta`);
  }
  const port = Number(env.TINTERO_TLS_PORT);
  if (!/^[0-9]{4,5}$/.test(env.TINTERO_TLS_PORT) || port < 1024 || port > 65_535) {
    throw new InstallError("TINTERO_TLS_PORT tiene que ser un puerto entre 1024 y 65535");
  }
  return env;
}

export function imageFrom(imagesConf: string): string {
  const match = /^TAILSCALE_IMAGE=(\S+@sha256:[0-9a-f]{64})/m.exec(imagesConf);
  if (match?.[1] === undefined)
    throw new InstallError("Falta TAILSCALE_IMAGE fijada en tools/images.conf");
  return match[1];
}

export function renderFunnel(
  compose: string,
  serve: string,
  env: Record<Key, string>,
  image: string,
  owner: { uid: number; gid: number } = {
    uid: process.getuid?.() ?? 0,
    gid: process.getgid?.() ?? 0,
  },
): { compose: string; serve: string } {
  // The node runs as the folder's owner, never as root (F-012).
  if (owner.uid === 0)
    throw new InstallError("El nodo no corre como root: instálalo con tu usuario");
  const out = {
    compose: compose
      .replaceAll("@TAILSCALE_IMAGE@", image)
      .replaceAll("@AUTHKEY_FILE@", env.TINTERO_AUTHKEY_FILE)
      .replaceAll("@UID@", String(owner.uid))
      .replaceAll("@GID@", String(owner.gid)),
    serve: serve.replaceAll("@TINTERO_TLS_PORT@", env.TINTERO_TLS_PORT),
  };
  if (/@[A-Z_]+@/.test(out.compose + out.serve)) {
    throw new InstallError("Las plantillas tienen marcadores sin rellenar");
  }
  return out;
}

function main(argv: string[]): number {
  const dryRun = argv.includes("--dry-run");
  if (argv.some((arg) => arg !== "--dry-run")) {
    console.error("Uso: tools/instalar-funnel [--dry-run]");
    return 2;
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const envFile = process.env.TINTERO_LOCAL_ENV ?? join(homedir(), ".config/tintero/local.env");
  let files: { compose: string; serve: string };
  let dir: string;
  try {
    const env = funnelValues(parseKeys(readEnv(envFile), KEYS));
    dir = env.TINTERO_FUNNEL_DIR;
    files = renderFunnel(
      readFileSync(join(root, "deploy/funnel/compose.yaml.in"), "utf8"),
      readFileSync(join(root, "deploy/funnel/serve.json.in"), "utf8"),
      env,
      imageFrom(readFileSync(join(root, "tools/images.conf"), "utf8")),
    );
  } catch (error) {
    if (!(error instanceof InstallError)) throw error;
    console.error(`${error.message} (ver docs/configuracion-local.md)`);
    return 2;
  }
  if (dryRun) {
    process.stdout.write(`# compose.yaml\n${files.compose}\n# config/serve.json\n${files.serve}`);
    return 0;
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- folder chosen by the owner in the local config
  mkdirSync(join(dir, "config"), { recursive: true, mode: 0o700 });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- folder chosen by the owner in the local config
  mkdirSync(join(dir, "state"), { recursive: true, mode: 0o700 });
  for (const [path, text] of [
    [join(dir, "compose.yaml"), files.compose],
    [join(dir, "config/serve.json"), files.serve],
  ] as const) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- inside the folder chosen by the owner
    writeFileSync(path, text, { mode: 0o600 });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- inside the folder chosen by the owner
    chmodSync(path, 0o600);
  }
  for (const folder of [dir, join(dir, "config"), join(dir, "state")]) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- folder chosen by the owner in the local config
    chmodSync(folder, 0o700);
  }
  console.log(`Listo (no arrancado). Para abrir el Funnel: cd ${dir} && docker compose up -d`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`)
  process.exit(main(process.argv.slice(2)));
