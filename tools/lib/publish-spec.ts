// CLI: tools/publicar-ficha <docs/fichas/F-NNN-*.md>
// Copies a spec to Trilium under the "Fichas" note, found by its #ficha label: creates it once, then
// updates it. PNG images the spec links with a relative path (e.g. `../disenos/F-006/x.png`) go up as
// image attachments of that note, reused by file name, and the links are rewritten to point at them,
// so the designs live in Trilium too and survive every republish. Where Trilium is and which note holds the specs is local configuration, never in the
// repo (ADR-0023): $TINTERO_LOCAL_ENV or ~/.config/tintero/local.env (see docs/configuracion-local.md).
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { asArray, asRecord, asString } from "./json.ts";

export interface SpecImage {
  /** The link exactly as the spec writes it. */
  link: string;
  /** Attachment title in Trilium: the file name, unique within the spec. */
  name: string;
  bytes: Uint8Array;
}

export interface Spec {
  id: string;
  title: string;
  content: string;
  images?: SpecImage[];
}

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_LINK = /!\[([^\]]*)\]\(([^)\s]+\.png)\)/g;

/** Relative PNG links of the spec, without repeats, in order. Absolute and remote links are left alone. */
export function imageLinks(markdown: string): string[] {
  const links: string[] = [];
  for (const match of markdown.matchAll(IMAGE_LINK)) {
    const link = match[2] ?? "";
    if (/^([a-z]+:|\/)/i.test(link) || links.includes(link)) continue;
    links.push(link);
  }
  return links;
}

/** Points every image link at its attachment; links without one stay as they are. */
export function rewriteImages(markdown: string, attachments: Map<string, string>): string {
  return markdown.replace(IMAGE_LINK, (whole, alt: string, link: string) => {
    const id = attachments.get(link);
    return id === undefined
      ? whole
      : `![${alt}](api/attachments/${id}/image/${encodeURIComponent(basename(link))})`;
  });
}

/** Reads the linked images: only PNGs inside `docs/`, each up to MAX_IMAGE_BYTES, names unique. */
export function loadImages(markdown: string, specPath: string, repoRoot: string): SpecImage[] {
  const docs = resolve(repoRoot, "docs");
  const images: SpecImage[] = [];
  for (const link of imageLinks(markdown)) {
    const path = resolve(dirname(specPath), decodeURI(link));
    if (relative(docs, path).startsWith("..") || !path.startsWith(docs + sep))
      throw new Error(`La imagen ${link} está fuera de docs/.`);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- checked to be inside docs/
    const size = statSync(path).size;
    if (size > MAX_IMAGE_BYTES)
      throw new Error(`La imagen ${link} pesa ${size} bytes (tope ${MAX_IMAGE_BYTES}).`);
    const name = basename(path);
    if (images.some((image) => image.name === name))
      throw new Error(`Dos imágenes se llaman ${name}; cambiarle el nombre a una.`);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- checked to be inside docs/
    images.push({ link, name, bytes: new Uint8Array(readFileSync(path)) });
  }
  return images;
}

export function parseSpec(markdown: string): Spec {
  const heading = /^# (F-\d{3}) · (.+)$/m.exec(markdown);
  if (heading?.[1] === undefined || heading[2] === undefined) {
    throw new Error("La ficha debe empezar con un título «# F-NNN · Título».");
  }
  return { id: heading[1], title: `${heading[1]} · ${heading[2].trim()}`, content: markdown };
}

export interface LocalConfig {
  etapiUrl: string;
  tokenFile: string;
  fichasNoteId: string;
}

const CONFIG_KEYS = ["TRILIUM_ETAPI_URL", "TRILIUM_TOKEN_FILE", "TRILIUM_FICHAS_NOTE_ID"] as const;

export function parseLocalConfig(envText: string, home: string): LocalConfig {
  const values = new Map<string, string>();
  for (const line of envText.split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) values.set(match[1], match[2].trim());
  }
  const missing = CONFIG_KEYS.filter((key) => (values.get(key) ?? "") === "");
  if (missing.length > 0) {
    throw new Error(
      `Falta en la configuración local: ${missing.join(", ")} (ver docs/configuracion-local.md).`,
    );
  }
  const tokenFile = values.get("TRILIUM_TOKEN_FILE") ?? "";
  return {
    etapiUrl: values.get("TRILIUM_ETAPI_URL") ?? "",
    tokenFile: tokenFile.startsWith("~/") ? join(home, tokenFile.slice(2)) : tokenFile,
    fichasNoteId: values.get("TRILIUM_FICHAS_NOTE_ID") ?? "",
  };
}

