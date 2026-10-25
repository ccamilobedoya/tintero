import { inspect } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardedHttp } from "../../../server/src/integrations/http.ts";
import { triliumTasksManifest } from "../../../server/src/integrations/manifest.ts";
import {
  NOW,
  TOKEN,
  codeOf,
  expectCleanLogs,
  mkHttp,
  sink,
  startEtapi,
  tmp,
  type FakeEtapi,
  type Line,
  type Tmp,
} from "./helpers.ts";

let t: Tmp;
let fake: FakeEtapi;
let good: string;
const allLogs: Line[] = [];

beforeAll(async () => {
  t = tmp();
  fake = await startEtapi();
  good = t.file("llave-buena", `${TOKEN}\n`);
});
afterAll(async () => {
  await fake.close();
  t.cleanup();
});

describe("CA1 origen y rutas", () => {
  it("base fuera de lo permitido → host, sin tocar la red", async () => {
    const make = (base: string, hosts: "configured" | string[]) => () =>
      guardedHttp(new URL(base), good, { ...triliumTasksManifest, hosts });
    expect(await codeOf(make(fake.base, ["example.org"]))).toBe("host");
    expect(await codeOf(make("http://192.168.1.10:8080/etapi", "configured"))).toBe("host");
    expect(await codeOf(make(`ftp://127.0.0.1:${fake.port}/`, "configured"))).toBe("host");
    expect(fake.requests).toHaveLength(0);
  });

  it("control: una base buena se crea", () => {
    expect(await_noThrow(() => guardedHttp(new URL(fake.base), good, triliumTasksManifest))).toBe(
      true,
    );
  });

  it("rutas y métodos fuera del manifiesto o mal formados se rechazan sin llamar", async () => {
    const { http, logs } = mkHttp(fake, good);
    const get = (p: string) => () => http.request("GET", p);
    expect(await codeOf(get("notes/x"))).toBe("bad-path");
    expect(await codeOf(get("//example.org/x"))).toBe("bad-path");
    expect(await codeOf(get("/notes/../app"))).toBe("bad-path");
    expect(await codeOf(get("/notes/x#y"))).toBe("bad-path");
    expect(await codeOf(get("/notes/x\\y"))).toBe("bad-path");
    expect(await codeOf(get("/notes/http://x"))).toBe("bad-path");
    expect(await codeOf(get("/app/info"))).toBe("route");
    expect(await codeOf(() => http.request("PATCH", "/notes/tarjeta00001", { value: "x" }))).toBe(
      "route",
    );
    expect(fake.requests).toHaveLength(0);
    expect(logs.lines).toHaveLength(0);
  });
});

