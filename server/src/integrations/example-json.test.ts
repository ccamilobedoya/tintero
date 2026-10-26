import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "../engine/config.ts";
import {
  createExampleJson,
  EXAMPLE_JSON_HTTP_LIMITS,
  EXAMPLE_JSON_PATH,
  parseExampleTasks,
} from "./example-json.ts";
import { checkAgainstData, parseIntegrations } from "./config.ts";
import { guardedHttp } from "./http.ts";
import { exampleJsonManifest } from "./manifest.ts";

const GOOD = [
  { id: "a1", title: "Water the plants", done: false, due: "2026-10-30" },
  { id: "a2", title: "Pay the bill", done: true },
];

interface Fake {
  base: URL;
  urls: string[];
  auth: (string | undefined)[];
  reply: { status: number; headers: Record<string, string>; body: string | Buffer };
  close(): Promise<void>;
}

async function startFake(): Promise<Fake> {
  const fake: Fake = {
    base: new URL("http://127.0.0.1:1"),
    urls: [],
    auth: [],
    reply: { status: 200, headers: {}, body: "[]" },
    close: () => Promise.resolve(),
  };
  const server: Server = createServer((req, res) => {
    fake.urls.push(req.url ?? "");
    fake.auth.push(req.headers.authorization);
    res.writeHead(fake.reply.status, {
      "content-type": "application/json",
      ...fake.reply.headers,
    });
    res.end(fake.reply.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fake.base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  fake.close = async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  };
  return fake;
}

let fake: Fake;
let lines: Record<string, unknown>[];
let delivered: { source: string; items: unknown; readAt?: Date }[];
const now = new Date("2026-10-26T13:00:00Z");
const engine = {
  setSource: (source: string, items: unknown, meta?: { readAt?: Date }) => {
    delivered.push({
      source,
      items,
      ...(meta?.readAt === undefined ? {} : { readAt: meta.readAt }),
    });
    return { ok: true as const, changed: true };
  },
};

const make = () =>
  createExampleJson({
    http: guardedHttp(fake.base, undefined, exampleJsonManifest, {
      ...EXAMPLE_JSON_HTTP_LIMITS,
      timeoutMs: 2000,
    }),
    source: "remote",
    engine,
    clock: () => now,
    log: (line) => lines.push(line),
  });

beforeEach(async () => {
  fake = await startFake();
  lines = [];
  delivered = [];
});
afterEach(async () => {
  await fake.close();
});

describe("parseExampleTasks", () => {
  it("keeps only the known fields of valid items", () => {
    const parsed = parseExampleTasks([{ ...GOOD[0], extra: "x" }, GOOD[1]]);
    expect(parsed).toEqual(GOOD);
  });

  it("rejects a wrong type, a bad date, a repeated id, a bad id or a non-list", () => {
    const bad: unknown[] = [
      { id: "a", title: "t", done: "no" },
      { id: "a", title: 5, done: false },
      { id: "a", title: "", done: false },
      { id: "a", title: "x".repeat(201), done: false },
      { id: 7, title: "t", done: false },
      { id: "a b", title: "t", done: false },
      { id: "a", title: "t", done: false, due: "2026-02-31" },
      { id: "a", title: "t", done: false, due: 20261030 },
      "text",
      null,
    ];
    for (const entry of bad) {
      expect(() => parseExampleTasks([entry]), JSON.stringify(entry)).toThrow(
        expect.objectContaining({ code: "bad-json" }),
      );
    }
    expect(() => parseExampleTasks([GOOD[0], GOOD[0]])).toThrow();
    expect(() => parseExampleTasks({ items: [] })).toThrow();
    expect(() =>
      parseExampleTasks(
        Array.from({ length: 101 }, (_, i) => ({ id: `i${i}`, title: "t", done: false })),
      ),
    ).toThrow();
  });
});

describe("createExampleJson", () => {
  it("reads only /tasks.json with a GET and no key, and delivers the checked items", async () => {
    fake.reply.body = JSON.stringify(GOOD);
    const integration = make();
    await integration.cycle();
    expect(fake.urls).toEqual([EXAMPLE_JSON_PATH]);
    expect(fake.auth).toEqual([undefined]);
    expect(delivered).toEqual([{ source: "remote", items: GOOD, readAt: now }]);
    expect(lines.at(-1)).toMatchObject({ integration: "example-json", event: "read", items: 2 });
    expect(JSON.stringify(lines)).not.toContain("Water");
  });

  it("an answer of 64 KiB + 1 byte fails before parsing and delivers nothing", async () => {
    const big = Buffer.alloc(65_537, 0x20);
    big.write("[]", 0);
    fake.reply.body = big;
    await make().cycle();
    expect(delivered).toEqual([]);
    expect(lines.at(-1)).toMatchObject({ event: "error", code: "too-large" });
  });

  it("an answer of exactly 64 KiB is read", async () => {
    const exact = Buffer.alloc(65_536, 0x20);
    exact.write("[]", 0);
    fake.reply.body = exact;
    await make().cycle();
    expect(delivered).toHaveLength(1);
  });

  it("a redirect is an error, not followed", async () => {
    fake.reply = { status: 302, headers: { location: "http://127.0.0.1:1/x" }, body: "" };
    await make().cycle();
    expect(delivered).toEqual([]);
    expect(fake.urls).toEqual([EXAMPLE_JSON_PATH]);
    expect(lines.at(-1)).toMatchObject({ event: "error" });
  });

  it("a field of the wrong type never reaches the engine", async () => {
    fake.reply.body = JSON.stringify([GOOD[0], { id: "a2", title: "t", done: "yes" }]);
    await make().cycle();
    expect(delivered).toEqual([]);
    expect(lines.at(-1)).toMatchObject({ event: "error", code: "bad-json" });
  });

  it("a status error or invalid JSON keeps the engine as it was", async () => {
    fake.reply = { status: 500, headers: {}, body: "{}" };
    const integration = make();
    await integration.cycle();
    expect(lines.at(-1)).toMatchObject({ event: "error", code: "status", status: 500 });
    fake.reply = { status: 200, headers: {}, body: "not json" };
    await integration.cycle();
    expect(lines.at(-1)).toMatchObject({ event: "error", code: "bad-json" });
    expect(delivered).toEqual([]);
  });

  it("the manifest allows no other path and no write", async () => {
    const http = guardedHttp(fake.base, undefined, exampleJsonManifest);
    await expect(http.request("GET", "/other.json")).rejects.toMatchObject({ code: "route" });
    await expect(http.request("PATCH", EXAMPLE_JSON_PATH, {})).rejects.toMatchObject({
      code: "route",
    });
    expect(fake.urls).toEqual([]);
  });

  it("start schedules a first read and stop waits for it", async () => {
    fake.reply.body = JSON.stringify(GOOD);
    const integration = make();
    integration.start();
    await integration.idle();
    expect(delivered).toHaveLength(1);
    await integration.stop();
    await integration.cycle();
    expect(delivered).toHaveLength(1);
  });
});

describe("example-json in the integrations file", () => {
  const file = (entry: unknown): string =>
    JSON.stringify({ version: 1, integrations: { "example-json": entry } });

  it("accepts an https base and is absent when not configured", () => {
    const parsed = parseIntegrations(
      file({ source: "remote", baseUrl: "https://example.com/tintero" }),
    );
    expect(parsed.integrations["example-json"]).toEqual({
      source: "remote",
      baseUrl: "https://example.com/tintero",
    });
    expect(parseIntegrations('{"version":1,"integrations":{}}').integrations["example-json"]).toBe(
      undefined,
    );
  });

  it("rejects http: (even the local one), a bad URL and unknown fields", () => {
    for (const baseUrl of [
      "http://example.com/x",
      "http://127.0.0.1:8080/x",
      "ftp://example.com",
      "not a url",
      "https://user:pw@example.com",
      "https://example.com/x?key=1",
    ]) {
      expect(() => parseIntegrations(file({ source: "remote", baseUrl }))).toThrow(ConfigError);
      expect(() => parseIntegrations(file({ source: "remote", baseUrl }))).toThrow(
        /example-json\/baseUrl/,
      );
    }
    expect(() =>
      parseIntegrations(file({ source: "remote", baseUrl: "https://example.com", keyFile: "/k" })),
    ).toThrow(/unknown field/);
  });

  it("needs a read-only tasks source in the data", () => {
    const parsed = parseIntegrations(file({ source: "remote", baseUrl: "https://example.com" }));
    const data = (type: string, readonly: boolean) =>
      ({ version: 1, sources: { remote: { type, readonly, items: [] } } }) as never;
    const check = (value: never): void => {
      checkAgainstData(parsed, value);
    };
    expect(() => {
      check(data("tasks", true));
    }).not.toThrow();
    expect(() => {
      check(data("events", true));
    }).toThrow(/source of type tasks/);
    expect(() => {
      check(data("tasks", false));
    }).toThrow(/read-only/);
    expect(() => {
      check({ version: 1, sources: {} } as never);
    }).toThrow(/source of type tasks/);
  });
});
