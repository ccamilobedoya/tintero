// Starts the Swagger UI viewer ("docs") or the Prism simulator ("mock") in Docker, bound to 127.0.0.1.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const SPEC = join(REPO, "contract", "openapi", "v1.json");

export function imageFrom(conf: string, variable: string): string {
  for (const line of conf.split("\n")) {
    const match = /^([A-Z_]+)=(\S+)/.exec(line);
    if (match?.[1] === variable && match[2] !== undefined) return match[2];
  }
  throw new Error(`${variable} not found in tools/images.conf`);
}

const mode = process.argv[2];
const conf = readFileSync(join(REPO, "tools", "images.conf"), "utf8");
let args: string[];
if (mode === "docs") {
  args = [
    "run",
    "--rm",
    "--init",
    "--name",
    "tintero-contract-docs",
    "-p",
    "127.0.0.1:8099:8080",
    "-v",
    `${SPEC}:/usr/share/nginx/html/v1.json:ro`,
    "-e",
    "URL=/v1.json",
    imageFrom(conf, "SWAGGER_UI_IMAGE"),
  ];
} else if (mode === "mock") {
  args = [
    "run",
    "--rm",
    "--name",
    "tintero-contract-mock",
    "-p",
    "127.0.0.1:4010:4010",
    "-v",
    `${SPEC}:/spec/v1.json:ro`,
    imageFrom(conf, "PRISM_IMAGE"),
    "mock",
    "-h",
    "0.0.0.0",
    // Prism's multiprocess mode crashes on this image's Node; one process is enough here.
    "--multiprocess=false",
    "/spec/v1.json",
  ];
} else {
  console.error("usage: serve.ts docs|mock");
  process.exit(2);
}

// No shell: arguments go straight to docker. Ctrl+C reaches docker, which stops the container.
const child = spawn("docker", args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
