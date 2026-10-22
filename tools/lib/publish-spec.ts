// CLI: tools/publicar-ficha <docs/fichas/F-NNN-*.md>
// Copies a spec to Trilium under the "Fichas" note, found by its #ficha label: creates it once, then
// updates it. Where Trilium is and which note holds the specs is local configuration, never in the
// repo (ADR-0023): $TINTERO_LOCAL_ENV or ~/.config/tintero/local.env (see docs/configuracion-local.md).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { asArray, asRecord, asString } from "./json.ts";

export interface Spec {
  id: string;
  title: string;
  content: string;
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
    body?: string,
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

  async publish(spec: Spec): Promise<{ noteId: string; created: boolean }> {
    const existing = await this.findSpec(spec.id);
    if (existing !== undefined) {
      await this.request("PUT", `notes/${existing}/content`, spec.content, "text/plain");
      await this.request("PATCH", `notes/${existing}`, JSON.stringify({ title: spec.title }));
      return { noteId: existing, created: false };
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
    return { noteId, created: true };
  }
}

async function main(): Promise<number> {
  const file = process.argv[2];
  if (file === undefined) {
    process.stderr.write("Uso: tools/publicar-ficha <docs/fichas/F-NNN-*.md>\n");
    return 2;
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the architect passes the spec path
  const spec = parseSpec(readFileSync(file, "utf8"));
  const configPath = process.env.TINTERO_LOCAL_ENV ?? join(homedir(), ".config/tintero/local.env");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- local config outside the repo (600)
  const config = parseLocalConfig(readFileSync(configPath, "utf8"), homedir());
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- token file named by the local config
  const token = readToken(readFileSync(config.tokenFile, "utf8"));
  const client = new TriliumClient(config.etapiUrl, token, config.fichasNoteId);
  const result = await client.publish(spec);
  process.stdout.write(
    `${result.created ? "Creada" : "Actualizada"}: ${spec.title} → nota ${result.noteId}\n`,
  );
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main();
}
