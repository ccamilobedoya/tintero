/* eslint-disable @typescript-eslint/no-unsafe-member-access -- JSON de prueba */
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError } from "../../../server/src/engine/index.ts";
import { loadIntegrations } from "../../../server/src/integrations/config.ts";
import { DATA6_PATH, ROOT, VIEWS6_PATH, edited, data6Text, runNpm } from "../F-006/helpers.ts";
import { TOKEN, tmp, type Tmp } from "./helpers.ts";

let t: Tmp;
beforeAll(() => {
  t = tmp();
});
afterAll(() => {
  t.cleanup();
});

const PTH = "/integrations/trilium-tareas";
const baseCfg = (): Record<string, unknown> => ({
  source: "tablero",
  baseUrl: "http://127.0.0.1:8080/etapi",
  keyFile: "/tmp/tintero-llave-inexistente",
  boardNoteId: "tablero00001",
  allowWrite: true,
});
const wrap = (c: Record<string, unknown>): string =>
  JSON.stringify({ version: 1, integrations: { "trilium-tareas": c } });

function failure(text: string, name: string): ConfigError | undefined {
  const file = t.file(name, text);
  try {
    loadIntegrations(file);
    return undefined;
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    return e;
  }
}

describe("CA11 configuración", () => {
  it("control: una configuración buena carga", () => {
    const file = t.file("ok.json", wrap(baseCfg()));
    const r = loadIntegrations(file);
    expect(r.version).toBe(1);
    expect(r.integrations["trilium-tareas"]?.boardNoteId).toBe("tablero00001");
    // columns es opcional: con columns válidas también
    const withCols = wrap({ ...baseCfg(), columns: { Pendiente: "todo", Listo: "done" } });
    expect(
      loadIntegrations(t.file("ok2.json", withCols)).integrations["trilium-tareas"],
    ).toBeTruthy();
  });

  it("archivo de 65 537 bytes → ConfigError", () => {
    const pad = " ".repeat(65_537 - wrap(baseCfg()).length);
    const text = `${wrap(baseCfg())}${pad}`;
    expect(Buffer.byteLength(text)).toBe(65_537);
    expect(failure(text, "big.json")).toBeInstanceOf(ConfigError);
  });

  it("campo desconocido (token) → ruta JSON, sin el valor", () => {
    const e = failure(wrap({ ...baseCfg(), token: "valor-secreto-xyz" }), "tok.json");
    expect(e).toBeInstanceOf(ConfigError);
    expect(e?.message).toContain(`${PTH}/token`);
    expect(e?.message).not.toContain("valor-secreto-xyz");
  });

  it("campo desconocido en el nivel superior → ConfigError", () => {
    const text = JSON.stringify({ version: 1, integrations: {}, extra: "valor-raro-xyz" });
    const e = failure(text, "top.json");
    expect(e).toBeInstanceOf(ConfigError);
    expect(e?.message).not.toContain("valor-raro-xyz");
  });

  it("columns con «Hecho»: «closed» → ruta de columns, sin el valor", () => {
    const e = failure(
      wrap({ ...baseCfg(), columns: { "Por hacer": "todo", Hecho: "closed" } }),
      "c1.json",
    );
    expect(e).toBeInstanceOf(ConfigError);
    expect(e?.message).toContain(`${PTH}/columns`);
    expect(e?.message).not.toContain("closed");
  });

  it("columns sin done o sin todo → ConfigError con la ruta", () => {
    const noDone = failure(
      wrap({ ...baseCfg(), columns: { "Por hacer": "todo", "En progreso": "doing" } }),
      "c2.json",
    );
    expect(noDone?.message).toContain(`${PTH}/columns`);
    const noTodo = failure(
      wrap({ ...baseCfg(), columns: { Haciendo: "doing", Hecho: "done" } }),
      "c3.json",
    );
    expect(noTodo?.message).toContain(`${PTH}/columns`);
  });

  it("baseUrl http hacia otro host → ruta, sin el valor", () => {
    const e = failure(wrap({ ...baseCfg(), baseUrl: "http://192.168.1.10:8080/etapi" }), "b.json");
    expect(e).toBeInstanceOf(ConfigError);
    expect(e?.message).toContain(`${PTH}/baseUrl`);
    expect(e?.message).not.toContain("192.168.1.10");
  });

  it("boardNoteId «../x» → ruta, sin el valor", () => {
    const e = failure(wrap({ ...baseCfg(), boardNoteId: "../x" }), "n.json");
    expect(e).toBeInstanceOf(ConfigError);
    expect(e?.message).toContain(`${PTH}/boardNoteId`);
    expect(e?.message).not.toContain("../x");
  });

  it("config/integrations.example.json carga", () => {
    const r = loadIntegrations(join(ROOT, "config/integrations.example.json"));
    expect(r.integrations["trilium-tareas"]?.source).toBe("tablero");
  });
});

