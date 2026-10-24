/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- JSON de prueba */
import { afterAll, beforeEach, afterEach, beforeAll, describe, expect, it } from "vitest";
import { IntegrationHttpError } from "../../../server/src/integrations/http.ts";
import { markStage, readBoard } from "../../../server/src/integrations/trilium-tasks.ts";
import {
  COLUMNS,
  EXPECTED_TASKS,
  NOW,
  TOKEN,
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
let key: string;
beforeAll(() => {
  t = tmp();
  key = t.file("llave", `${TOKEN}\n`);
});
afterAll(() => {
  t.cleanup();
});

let fake: FakeEtapi;
beforeEach(async () => {
  fake = await startEtapi();
});
afterEach(async () => {
  await fake.close();
});

const allLogs: Line[] = [];
const now = new Date(NOW);

describe("CA5 lectura", () => {
  it("2 peticiones y las 4 tareas, en el orden del tablero y sin más campos", async () => {
    const logs = sink();
    const { http, logs: httpLogs } = mkHttp(fake, key);
    const r = await readBoard(http, "tablero00001", COLUMNS, now, logs.log);
    allLogs.push(...logs.lines, ...httpLogs.lines);

    expect(fake.requests).toHaveLength(2);
    expect(fake.requests.every((q) => q.method === "GET")).toBe(true);
    const urls = fake.requests.map((q) => new URL(q.path, "http://127.0.0.1"));
    const board = urls.find((u) => u.pathname === "/etapi/notes/tablero00001");
    const search = urls.find((u) => u.pathname === "/etapi/notes");
    expect(board).toBeDefined();
    expect(search?.searchParams.get("search")).toBe("#status");
    expect(search?.searchParams.get("ancestorNoteId")).toBe("tablero00001");
    expect(search?.searchParams.get("ancestorDepth")).toBe("eq1");
    expect(search?.searchParams.get("limit")).toBe("1000");

    expect(r.tasks).toStrictEqual(EXPECTED_TASKS);
    expect(r.statuses).toEqual(
      new Map([
        ["tarjeta00002", "En progreso"],
        ["tarjeta00001", "Por hacer"],
        ["tarjeta00003", "Hecho"],
        ["tarjeta00007", "Por hacer"],
      ]),
    );

    const skipped = logs.lines.filter((l) => l.event === "skipped");
    expect(skipped).toHaveLength(5);
    for (const l of skipped) {
      expect(Object.keys(l).sort()).toEqual(["event", "integration", "reason", "ts"]);
    }
    const reasons = skipped.map((l) => l.reason as string).sort();
    expect(reasons).toEqual(
      ["archived", "no-status", "no-status", "old-done", "unknown-status"].sort(),
    );
  });

  it("con otras columnas, tarjeta00004 entra como doing y tarjeta00002 no", async () => {
    const { http } = mkHttp(fake, key);
    const cols = { "Por hacer": "todo", Bloqueada: "doing", Hecho: "done" } as const;
    const r = await readBoard(http, "tablero00001", cols, now);
    expect(r.tasks.map((x: { id: string }) => x.id)).toEqual([
      "tarjeta00004",
      "tarjeta00001",
      "tarjeta00003",
      "tarjeta00007",
    ]);
    expect(r.tasks[0]).toStrictEqual({
      id: "tarjeta00004",
      title: "Esperar repuesto",
      done: false,
      stage: "doing",
    });
  });

  it("una respuesta sin la forma esperada → bad-json", async () => {
    fake.override = { body: '{"foo":1}', contentLength: true };
    const { http } = mkHttp(fake, key);
    let code: string | undefined;
    try {
      await readBoard(http, "tablero00001", COLUMNS, now);
    } catch (e) {
      expect(e).toBeInstanceOf(IntegrationHttpError);
      code = (e as IntegrationHttpError).code;
    }
    expect(code).toBe("bad-json");
  });
});

describe("CA6 escritura sin pisar", () => {
  const patches = () => fake.requests.filter((r) => r.method === "PATCH");

  it("written: GET de la tarjeta y luego PATCH exacto", async () => {
    const { http, logs } = mkHttp(fake, key);
    expect(await markStage(http, "tarjeta00001", "Por hacer", "Hecho")).toBe("written");
    allLogs.push(...logs.lines);
    expect(fake.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /etapi/notes/tarjeta00001",
      "PATCH /etapi/attributes/atrstatus001",
    ]);
    expect(patches()[0]?.body).toBe('{"value":"Hecho"}');
    expect(fake.statusOf("tarjeta00001")).toBe("Hecho");
  });

  it("si Trilium cambió el status → conflict y ningún PATCH", async () => {
    fake.setStatus("tarjeta00001", "En progreso");
    const { http, logs } = mkHttp(fake, key);
    expect(await markStage(http, "tarjeta00001", "Por hacer", "Hecho")).toBe("conflict");
    allLogs.push(...logs.lines);
    expect(patches()).toHaveLength(0);
    expect(fake.statusOf("tarjeta00001")).toBe("En progreso");
  });

  it("solo heredado y nota inexistente → conflict; nunca un PATCH (ni a atrplantilla)", async () => {
    const { http, logs } = mkHttp(fake, key);
    expect(await markStage(http, "tarjeta00006", "Por hacer", "Hecho")).toBe("conflict");
    expect(await markStage(http, "tarjeta99999", "Por hacer", "Hecho")).toBe("conflict");
    allLogs.push(...logs.lines);
    expect(patches()).toHaveLength(0);
    expect(fake.requests.some((r) => r.path.includes("atrplantilla"))).toBe(false);
  });

  it("otros errores se lanzan (sin conexión → network)", async () => {
    fake.offline = true;
    const { http } = mkHttp(fake, key);
    let code: string | undefined;
    try {
      await markStage(http, "tarjeta00001", "Por hacer", "Hecho");
    } catch (e) {
      code = (e as IntegrationHttpError).code;
    }
    expect(code).toBe("network");
  });
});

describe("CA12 (lectura y escritura)", () => {
  it("los registros no llevan contenido ni ids", () => {
    expect(allLogs.length).toBeGreaterThan(0);
    expectCleanLogs(allLogs);
  });
});
