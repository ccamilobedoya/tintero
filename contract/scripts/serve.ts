// Starts the Swagger UI viewer ("docs") or the Prism simulator ("mock") in Docker, bound to 127.0.0.1.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");

export function imageFrom(conf: string, variable: string): string {
  for (const line of conf.split("\n")) {
    const match = /^([A-Z_]+)=(\S+)/.exec(line);
    if (match?.[1] === variable && match[2] !== undefined) return match[2];
  }
  throw new Error(`${variable} not found in tools/images.conf`);
}

/** Docker arguments for one mode. `--mount` (unlike `-v`) accepts paths that contain ":". */
export function dockerArgs(kind: "docs" | "mock", specPath: string, port: number): string[] {
  // nosemgrep: tintero-lectura-sin-tope -- tools/images.conf is a file of this repo
  const conf = readFileSync(join(REPO, "tools", "images.conf"), "utf8");
  if (kind === "docs") {
    return [
      "run",
      "--rm",
      "--init",
      "--name",
      "tintero-contract-docs",
      "-p",
      `127.0.0.1:${port}:8080`,
      "--mount",
      `type=bind,source=${specPath},target=/usr/share/nginx/html/v1.json,readonly`,
      "-e",
      "URL=/v1.json",
      imageFrom(conf, "SWAGGER_UI_IMAGE"),
    ];
  }
  return [
    "run",
    "--rm",
    "--name",
    "tintero-contract-mock",
    "-p",
    `127.0.0.1:${port}:4010`,
    "--mount",
    `type=bind,source=${specPath},target=/spec/v1.json,readonly`,
    imageFrom(conf, "PRISM_IMAGE"),
    "mock",
    "-h",
    "0.0.0.0",
    // Prism's multiprocess mode crashes on this image's Node; one process is enough here.
    "--multiprocess=false",
    "/spec/v1.json",
  ];
}

if (import.meta.main) {
  const mode = process.argv[2];
  const spec = join(REPO, "contract", "openapi", "v1.json");
  if (mode !== "docs" && mode !== "mock") {
    console.error("usage: serve.ts docs|mock");
    process.exit(2);
  }
  // No shell: arguments go straight to docker. Ctrl+C reaches docker, which stops the container.
  const child = spawn("docker", dockerArgs(mode, spec, mode === "docs" ? 8099 : 4010), {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
