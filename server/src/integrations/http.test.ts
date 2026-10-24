import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guardedHttp, IntegrationHttpError, type HttpErrorCode } from "./http.ts";
import { triliumTasksManifest, type Manifest } from "./manifest.ts";
import { keyFileIn, startFakeEtapi, TOKEN, type FakeEtapi } from "./testing.ts";

let fake: FakeEtapi;
beforeEach(async () => {
  fake = await startFakeEtapi();
});
afterEach(async () => {
  await fake.close();
});

const make = (options: Parameters<typeof guardedHttp>[3] = {}, manifest = triliumTasksManifest) =>
  guardedHttp(new URL(fake.baseUrl), fake.keyFile, manifest, options);

async function codeOf(run: () => unknown): Promise<HttpErrorCode | undefined> {
  try {
    await run();
  } catch (error) {
    if (error instanceof IntegrationHttpError) return error.code;
    throw error;
  }
  return undefined;
}

describe("guardedHttp: origin", () => {
  it("rejects hosts that are not allowed, without calling", () => {
    const port = new URL(fake.baseUrl).port;
    const bad = (base: string, manifest: Manifest = triliumTasksManifest): string | undefined => {
      try {
        guardedHttp(new URL(base), fake.keyFile, manifest);
      } catch (error) {
        return error instanceof IntegrationHttpError ? error.code : "other";
      }
      return undefined;
    };
    expect(bad(fake.baseUrl, { ...triliumTasksManifest, hosts: ["example.org"] })).toBe("host");
    expect(bad("http://192.168.1.10:8080/etapi")).toBe("host");
    expect(bad(`ftp://127.0.0.1:${port}/`)).toBe("host");
    expect(bad("http://127.0.0.1/etapi")).toBe("host");
    expect(bad("https://example.org/etapi")).toBeUndefined();
    expect(fake.requests).toHaveLength(0);
  });
});

describe("guardedHttp: paths and routes", () => {
  it("rejects bad paths and routes outside the manifest without calling", async () => {
    const http = make({ allowWrite: true });
    for (const path of ["notes/x", "//example.org/x", "/notes/../app", "/notes/x#y", "/notes\\x"]) {
      expect(await codeOf(() => http.request("GET", path))).toBe("bad-path");
    }
    expect(await codeOf(() => http.request("GET", "/app/info"))).toBe("route");
    expect(await codeOf(() => http.request("PATCH", "/notes/tarjeta00001", {}))).toBe("route");
    expect(await codeOf(() => http.request("GET", "/attributes/x"))).toBe("route");
    expect(fake.requests).toHaveLength(0);
  });

  it("keeps the base pathname and sends the token exactly", async () => {
    const http = make();
    const result = await http.request("GET", "/notes/tarjeta00001");
    expect(result.status).toBe(200);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.url).toBe("/etapi/notes/tarjeta00001");
    expect(fake.requests[0]?.auth).toBe(TOKEN);
  });
});

describe("guardedHttp: write permission", () => {
  it("needs manifest.writes and allowWrite", async () => {
    const patch = (http: ReturnType<typeof make>) =>
      http.request("PATCH", "/attributes/atrstatus001", { value: "Hecho" });
    expect(
      await codeOf(() =>
        patch(make({ allowWrite: true }, { ...triliumTasksManifest, writes: false })),
      ),
    ).toBe("write-denied");
    expect(await codeOf(() => patch(make()))).toBe("write-denied");
    expect(await codeOf(() => patch(make({ allowWrite: false })))).toBe("write-denied");
    expect(fake.requests).toHaveLength(0);
    await patch(make({ allowWrite: true }));
    expect(fake.patches()).toHaveLength(1);
    expect(fake.patches()[0]?.body).toBe('{"value":"Hecho"}');
  });
});

describe("guardedHttp: key", () => {
  const keyCode = (file: string): string | undefined => {
    try {
      guardedHttp(new URL(fake.baseUrl), file, triliumTasksManifest);
    } catch (error) {
      expect((error as Error).message).not.toContain(TOKEN);
      return error instanceof IntegrationHttpError ? error.code : "other";
    }
    return undefined;
  };

  it("checks existence, permissions, size and content", () => {
    expect(keyCode(keyFileIn(fake.dir, `${TOKEN}\n`, 0o644))).toBe("key-permissions");
    expect(keyCode(join(fake.dir, "nada.txt"))).toBe("key-missing");
    expect(keyCode(keyFileIn(fake.dir, "a".repeat(4097)))).toBe("key-too-large");
    expect(keyCode(keyFileIn(fake.dir, "\n  \n"))).toBe("key-empty");
    expect(keyCode(keyFileIn(fake.dir, `${TOKEN}\n`))).toBeUndefined();
    expect(keyCode(fake.dir)).toBe("key-missing"); // a directory
  });

  it("holds no copy of the token in its own properties", () => {
    const http = make();
    expect(JSON.stringify(Object.entries(http).map(([k, v]) => [k, String(v)]))).not.toContain(
      TOKEN,
    );
  });
});

describe("guardedHttp: limits and log", () => {
  it("cuts a body over maxBytes, with or without Content-Length", async () => {
    for (const length of [true, false]) {
      const lines: Record<string, unknown>[] = [];
      fake.override = { body: Buffer.alloc(1_048_577, 0x61), length };
      const http = make({ log: (l) => lines.push(l) });
      expect(await codeOf(() => http.request("GET", "/notes/x"))).toBe("too-large");
      expect(lines).toHaveLength(1);
      expect(lines[0]?.status).toBe(200);
    }
  });

  it("times out, even while the body is slow", async () => {
    const lines: Record<string, unknown>[] = [];
    fake.delayMs = 1500;
    const http = make({ timeoutMs: 200, log: (l) => lines.push(l) });
    const started = Date.now();
    expect(await codeOf(() => http.request("GET", "/notes/tarjeta00001"))).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(1000);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.status).toBe(0);
  });

  it("maps network failures, statuses and bad JSON, one log line each", async () => {
    const lines: Record<string, unknown>[] = [];
    const clock = () => new Date("2026-10-24T17:00:00Z");
    const http = make({ log: (l) => lines.push(l), clock });
    fake.offline = true;
    expect(await codeOf(() => http.request("GET", "/notes/tarjeta00001"))).toBe("network");
    fake.offline = false;

    const wrongKey = guardedHttp(
      new URL(fake.baseUrl),
      keyFileIn(fake.dir, "otro-token\n"),
      triliumTasksManifest,
      { log: (l) => lines.push(l), clock },
    );
    try {
      await wrongKey.request("GET", "/notes/tarjeta00001");
    } catch (error) {
      expect(error).toMatchObject({ code: "status", httpStatus: 401 });
    }

    fake.override = { body: "{", length: true };
    expect(await codeOf(() => http.request("GET", "/notes/x"))).toBe("bad-json");

    expect(lines.map((l) => l.status)).toEqual([0, 401, 200]);
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual([
        "host",
        "integration",
        "method",
        "ms",
        "status",
        "ts",
      ]);
      expect(line.ts).toBe("2026-10-24T17:00:00.000Z");
      expect(line.integration).toBe("trilium-tareas");
      expect(JSON.stringify(line)).not.toContain(TOKEN);
    }
  });

  it("returns null for an empty body", async () => {
    fake.override = { body: "", length: true };
    expect(await make().request("GET", "/notes/x")).toEqual({ status: 200, json: null });
  });
});
