/* eslint-disable @typescript-eslint/no-unsafe-member-access, security/detect-non-literal-fs-filename -- JSON de prueba y carpetas temporales propias */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DATA_PATH,
  VIEWS_PATH,
  edited,
  rmDir,
  runNpm,
  tmpDir,
  viewsText,
  type Loose,
} from "./helpers.ts";

describe("CA3 servidor con archivos inválidos", () => {
  let dir: string;
  beforeAll(() => {
    dir = tmpDir("tintero-f005-args-");
  });
  afterAll(() => {
    rmDir(dir);
  });

  it("--views sin --data sale con 2", async () => {
    const r = await runNpm("server", ["--port", "0", "--views", VIEWS_PATH], 60_000);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain("listening");
  });

  it("--data sin --views sale con 2", async () => {
    const r = await runNpm("server", ["--port", "0", "--data", DATA_PATH], 60_000);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain("listening");
  });

  it("archivo de vistas inválido: sale con 2 y nombra la ruta JSON", async () => {
    const bad = join(dir, "views.json");
    writeFileSync(
      bad,
      edited(viewsText(), (o: Loose) => {
        o.views[0].id = "h-oy";
      }),
    );
    const r = await runNpm("server", ["--port", "0", "--views", bad, "--data", DATA_PATH], 60_000);
    expect(r.code).toBe(2);
    expect(r.out + r.err).toContain("/views/0/id");
    expect(r.out).not.toContain("listening");
  });

  it("--chromium con otra dirección que 127.0.0.1 sale con 2", async () => {
    const r = await runNpm(
      "server",
      [
        "--port",
        "0",
        "--views",
        VIEWS_PATH,
        "--data",
        DATA_PATH,
        "--chromium",
        "http://192.0.2.1:9222",
      ],
      60_000,
    );
    expect(r.code).toBe(2);
    expect(r.out).not.toContain("listening");
  });
});
