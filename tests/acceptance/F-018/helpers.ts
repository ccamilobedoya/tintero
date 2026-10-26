/* eslint-disable security/detect-non-literal-fs-filename -- archivos del repo y carpetas temporales propias */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

/** Raíz del repo (con `/` al final). */
export const ROOT = new URL("../../../", import.meta.url).pathname;

export const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
export const has = (rel: string): boolean => existsSync(join(ROOT, rel));

export interface Run {
  code: number | null;
  out: string;
  err: string;
  /** stdout + stderr. */
  all: string;
  ms: number;
}

/** Corre un programa sin shell. Nunca imprime ni guarda el entorno. */
export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; input?: string } = {},
): Run {
  // Sin las variables GIT_* (por si la prueba corre dentro de un hook de git).
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
  );
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    env,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 120_000,
    maxBuffer: 256 * 1024 * 1024,
    ...(opts.input === undefined ? {} : { input: opts.input }),
  });
  // Si el programa no existe, spawnSync no da stdout ni stderr.
  const out = (r.stdout as string | null) ?? "";
  const err = ((r.stderr as string | null) ?? "") + (r.error ? `\n${r.error.message}` : "");
  return { code: r.status, out, err, all: out + err, ms: Date.now() - t0 };
}

export const node = (cwd: string, args: string[], timeoutMs?: number): Run =>
  run(process.execPath, args, { cwd, ...(timeoutMs === undefined ? {} : { timeoutMs }) });

export const git = (cwd: string, ...args: string[]): Run => run("git", args, { cwd });

// --- carpetas temporales (siempre fuera del repo) ---------------------------

const made: string[] = [];
export function mkTmp(prefix = "tintero-f018-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}
export function cleanTmp(): void {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/**
 * Copia de prueba del repo (clon local de la rama actual) con las herramientas y los archivos de
 * control tal como están en la carpeta de trabajo. Los hooks NO están puestos (ver `useHooks`).
 */
export function cloneRepo(): string {
  const dir = join(mkTmp(), "repo");
  const c = run("git", ["clone", "--quiet", "--no-hardlinks", ROOT, dir]);
  if (c.code !== 0) throw new Error(`git clone falló: ${c.all.slice(0, 300)}`);
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "commit.gpgsign", "false");
  for (const rel of ["tools", ".gitignore", ".gitleaks.toml"]) {
    if (has(rel)) cpSync(join(ROOT, rel), join(dir, rel), { recursive: true, force: true });
  }
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");
  git(dir, "add", "tools", ".gitignore", ".gitleaks.toml");
  git(dir, "commit", "--quiet", "--no-verify", "--allow-empty", "-m", "base de la copia");
  return dir;
}

export const useHooks = (dir: string): void => {
  git(dir, "config", "core.hooksPath", "tools/git-hooks");
};

/** Escribe un archivo (creando carpetas) dentro de una copia. */
export function put(dir: string, rel: string, content: string | Buffer): void {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/** Recorre una carpeta y da las rutas relativas de los archivos. */
export function walk(rel: string): string[] {
  const base = join(ROOT, rel);
  if (!existsSync(base)) return [];
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(relative(ROOT, full));
    }
  };
  visit(base);
  return out.sort();
}

/** Importa un módulo del repo por ruta (aún puede no existir al escribir las pruebas). */
export async function importRepo<T>(rel: string): Promise<T> {
  return (await import(/* @vite-ignore */ join(ROOT, rel))) as T;
}
