import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ROOT, rmDir, tmpDir } from "./helpers.ts";

/* CA15 sin conocer el nombre de la función que arma los argumentos: se copia
 * contract/scripts/serve.ts a un árbol temporal cuya ruta contiene «:» y se corre con un
 * `docker` falso que imprime sus argumentos, uno por línea. */
let base: string | undefined;
afterEach(() => {
  if (base) rmDir(base);
  base = undefined;
});

function dockerArgs(mode: string, repoDirName: string): Promise<{ args: string[]; repo: string }> {
  base = tmpDir("tintero-f003-serve-");
  const repo = join(base, repoDirName);
  const bin = join(base, "bin");
  /* eslint-disable security/detect-non-literal-fs-filename -- temp test tree */
  mkdirSync(join(repo, "contract", "scripts"), { recursive: true });
  mkdirSync(join(repo, "contract", "openapi"), { recursive: true });
  mkdirSync(join(repo, "tools"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  copyFileSync(
    join(ROOT, "contract", "scripts", "serve.ts"),
    join(repo, "contract", "scripts", "serve.ts"),
  );
  copyFileSync(join(ROOT, "tools", "images.conf"), join(repo, "tools", "images.conf"));
  writeFileSync(join(repo, "contract", "openapi", "v1.json"), "{}");
  writeFileSync(join(repo, "package.json"), '{"type":"module"}');
  writeFileSync(join(bin, "docker"), '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
  chmodSync(join(bin, "docker"), 0o755);
  /* eslint-enable security/detect-non-literal-fs-filename */
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(repo, "contract", "scripts", "serve.ts"), mode], {
      env: { PATH: `${bin}:${process.env.PATH ?? ""}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", () => {
      if (out === "") reject(new Error(`sin argumentos de docker: ${err}`));
      else resolve({ args: out.split("\n").filter((l) => l !== ""), repo });
    });
  });
}

describe("CA15 serve.ts monta con --mount", () => {
  for (const mode of ["docs", "mock"]) {
    it(`${mode}: --mount type=bind,source=<ruta>,target=… y ningún -v`, async () => {
      const { args, repo } = await dockerArgs(mode, "repo");
      const spec = join(repo, "contract", "openapi", "v1.json");
      const at = args.indexOf("--mount");
      expect(at).toBeGreaterThanOrEqual(0);
      const value = args[at + 1] ?? "";
      expect(value.startsWith(`type=bind,source=${spec},target=/`)).toBe(true);
      expect(value).toMatch(/,target=\/[^,]+/);
      expect(args).not.toContain("-v");
      expect(args.some((a) => a.startsWith("--volume"))).toBe(false);
    });

    it(`${mode}: una ruta con «:» queda intacta en source=`, async () => {
      const { args, repo } = await dockerArgs(mode, "repo:con:dos-puntos");
      const spec = join(repo, "contract", "openapi", "v1.json");
      expect(spec).toContain(":");
      const mount = args.find((a) => a.startsWith("type=bind,"));
      expect(mount).toBeDefined();
      expect(mount?.includes(`source=${spec},`)).toBe(true);
    });
  }
});