describe("CA11 arranque del servidor con --integrations", () => {
  const serverArgs = (integ: string, dataFile = DATA6_PATH): string[] => [
    "--port",
    "0",
    "--views",
    VIEWS6_PATH,
    "--data",
    dataFile,
    "--integrations",
    integ,
  ];
  const keyOk = (): string => t.file("llave-srv", `${TOKEN}\n`);

  it("sin --views/--data sale con 2", async () => {
    const f = t.file("i1.json", wrap({ ...baseCfg(), keyFile: keyOk() }));
    const r = await runNpm("server", ["--port", "0", "--integrations", f], 60_000);
    expect(r.code).toBe(2);
    expect(r.out + r.err).not.toContain(TOKEN);
  }, 90_000);

  it("source inexistente → 2 con la ruta", async () => {
    const f = t.file("i2.json", wrap({ ...baseCfg(), keyFile: keyOk(), source: "nada" }));
    const r = await runNpm("server", serverArgs(f), 60_000);
    expect(r.code).toBe(2);
    expect(r.out + r.err).toContain(`${PTH}/source`);
  }, 90_000);

  it("allowWrite false con la fuente readonly:false → 2 (D15)", async () => {
    const f = t.file("i3.json", wrap({ ...baseCfg(), keyFile: keyOk(), allowWrite: false }));
    const data = t.file(
      "data-rw.json",
      edited(data6Text(), (o) => {
        o.sources.tablero.readonly = false;
      }),
    );
    const r = await runNpm("server", serverArgs(f, data), 60_000);
    expect(r.code).toBe(2);
    expect(r.out + r.err).toContain(`${PTH}/allowWrite`);
  }, 90_000);

  it("allowWrite true con la fuente readonly:true → 2 (D15, al revés)", async () => {
    const f = t.file("i4.json", wrap({ ...baseCfg(), keyFile: keyOk(), allowWrite: true }));
    const data = t.file(
      "data-ro.json",
      edited(data6Text(), (o) => {
        o.sources.tablero.readonly = true;
      }),
    );
    const r = await runNpm("server", serverArgs(f, data), 60_000);
    expect(r.code).toBe(2);
    expect(r.out + r.err).toContain(`${PTH}/allowWrite`);
  }, 90_000);

  it("la llave en 0644 → 2 con key-permissions, sin el token", async () => {
    const key = t.file("llave-644", `${TOKEN}\n`, 0o644);
    const f = t.file("i5.json", wrap({ ...baseCfg(), keyFile: key }));
    const data = t.file(
      "data-rw2.json",
      edited(data6Text(), (o) => {
        o.sources.tablero.readonly = false;
      }),
    );
    const r = await runNpm("server", serverArgs(f, data), 60_000);
    expect(r.code).toBe(2);
    expect(r.out + r.err).toContain("key-permissions");
    expect(r.out + r.err).not.toContain(TOKEN);
  }, 90_000);
});
