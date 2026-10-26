import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError } from "../../../server/src/engine/index.ts";
import { loadIntegrations } from "../../../server/src/integrations/config.ts";
import { tmp, type Tmp } from "../F-009/helpers.ts";
import { startServer } from "../F-011/helpers.ts";
import { AGENDA_DATA, AGENDA_VIEWS, runNpm } from "./helpers.ts";

let t: Tmp;
beforeAll(() => {
  t = tmp();
});
afterAll(() => {
  t.cleanup();
});

const good = (): Record<string, unknown>[] => [
  { id: "casa", icon: "casa", url: "webcal://calendario.example/publico/casa.ics" },
  { id: "personal", icon: "persona", url: "https://calendario.example/secreto/personal.ics" },
];
const integ = (calendarsFile: string): string =>
  JSON.stringify({
    version: 1,
    integrations: { "ical-calendario": { source: "calendario", calendarsFile } },
  });
const args = (f: string): string[] => [
  "--port",
  "0",
  "--views",
  AGENDA_VIEWS,
  "--data",
  AGENDA_DATA,
  "--integrations",
  f,
];

async function fails(
  name: string,
  calendars: unknown,
  mode = 0o600,
): Promise<{ code: number | null; text: string }> {
  const cal = t.file(`${name}.cal.json`, JSON.stringify(calendars), mode);
  const f = t.file(`${name}.integ.json`, integ(cal));
  const r = await runNpm("server", args(f), 90_000);
  return { code: r.code, text: r.out + r.err };
}

describe("CA5 archivo de calendarios", () => {
  it("en 644 → código 2 con key-permissions", async () => {
    const r = await fails("p644", good(), 0o644);
    expect(r.code).toBe(2);
    expect(r.text).toContain("key-permissions");
    expect(r.text).not.toContain("calendario.example");
  }, 120_000);

  it("11 calendarios → código 2", async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      id: `c${String(i)}`,
      icon: "casa",
      url: `https://calendario.example/secreto/c${String(i)}.ics`,
    }));
    expect((await fails("once", eleven)).code).toBe(2);
  }, 120_000);

  it("una lista vacía → código 2", async () => {
    expect((await fails("vacia", [])).code).toBe(2);
  }, 120_000);

  it("id repetido → error en /1/id", async () => {
    const dup = [good()[0], { ...good()[1], id: "casa" }];
    const r = await fails("dup", dup);
    expect(r.code).toBe(2);
    expect(r.text).toContain("/1/id");
    expect(r.text).not.toContain("calendario.example");
  }, 120_000);

  it("url http:// → mensaje exacto, sin la dirección", async () => {
    const bad = [{ ...good()[0], url: "http://host-secreto.example/ruta-abc.ics" }];
    const r = await fails("http", bad);
    expect(r.code).toBe(2);
    expect(r.text).toContain("calendars: /0/url: must be https:// or webcal://");
    expect(r.text).not.toContain("host-secreto");
    expect(r.text).not.toContain("ruta-abc");
  }, 120_000);

  it("un campo de más → error con su puntero", async () => {
    const extra = [{ ...good()[0], nota: "valor-que-no-debe-salir" }];
    const r = await fails("extra", extra);
    expect(r.code).toBe(2);
    expect(r.text).toContain("/0/nota");
    expect(r.text).not.toContain("valor-que-no-debe-salir");
  }, 120_000);

  it("un icon fuera de la lista → error en /1/icon", async () => {
    const bad = [good()[0], { ...good()[1], icon: "gato" }];
    const r = await fails("icon", bad);
    expect(r.code).toBe(2);
    expect(r.text).toContain("/1/icon");
  }, 120_000);

  it("una url con ? o # → código 2, sin la dirección", async () => {
    for (const url of [
      "https://host-secreto.example/c.ics?token=zzz",
      "https://host-secreto.example/c.ics#x",
      "https://usuario:clave@host-secreto.example/c.ics",
    ]) {
      const r = await fails("q", [{ ...good()[0], url }]);
      expect(r.code, url).toBe(2);
      expect(r.text).not.toContain("host-secreto");
      expect(r.text).not.toContain("zzz");
    }
  }, 240_000);

  it("webcal:// se acepta: el servidor arranca", async () => {
    const cal = t.file("ok.cal.json", JSON.stringify(good()));
    const f = t.file("ok.integ.json", integ(cal));
    const server = await startServer(args(f).slice(2));
    try {
      expect(server.url, server.raw.join("\n")).toBeDefined();
      expect(server.raw.join("\n")).not.toContain("calendario.example/secreto");
    } finally {
      await server.stop();
    }
  }, 240_000);
});

describe("integrations.json: entrada ical-calendario", () => {
  const wrap = (c: Record<string, unknown>): string =>
    t.file(
      `i-${Math.random().toString(36).slice(2)}.json`,
      JSON.stringify({ version: 1, integrations: { "ical-calendario": c } }),
    );
  const failure = (c: Record<string, unknown>): ConfigError | undefined => {
    try {
      loadIntegrations(wrap(c));
      return undefined;
    } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      return e;
    }
  };

  it("una entrada buena carga, con stateFile opcional", () => {
    const a = loadIntegrations(wrap({ source: "calendario", calendarsFile: "/privado/c.json" }));
    expect((a.integrations as Record<string, unknown>)["ical-calendario"]).toBeTruthy();
    const b = loadIntegrations(
      wrap({
        source: "calendario",
        calendarsFile: "/privado/c.json",
        stateFile: "/privado/c.estado.json",
      }),
    );
    expect((b.integrations as Record<string, unknown>)["ical-calendario"]).toBeTruthy();
  });

  it("calendarsFile es obligatorio y absoluto; stateFile absoluto", () => {
    const base = { source: "calendario", calendarsFile: "/privado/c.json" };
    expect(failure({ source: "calendario" })?.message).toContain(
      "/integrations/ical-calendario/calendarsFile",
    );
    expect(failure({ ...base, calendarsFile: "relativo/c.json" })?.message).toContain(
      "/integrations/ical-calendario/calendarsFile",
    );
    expect(failure({ ...base, stateFile: "relativo.json" })?.message).toContain(
      "/integrations/ical-calendario/stateFile",
    );
  });

  it("source de 1 a 64 caracteres; sin source o con 65 es error", () => {
    const base = { calendarsFile: "/privado/c.json" };
    expect(failure({ ...base, source: "" })).toBeInstanceOf(ConfigError);
    expect(failure({ ...base, source: "a".repeat(65) })).toBeInstanceOf(ConfigError);
    expect(failure({ ...base })).toBeInstanceOf(ConfigError);
    expect(failure({ ...base, source: "a".repeat(64) })).toBeUndefined();
  });

  it("un campo desconocido es error con su puntero", () => {
    const e = failure({ source: "calendario", calendarsFile: "/p/c.json", token: "valor-xyz" });
    expect(e?.message).toContain("/integrations/ical-calendario/token");
    expect(e?.message).not.toContain("valor-xyz");
  });
});