function await_noThrow(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

describe("CA2 llave", () => {
  it("permisos, ausencia, tamaño y vacío", () => {
    const make = (file: string) => () =>
      guardedHttp(new URL(fake.base), file, triliumTasksManifest);
    const messages: string[] = [];
    const codeAndMessage = (file: string) => {
      try {
        make(file)();
        return "no-lanzó";
      } catch (e) {
        messages.push((e as Error).message);
        return (e as { code?: string }).code;
      }
    };
    expect(codeAndMessage(t.file("k-644", `${TOKEN}\n`, 0o644))).toBe("key-permissions");
    expect(codeAndMessage(t.file("k-640", `${TOKEN}\n`, 0o640))).toBe("key-permissions");
    expect(codeAndMessage(`${t.dir}/no-existe`)).toBe("key-missing");
    expect(codeAndMessage(t.file("k-big", `${TOKEN}${"a".repeat(4097 - TOKEN.length)}`))).toBe(
      "key-too-large",
    );
    expect(codeAndMessage(t.file("k-empty", "\n  \n"))).toBe("key-empty");
    for (const m of messages) expect(m).not.toContain(TOKEN);
    expect(fake.requests).toHaveLength(0);
  });

  it("4096 bytes exactos caben", () => {
    const f = t.file("k-4096", `${TOKEN}${"a".repeat(4095 - TOKEN.length)}\n`);
    expect(await_noThrow(() => guardedHttp(new URL(fake.base), f, triliumTasksManifest))).toBe(
      true,
    );
  });

  it("el token va exacto en cada petición y el objeto no lo guarda", async () => {
    const { http } = mkHttp(fake, good);
    fake.requests.length = 0;
    await http.request("GET", "/notes/tablero00001");
    await http.request("GET", "/notes/tarjeta00001");
    await http.request("PATCH", "/attributes/atrstatus001", { value: "Por hacer" });
    expect(fake.requests).toHaveLength(3);
    for (const r of fake.requests) expect(r.authorization).toBe(TOKEN);
    for (const name of Object.getOwnPropertyNames(http)) {
      const v = (http as unknown as Record<string, unknown>)[name];
      const json = JSON.stringify(v) as string | undefined;
      expect(json ?? "").not.toContain(TOKEN);
    }
    expect(inspect(http, { showHidden: true, depth: 4 })).not.toContain(TOKEN);
  });

  it("la llave se lee una sola vez, al crear", async () => {
    const f = t.file("k-once", `${TOKEN}\n`);
    const { http } = mkHttp(fake, f);
    t.file("k-once", "otro-token-distinto\n");
    fake.requests.length = 0;
    await http.request("GET", "/notes/tablero00001");
    expect(fake.requests[0]?.authorization).toBe(TOKEN);
  });
});

describe("CA3 topes", () => {
  const oneLine = (logs: { lines: Line[] }, status: number): void => {
    expect(logs.lines).toHaveLength(1);
    const l = logs.lines[0];
    if (!l) throw new Error("sin línea de registro");
    expect(l.status).toBe(status);
    expect(l.ts).toBe(new Date(NOW).toISOString());
    expect(l.integration).toBe("trilium-tareas");
    expect(l.host).toBe(`127.0.0.1:${fake.port}`);
    expect(l.method).toBe("GET");
    expect(typeof l.ms).toBe("number");
    allLogs.push(l);
  };

  it("1 048 577 bytes → too-large, con y sin Content-Length", async () => {
    for (const contentLength of [true, false]) {
      fake.override = { body: "a".repeat(1_048_577), contentLength };
      const { http, logs } = mkHttp(fake, good);
      expect(await codeOf(() => http.request("GET", "/notes/tablero00001"))).toBe("too-large");
      oneLine(logs, 200);
    }
    fake.override = undefined;
  });

  it("el tope se puede bajar con maxBytes", async () => {
    fake.override = { body: JSON.stringify({ a: "b".repeat(300) }), contentLength: true };
    const { http } = mkHttp(fake, good, { maxBytes: 100 });
    expect(await codeOf(() => http.request("GET", "/notes/tablero00001"))).toBe("too-large");
    fake.override = undefined;
  });

  it("falso lento → timeout antes de 1000 ms", async () => {
    fake.delayMs = 1500;
    const { http, logs } = mkHttp(fake, good, { timeoutMs: 200 });
    const t0 = Date.now();
    expect(await codeOf(() => http.request("GET", "/notes/tablero00001"))).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(1000);
    oneLine(logs, 0);
    fake.delayMs = 0;
  });

  it("sin conexión → network", async () => {
    fake.offline = true;
    const { http, logs } = mkHttp(fake, good);
    expect(await codeOf(() => http.request("GET", "/notes/tablero00001"))).toBe("network");
    oneLine(logs, 0);
    fake.offline = false;
  });

  it("401 → status con httpStatus 401", async () => {
    const bad = t.file("k-otra", "otro-token-distinto\n");
    const { http, logs } = mkHttp(fake, bad);
    let err: { code?: string; httpStatus?: number; message?: string } = {};
    try {
      await http.request("GET", "/notes/tablero00001");
    } catch (e) {
      err = e as typeof err;
    }
    expect(err.code).toBe("status");
    expect(err.httpStatus).toBe(401);
    expect(err.message ?? "").not.toContain("NOT_AUTHENTICATED");
    oneLine(logs, 401);
  });

  it("cuerpo « { » → bad-json", async () => {
    fake.override = { body: "{", contentLength: true };
    const { http, logs } = mkHttp(fake, good);
    expect(await codeOf(() => http.request("GET", "/notes/tablero00001"))).toBe("bad-json");
    oneLine(logs, 200);
    fake.override = undefined;
  });

  it("cuerpo vacío → json null; 200 normal → json", async () => {
    fake.override = { body: "", contentLength: true };
    const { http } = mkHttp(fake, good);
    expect((await http.request("GET", "/notes/tablero00001")).json).toBeNull();
    fake.override = undefined;
    const r = await http.request("GET", "/notes/tablero00001");
    expect(r.status).toBe(200);
    expect((r.json as { noteId: string }).noteId).toBe("tablero00001");
  });
});

describe("CA4 escribir pide permiso", () => {
  it("sin writes o sin allowWrite → write-denied y 0 peticiones", async () => {
    fake.requests.length = 0;
    const patch = (h: { request: (m: "PATCH", p: string, b: unknown) => Promise<unknown> }) => () =>
      h.request("PATCH", "/attributes/atrstatus001", { value: "Hecho" });
    const noWrites = mkHttp(fake, good, {
      manifest: { ...triliumTasksManifest, writes: false },
      allowWrite: true,
    });
    expect(await codeOf(patch(noWrites.http))).toBe("write-denied");
    const noAllow = mkHttp(fake, good, { allowWrite: false });
    expect(await codeOf(patch(noAllow.http))).toBe("write-denied");
    const absent = guardedHttp(new URL(fake.base), good, triliumTasksManifest, { log: sink().log });
    expect(await codeOf(patch(absent))).toBe("write-denied");
    expect(fake.requests).toHaveLength(0);
  });

  it("control: con ambos permisos el PATCH sale", async () => {
    const { http } = mkHttp(fake, good, { allowWrite: true });
    const r = await http.request("PATCH", "/attributes/atrstatus001", { value: "Por hacer" });
    expect(r.status).toBe(200);
    expect(fake.requests.at(-1)?.body).toBe('{"value":"Por hacer"}');
  });
});

describe("CA12 (parte del cliente)", () => {
  it("las líneas del cliente no llevan contenido", () => {
    expect(allLogs.length).toBeGreaterThan(0);
    expectCleanLogs(allLogs);
  });
});
