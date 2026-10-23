import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ROOT = new URL("../../../", import.meta.url).pathname;

export function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "tintero-f007-"));
}
export function rmDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export interface Exit {
  code: number | null;
  text: string;
  ms: number;
}

/** Runs the emulator CLI directly with node (killed after `maxMs`). */
export function runEmulator(args: string[], maxMs = 15_000): Promise<Exit> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn("node", ["emulator/src/cli.ts", ...args], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "";
    p.stdout.on("data", (d: Buffer) => (text += d.toString()));
    p.stderr.on("data", (d: Buffer) => (text += d.toString()));
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
    }, maxMs);
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, text, ms: Date.now() - t0 });
    });
  });
}
