/* eslint-disable security/detect-non-literal-fs-filename -- temp folders of the test */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  imageLinks,
  loadImages,
  MAX_IMAGE_BYTES,
  parseLocalConfig,
  parseSpec,
  readToken,
  rewriteImages,
  TriliumClient,
} from "./publish-spec.ts";

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
  body?: unknown;
}

function fakeTrilium(
  existing: string[],
  attachments: { attachmentId: string; title: string; role: string }[] = [],
): {
  calls: Call[];
  fetchFn: (url: string, init: RequestInit) => Promise<Response>;
} {
  const calls: Call[] = [];
  const json = (body: unknown): Response =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  const fetchFn = (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? "GET";
    calls.push({ method, url, body: init.body });
    if (method === "GET" && url.endsWith("/attachments")) return Promise.resolve(json(attachments));
    if (method === "POST" && url.endsWith("/attachments"))
      return Promise.resolve(json({ attachmentId: "ATT" }));
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
    expect(result).toEqual({ noteId: "NEW", created: true, images: 0 });
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "POST"]);
  });

  it("updates the same note instead of creating another one", async () => {
    const { calls, fetchFn } = fakeTrilium(["OLD"]);
    const result = await new TriliumClient("http://t/etapi", "tok", "PARENT", fetchFn).publish(
      parseSpec(SPEC),
    );
    expect(result).toEqual({ noteId: "OLD", created: false, images: 0 });
    expect(calls.map((call) => call.method)).toEqual(["GET", "PUT", "PATCH"]);
  });

  it("uploads a new image, then writes the content pointing at it", async () => {
    const { calls, fetchFn } = fakeTrilium(["OLD"]);
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const spec = {
      ...parseSpec(`${SPEC}\n![Hoy](../disenos/F-006/1-hoy.png)\n`),
      images: [{ link: "../disenos/F-006/1-hoy.png", name: "1-hoy.png", bytes }],
    };
    const result = await new TriliumClient("http://t/etapi", "tok", "PARENT", fetchFn).publish(
      spec,
    );
    expect(result.images).toBe(1);
    expect(
      calls.map((call) => `${call.method} ${call.url.replace("http://t/etapi/", "")}`),
    ).toEqual([
      expect.stringMatching(/^GET notes\?search=/),
      "PATCH notes/OLD",
      "GET notes/OLD/attachments",
      "POST attachments",
      "PUT attachments/ATT/content",
      "PUT notes/OLD/content",
    ]);
    expect(calls[4]?.body).toBe(bytes);
    expect(calls[5]?.body).toContain("![Hoy](api/attachments/ATT/image/1-hoy.png)");
  });

  it("reuses the attachment with the same name instead of adding another", async () => {
    const { calls, fetchFn } = fakeTrilium(
      ["OLD"],
      [{ attachmentId: "KEEP", title: "1-hoy.png", role: "image" }],
    );
    const spec = {
      ...parseSpec(`${SPEC}![Hoy](../disenos/F-006/1-hoy.png)\n`),
      images: [{ link: "../disenos/F-006/1-hoy.png", name: "1-hoy.png", bytes: new Uint8Array(1) }],
    };
    await new TriliumClient("http://t/etapi", "tok", "PARENT", fetchFn).publish(spec);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(calls.map((call) => call.url)).toContain("http://t/etapi/attachments/KEEP/content");
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

describe("image links", () => {
  const md =
    "![a](../disenos/x.png) ![b](https://h/y.png) ![c](/abs/z.png) ![a2](../disenos/x.png) ![d](w.jpg)";

  it("lists only relative PNG links, once each", () => {
    expect(imageLinks(md)).toEqual(["../disenos/x.png"]);
  });

  it("rewrites only the links that have an attachment", () => {
    expect(rewriteImages(md, new Map([["../disenos/x.png", "A1"]]))).toBe(
      "![a](api/attachments/A1/image/x.png) ![b](https://h/y.png) ![c](/abs/z.png) ![a2](api/attachments/A1/image/x.png) ![d](w.jpg)",
    );
  });
});

describe("loadImages", () => {
  function repo(): { root: string; spec: string } {
    const root = mkdtempSync(join(tmpdir(), "tintero-publish-"));
    mkdirSync(join(root, "docs/fichas"), { recursive: true });
    mkdirSync(join(root, "docs/disenos"), { recursive: true });
    return { root, spec: join(root, "docs/fichas/F-006-x.md") };
  }

  it("reads PNGs inside docs/", () => {
    const { root, spec } = repo();
    try {
      writeFileSync(join(root, "docs/disenos/a.png"), new Uint8Array([1, 2, 3]));
      const images = loadImages("![a](../disenos/a.png)", spec, root);
      expect(images).toEqual([
        { link: "../disenos/a.png", name: "a.png", bytes: new Uint8Array([1, 2, 3]) },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a path outside docs/, a big file and two files with the same name", () => {
    const { root, spec } = repo();
    try {
      writeFileSync(join(root, "out.png"), new Uint8Array(1));
      expect(() => loadImages("![x](../../out.png)", spec, root)).toThrow(/fuera de docs/);
      writeFileSync(join(root, "docs/disenos/big.png"), new Uint8Array(MAX_IMAGE_BYTES + 1));
      expect(() => loadImages("![x](../disenos/big.png)", spec, root)).toThrow(/tope/);
      mkdirSync(join(root, "docs/disenos/otra"));
      writeFileSync(join(root, "docs/disenos/a.png"), new Uint8Array(1));
      writeFileSync(join(root, "docs/disenos/otra/a.png"), new Uint8Array(1));
      expect(() =>
        loadImages("![x](../disenos/a.png) ![y](../disenos/otra/a.png)", spec, root),
      ).toThrow(/Dos imágenes/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
