import { describe, expect, it } from "vitest";
import { parseLocalConfig, parseSpec, readToken, TriliumClient } from "./publish-spec.ts";

const SPEC = "# F-001 · Contrato del protocolo\n\nTexto.\n";

describe("parseSpec", () => {
  it("reads id and title from the first heading", () => {
    expect(parseSpec(SPEC)).toMatchObject({ id: "F-001", title: "F-001 · Contrato del protocolo" });
  });

  it("rejects a file without a spec heading", () => {
    expect(() => parseSpec("# Otra cosa\n")).toThrow(/F-NNN/);
  });
});

describe("readToken", () => {
  it("finds the token line", () => {
    expect(readToken("A=1\nTRILIUM_ETAPI_TOKEN=abc\n")).toBe("abc");
  });

  it("fails without a token", () => {
    expect(() => readToken("A=1\n")).toThrow(/TRILIUM_ETAPI_TOKEN/);
  });
});

interface Call {
  method: string;
  url: string;
}

function fakeTrilium(existing: string[]): {
  calls: Call[];
  fetchFn: (url: string, init: RequestInit) => Promise<Response>;
} {
  const calls: Call[] = [];
  const json = (body: unknown): Response =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  const fetchFn = (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? "GET";
    calls.push({ method, url });
    if (method === "GET")
      return Promise.resolve(json({ results: existing.map((noteId) => ({ noteId })) }));
    if (url.endsWith("create-note")) return Promise.resolve(json({ note: { noteId: "NEW" } }));
    return Promise.resolve(new Response(""));
  };
  return { calls, fetchFn };
}

describe("TriliumClient.publish", () => {
  it("creates the note and its label the first time", async () => {
    const { calls, fetchFn } = fakeTrilium([]);
    const result = await new TriliumClient("http://t/etapi", "tok", "PARENT", fetchFn).publish(
      parseSpec(SPEC),
    );
    expect(result).toEqual({ noteId: "NEW", created: true });
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "POST"]);
  });

  it("updates the same note instead of creating another one", async () => {
    const { calls, fetchFn } = fakeTrilium(["OLD"]);
    const result = await new TriliumClient("http://t/etapi", "tok", "PARENT", fetchFn).publish(
      parseSpec(SPEC),
    );
    expect(result).toEqual({ noteId: "OLD", created: false });
    expect(calls.map((call) => call.method)).toEqual(["GET", "PUT", "PATCH"]);
  });

  it("refuses to guess when two notes share the label", async () => {
    const { fetchFn } = fakeTrilium(["A", "B"]);
    await expect(
      new TriliumClient("http://t/etapi", "tok", "PARENT", fetchFn).publish(parseSpec(SPEC)),
    ).rejects.toThrow(/2 notas/);
  });
});

describe("parseLocalConfig", () => {
  it("reads the three keys and expands ~ in the token file", () => {
    const text =
      "# c\nTRILIUM_ETAPI_URL=http://t/etapi\nTRILIUM_TOKEN_FILE=~/x/env\nTRILIUM_FICHAS_NOTE_ID=abc\n";
    expect(parseLocalConfig(text, "/h")).toEqual({
      etapiUrl: "http://t/etapi",
      tokenFile: "/h/x/env",
      fichasNoteId: "abc",
    });
  });

  it("names every missing key", () => {
    expect(() => parseLocalConfig("TRILIUM_ETAPI_URL=x\n", "/h")).toThrow(
      /TRILIUM_TOKEN_FILE, TRILIUM_FICHAS_NOTE_ID/,
    );
  });
});
