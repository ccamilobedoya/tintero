import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError } from "../../../server/src/engine/config.ts";
import { parseIntegrations } from "../../../server/src/integrations/config.ts";
import {
  createExampleJson,
  EXAMPLE_JSON_PATH,
  parseExampleTasks,
} from "../../../server/src/integrations/example-json.ts";
import { guardedHttp, IntegrationHttpError } from "../../../server/src/integrations/http.ts";
import * as manifests from "../../../server/src/integrations/manifest.ts";
import type { Manifest } from "../../../server/src/integrations/manifest.ts";
import { has, read, walk } from "./helpers.ts";

/** El manifiesto que declara el módulo `example-json` (D8, R22), buscado por su id. */
const manifest = (): Manifest | undefined =>
  (Object.values(manifests) as unknown[]).find(
    (m): m is Manifest =>
      typeof m === "object" && m !== null && (m as { id?: unknown }).id === "example-json",
  );

const parse = (entry: unknown): void => {
  parseIntegrations(JSON.stringify({ version: 1, integrations: { "example-json": entry } }));
};
const messageOf = (fn: () => void): string => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  return "";
};

describe("CA21 y R22 example-json", () => {
  it("existe el módulo, su plantilla de configuración y su manifiesto", () => {
    expect(has("server/src/integrations/example-json.ts"), "example-json.ts").toBe(true);
    expect(has("server/src/integrations/example-json.test.ts"), "sus pruebas unitarias").toBe(true);
    expect(manifest(), "no hay un manifiesto con id example-json en manifest.ts").toBeDefined();
  });

  it("R22: el manifiesto no pide llave, no escribe, solo usa GET y solo el origen configurado", () => {
    const m = manifest();
    expect(m?.needsKey).toBe(false);
    expect(m?.writes).toBe(false);
    expect(m?.hosts).toBe("configured");
    expect(m?.routes.length).toBeGreaterThan(0);
    expect(m?.routes.every((r) => r.method === "GET")).toBe(true);
  });

  it("http: (fuera de 127.0.0.1) → ConfigError que nombra baseUrl y no repite el valor", () => {
    const message = messageOf(() => {
      parse({ source: "tareas", baseUrl: "http://example.com/data" });
    });
    expect(message).toContain("example-json");
    expect(message).toContain("baseUrl");
    expect(message).not.toContain("example.com");
  });

  it("https: no es rechazada por la baseUrl", () => {
    const message = messageOf(() => {
      parse({ source: "tareas", baseUrl: "https://example.com/" });
    });
    expect(message).not.toContain("baseUrl");
  });

  it("la integración sigue apagada si no se configura (no hace falta en la configuración)", () => {
    expect(() => parseIntegrations(JSON.stringify({ version: 1, integrations: {} }))).not.toThrow();
  });

  it("hay un ejemplo de configuración config/example-json.*.example.json con valores de relleno", () => {
    expect(exampleFiles().length, "ningún config/example-json.*.example.json").toBeGreaterThan(0);
    for (const file of exampleFiles()) {
      const text = read(`config/${file}`);
      expect(text, file).not.toMatch(/http:\/\/(?!127\.0\.0\.1)/);
    }
  });
});

function exampleFiles(): string[] {
  return walk("config")
    .map((f) => f.slice("config/".length))
    .filter((f) => /^example-json\..*\.example\.json$/.test(f));
}

// --- lo que el núcleo hace cumplir con ese manifiesto (límite, redirección) ------------------

describe("CA21 el cliente con guardia, con el manifiesto de example-json", () => {
  const hits: string[] = [];
  const mode = { current: "" };
  let server: Server;
  let base: URL;
  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url ?? "";
      hits.push(url);
      if (mode.current === "exact") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(`[${" ".repeat(65_534)}]`);
      } else if (mode.current === "big") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(`[${" ".repeat(65_535)}]`);
      } else if (mode.current === "redirect") {
        res.writeHead(302, { location: "/target" });
        res.end();
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("[]");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = new URL(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}`);
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  });

  const client = (): ReturnType<typeof guardedHttp> => {
    const m = manifest();
    if (m === undefined) throw new Error("no hay manifiesto example-json");
    return guardedHttp(base, undefined, m, { maxBytes: 65_536, timeoutMs: 3000 });
  };
  const path = (): string => EXAMPLE_JSON_PATH;

  it("una respuesta de 64 KiB exactos se lee", async () => {
    mode.current = "exact";
    const r = await client().request("GET", path());
    expect(r.status).toBe(200);
  });

  it("64 KiB + 1 byte → error too-large (antes de parsear: el cuerpo es JSON válido)", async () => {
    mode.current = "big";
    const error = await client()
      .request("GET", path())
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(IntegrationHttpError);
    expect((error as IntegrationHttpError).code).toBe("too-large");
  });

  it("una redirección → error, y no se sigue", async () => {
    hits.length = 0;
    mode.current = "redirect";
    const error = await client()
      .request("GET", path())
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect(hits.some((u) => u.endsWith("target"))).toBe(false);
  });
});

// --- un campo de tipo incorrecto o un id repetido no llega al motor ---------------------------

const good = { id: "a1", title: "Water the plants", done: false, due: "2026-10-30" };
const badAnswers: [string, unknown][] = [
  ["done de tipo incorrecto", [{ ...good, done: "no" }]],
  ["title de tipo incorrecto", [{ ...good, title: 5 }]],
  ["due que no es fecha", [{ ...good, due: "mañana" }]],
  ["id repetido", [good, { ...good, title: "Otra" }]],
  ["no es una lista", { items: [good] }],
];

/** Cuenta cuántas veces llega algo al motor falso. */
const fakeEngine = (calls: unknown[]): { setSource: (...args: unknown[]) => { ok: true } } => ({
  setSource: (...args: unknown[]) => {
    calls.push(args);
    return { ok: true };
  },
});

const runCycle = async (json: unknown, calls: unknown[]): Promise<void> => {
  const integration = createExampleJson({
    http: { request: () => Promise.resolve({ status: 200, json }) } as never,
    source: "tareas",
    engine: fakeEngine(calls) as never,
    log: () => undefined,
  });
  await integration.cycle();
  await integration.stop();
};

describe("CA21 un campo incorrecto no llega al motor", () => {
  it("parseExampleTasks acepta lo bueno", () => {
    expect(parseExampleTasks([good])).toEqual([good]);
  });

  for (const [name, answer] of badAnswers) {
    it(`${name} → bad-json y setSource no se llama`, async () => {
      expect(() => parseExampleTasks(answer)).toThrow(
        expect.objectContaining({ code: "bad-json" }) as Error,
      );
      const calls: unknown[] = [];
      await runCycle(answer, calls);
      expect(calls).toHaveLength(0);
    });
  }

  it("una respuesta buena sí llega al motor (la prueba mide algo)", async () => {
    const calls: unknown[] = [];
    await runCycle([good], calls);
    expect(calls).toHaveLength(1);
  });
});