export function readToken(envText: string): string {
  const line = envText.split("\n").find((entry) => entry.startsWith("TRILIUM_ETAPI_TOKEN="));
  const token = line?.slice("TRILIUM_ETAPI_TOKEN=".length).trim() ?? "";
  if (token.length === 0)
    throw new Error("No hay TRILIUM_ETAPI_TOKEN en el archivo del token (TRILIUM_TOKEN_FILE).");
  return token;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export class TriliumClient {
  private readonly base: string;
  private readonly token: string;
  private readonly fichasNoteId: string;
  private readonly fetchFn: Fetch;

  constructor(base: string, token: string, fichasNoteId: string, fetchFn: Fetch = fetch) {
    this.base = base;
    this.token = token;
    this.fichasNoteId = fichasNoteId;
    this.fetchFn = fetchFn;
  }

  private async request(
    method: string,
    path: string,
    body?: string | Uint8Array,
    type = "application/json",
  ): Promise<unknown> {
    const init: RequestInit = {
      method,
      headers: { Authorization: this.token, "Content-Type": type },
    };
    if (body !== undefined) init.body = body;
    const response = await this.fetchFn(`${this.base}/${path}`, init);
    if (!response.ok) throw new Error(`Trilium respondió ${response.status} en ${method} ${path}`);
    const text = await response.text();
    return text === "" || !(response.headers.get("content-type") ?? "").includes("json")
      ? undefined
      : JSON.parse(text);
  }

  async findSpec(id: string): Promise<string | undefined> {
    const query = encodeURIComponent(`#ficha="${id}"`);
    const data = await this.request(
      "GET",
      `notes?search=${query}&ancestorNoteId=${this.fichasNoteId}`,
    );
    const ids = asArray(asRecord(data).results).map((note) => asString(asRecord(note).noteId));
    if (ids.length > 1)
      throw new Error(`Hay ${ids.length} notas con #ficha=${id}; arreglarlo a mano.`);
    return ids[0];
  }

  /** Uploads each image as an attachment of the note (reusing one with the same title). */
  async syncImages(noteId: string, images: SpecImage[]): Promise<Map<string, string>> {
    const current = asArray(await this.request("GET", `notes/${noteId}/attachments`)).map(
      (entry) => {
        const record = asRecord(entry);
        return {
          id: asString(record.attachmentId),
          title: asString(record.title),
          role: asString(record.role),
        };
      },
    );
    const ids = new Map<string, string>();
    for (const image of images) {
      let id = current.find((att) => att.role === "image" && att.title === image.name)?.id;
      if (id === undefined) {
        const created = await this.request(
          "POST",
          "attachments",
          JSON.stringify({
            ownerId: noteId,
            role: "image",
            mime: "image/png",
            title: image.name,
            content: "",
          }),
        );
        id = asString(asRecord(created).attachmentId);
        if (id === "") throw new Error(`Trilium no devolvió el id del adjunto ${image.name}.`);
      }
      await this.request(
        "PUT",
        `attachments/${id}/content`,
        image.bytes,
        "application/octet-stream",
      );
      ids.set(image.link, id);
    }
    return ids;
  }

  async publish(spec: Spec): Promise<{ noteId: string; created: boolean; images: number }> {
    const images = spec.images ?? [];
    const withImages = async (noteId: string): Promise<void> => {
      if (images.length === 0) return;
      const ids = await this.syncImages(noteId, images);
      await this.request(
        "PUT",
        `notes/${noteId}/content`,
        rewriteImages(spec.content, ids),
        "text/plain",
      );
    };
    const existing = await this.findSpec(spec.id);
    if (existing !== undefined) {
      if (images.length === 0)
        await this.request("PUT", `notes/${existing}/content`, spec.content, "text/plain");
      await this.request("PATCH", `notes/${existing}`, JSON.stringify({ title: spec.title }));
      await withImages(existing);
      return { noteId: existing, created: false, images: images.length };
    }
    const created = await this.request(
      "POST",
      "create-note",
      JSON.stringify({
        parentNoteId: this.fichasNoteId,
        title: spec.title,
        type: "code",
        mime: "text/markdown",
        content: spec.content,
      }),
    );
    const noteId = asString(asRecord(asRecord(created).note).noteId);
    await this.request(
      "POST",
      "attributes",
      JSON.stringify({
        noteId,
        type: "label",
        name: "ficha",
        value: spec.id,
        isInheritable: false,
      }),
    );
    await withImages(noteId);
    return { noteId, created: true, images: images.length };
  }
}

async function main(): Promise<number> {
  const file = process.argv[2];
  if (file === undefined) {
    process.stderr.write("Uso: tools/publicar-ficha <docs/fichas/F-NNN-*.md>\n");
    return 2;
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the architect passes the spec path
  const markdown = readFileSync(file, "utf8");
  const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "../..");
  const spec = { ...parseSpec(markdown), images: loadImages(markdown, resolve(file), repoRoot) };
  const configPath = process.env.TINTERO_LOCAL_ENV ?? join(homedir(), ".config/tintero/local.env");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- local config outside the repo (600)
  const config = parseLocalConfig(readFileSync(configPath, "utf8"), homedir());
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- token file named by the local config
  const token = readToken(readFileSync(config.tokenFile, "utf8"));
  const client = new TriliumClient(config.etapiUrl, token, config.fichasNoteId);
  const result = await client.publish(spec);
  process.stdout.write(
    `${result.created ? "Creada" : "Actualizada"}: ${spec.title} → nota ${result.noteId}` +
      (result.images > 0 ? ` (${result.images} imágenes adjuntas)` : "") +
      "\n",
  );
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main();
}
