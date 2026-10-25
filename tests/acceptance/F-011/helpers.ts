/* eslint-disable security/detect-non-literal-fs-filename -- carpetas temporales propias */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { accessSync, chmodSync, constants, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

export const REPO = new URL("../../../", import.meta.url).pathname;
export const VIEWS = join(REPO, "config/tablero.views.example.json");
export const DATA = join(REPO, "config/tablero.data.example.json");
export const LABEL = "tintero.chromium=1";

export type Line = Record<string, unknown>;

export const hex = (): string => randomBytes(4).toString("hex");
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Ruta absoluta del `docker` real, resuelta con el PATH actual (antes de cambiarlo). */
export function realDocker(): string {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(dir, "docker");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* siguiente */
    }
  }
  throw new Error("docker no está en el PATH");
}

/** Corre el `docker` real (ruta absoluta), siempre con tope. */
export function dockerReal(args: string[]): string {
  return execFileSync(realDocker(), args, {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1_048_576,
  });
}

/** Ids (corriendo o no) de los contenedores con la etiqueta de Chromium de una instancia. */
export function labelled(instance: string, all = true): string[] {
  return dockerReal([
    "ps",
    all ? "-aq" : "-q",
    "--filter",
    `label=${LABEL}`,
    "--filter",
    `label=tintero.instance=${instance}`,
  ])
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Borra los contenedores de una instancia de prueba; nunca falla. */
export function removeInstance(instance: string): void {
  try {
    for (const id of labelled(instance)) dockerReal(["rm", "-f", id]);
  } catch {
    /* ya no están */
  }
}

export interface FakeDocker {
  dir: string;
  /** Líneas de argumentos de cada llamada, en orden. */
  calls(): string[][];
  versionCalls(): number;
  cleanup(): void;
}

/**
 * Carpeta temporal fuera del repo con un `docker` que sale con 1 las primeras `failures`
 * veces que lo llaman con `version` (las cuenta en un archivo), anota cada llamada y en lo
 * demás llama al docker real por su ruta absoluta. Con `guard`, `rm`/`kill`/`stop` no se
 * ejecutan (solo se anotan).
 */
export function makeFakeDocker(failures: number, guard = false): FakeDocker {
  const real = realDocker();
  const dir = mkdtempSync(join(tmpdir(), "tintero-f011-fake-"));
  const countFile = join(dir, "version-count");
  const logFile = join(dir, "calls.log");
  writeFileSync(countFile, "0\n");
  writeFileSync(logFile, "");
  const script = `#!/bin/sh
printf '%s\\n' "$*" >> '${logFile}'
if [ "$1" = "version" ]; then
  n=$(cat '${countFile}')
  n=$((n + 1))
  echo "$n" > '${countFile}'
  if [ "$n" -le ${String(failures)} ]; then exit 1; fi
fi
${guard ? `case "$1" in rm|kill|stop) exit 0;; esac` : ""}
exec '${real}' "$@"
`;
  const bin = join(dir, "docker");
  writeFileSync(bin, script);
  chmodSync(bin, 0o700);
  return {
    dir,
    calls: () =>
      readFileSync(logFile, "utf8")
        .split("\n")
        .filter((l) => l !== "")
        .map((l) => l.split(" ")),
    versionCalls: () => Number(readFileSync(countFile, "utf8").trim()),
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface Server {
  pid: number;
  url: string | undefined;
  lines: Line[];
  raw: string[];
  exitCode(): number | null | undefined;
  stop(): Promise<void>;
}

/** Arranca `server/src/main.ts --port 0 …` en su propio grupo; recoge stdout y stderr. */
export async function startServer(
  extra: string[],
  env: NodeJS.ProcessEnv = {},
  readyMs = 120_000,
): Promise<Server> {
  const p = spawn(process.execPath, ["server/src/main.ts", "--port", "0", ...extra], {
    cwd: REPO,
    detached: true,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines: Line[] = [];
  const raw: string[] = [];
  let code: number | null | undefined;
  const feed = (buffer: { text: string }, chunk: Buffer): void => {
    buffer.text += chunk.toString("utf8");
    let nl = buffer.text.indexOf("\n");
    while (nl >= 0) {
      const text = buffer.text.slice(0, nl).trim();
      buffer.text = buffer.text.slice(nl + 1);
      if (text !== "") {
        raw.push(text);
        try {
          const parsed: unknown = JSON.parse(text);
          if (typeof parsed === "object" && parsed !== null) lines.push(parsed as Line);
        } catch {
          /* línea que no es JSON */
        }
      }
      nl = buffer.text.indexOf("\n");
    }
  };
  const out = { text: "" };
  const err = { text: "" };
  p.stdout.on("data", (d: Buffer) => {
    feed(out, d);
  });
  p.stderr.on("data", (d: Buffer) => {
    feed(err, d);
  });
  const exited = new Promise<void>((resolve) => {
    p.once("exit", (c) => {
      code = c;
      resolve();
    });
  });
  const pid = p.pid ?? 0;
  const killGroup = (signal: NodeJS.Signals): void => {
    try {
      process.kill(-pid, signal);
    } catch {
      /* ya no está */
    }
  };
  const server: Server = {
    pid,
    url: undefined,
    lines,
    raw,
    exitCode: () => code,
    stop: async () => {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* ya no está */
      }
      await Promise.race([exited, wait(20_000)]);
      killGroup("SIGKILL");
    },
  };
  const end = Date.now() + readyMs;
  while (Date.now() < end && code === undefined) {
    const found = lines.find((l) => typeof l.listening === "string");
    if (found) {
      server.url = String(found.listening);
      return server;
    }
    await wait(50);
  }
  return server;
}
