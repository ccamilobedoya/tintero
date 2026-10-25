/* eslint-disable @typescript-eslint/no-unsafe-member-access -- objetos de error y JSON de prueba */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError } from "../../../server/src/engine/index.ts";
import { guardedHttp } from "../../../server/src/integrations/http.ts";
import { loadIntegrations } from "../../../server/src/integrations/config.ts";
import { triliumTasksManifest } from "../../../server/src/integrations/manifest.ts";
import { TOKEN, codeOf, mkHttp, startEtapi, tmp, type FakeEtapi, type Tmp } from "./helpers.ts";
import { sleep, startRaw } from "./rig.ts";

let t: Tmp;
let fake: FakeEtapi;
let good: string;
beforeAll(async () => {
  t = tmp();
  fake = await startEtapi();
  good = t.file("llave-buena", `${TOKEN}\n`);
});
afterAll(async () => {
  await fake.close();
  t.cleanup();
});

/** Ejecuta `fn` y devuelve el código del error y los rechazos sueltos tras esperar 500 ms. */
async function withUnhandled(
  fn: () => Promise<unknown>,
): Promise<{ code?: string; loose: number }> {
  let loose = 0;
  const handler = (): void => {
    loose++;
  };
  process.on("unhandledRejection", handler);
  try {
    const code = await codeOf(fn);
    await sleep(500);
    return { ...(code === undefined ? {} : { code }), loose };
  } finally {
    process.off("unhandledRejection", handler);
  }
}

describe("CA14 sin rechazos sueltos", () => {
  it("corta a media respuesta → timeout, 0 rechazos sueltos", async () => {
    const raw = await startRaw("half");
    try {
      const http = guardedHttp(new URL(raw.base), good, triliumTasksManifest, { timeoutMs: 200 });
      const r = await withUnhandled(() => http.request("GET", "/notes/tablero00001"));
      expect(r.code).toBe("timeout");
      expect(r.loose).toBe(0);
    } finally {
      await raw.close();
    }
  });

  it("1 048 577 bytes en trozos de 64 KiB → too-large, 0 rechazos sueltos", async () => {
    fake.override = { body: Buffer.alloc(1_048_577, 0x20), contentLength: false };
    try {
      const { http } = mkHttp(fake, good);
      const r = await withUnhandled(() => http.request("GET", "/notes/tablero00001"));
      expect(r.code).toBe("too-large");
      expect(r.loose).toBe(0);
    } finally {
      fake.override = undefined;
    }
  });

  it("500 → status, 0 rechazos sueltos", async () => {
    const raw = await startRaw("500");
    try {
      const http = guardedHttp(new URL(raw.base), good, triliumTasksManifest, { timeoutMs: 2000 });
      const r = await withUnhandled(() => http.request("GET", "/notes/tablero00001"));
      expect(r.code).toBe("status");
      expect(r.loose).toBe(0);
    } finally {
      await raw.close();
    }
  });
});

describe("CA15 rutas por segmento", () => {
  it("/notesXYZ y /attributesX/1 → route, sin llamar", async () => {
    const n = fake.requests.length;
    const { http } = mkHttp(fake, good);
    expect(await codeOf(() => http.request("GET", "/notesXYZ"))).toBe("route");
    expect(await codeOf(() => http.request("PATCH", "/attributesX/1", { value: "x" }))).toBe(
      "route",
    );
    expect(fake.requests).toHaveLength(n);
  });

  it("/notes, /notes/x y /notes?search=%23status pasan el chequeo de ruta", async () => {
    const { http } = mkHttp(fake, good);
    for (const p of ["/notes", "/notes/x", "/notes?search=%23status"]) {
      const code = await codeOf(() => http.request("GET", p));
      expect(code, p).not.toBe("route");
      expect(code, p).not.toBe("bad-path");
    }
  });
});

describe("CA16 columnas en los errores", () => {
  it("el puntero usa la posición y no el nombre ni el valor", () => {
    const file = t.file(
      "col.json",
      JSON.stringify({
        version: 1,
        integrations: {
          "trilium-tareas": {
            source: "tablero",
            baseUrl: "http://127.0.0.1:8080/etapi",
            keyFile: "/tmp/tintero-llave-inexistente",
            boardNoteId: "tablero00001",
            allowWrite: true,
            columns: { "Por hacer": "todo", Hecho: "closed" },
          },
        },
      }),
    );
    let err: unknown;
    try {
      loadIntegrations(file);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    const msg = (err as Error).message;
    expect(msg).toContain("/integrations/trilium-tareas/columns/1");
    expect(msg).not.toContain("Hecho");
    expect(msg).not.toContain("closed");
  });
});
