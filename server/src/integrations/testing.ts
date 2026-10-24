// A fake Trilium ETAPI on 127.0.0.1 for unit tests (never a real Trilium), plus a key file helper.
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TOKEN = "token-de-prueba-123";
export const BOARD = "tablero00001";

export interface Recorded {
  method: string;
  url: string;
  body: string;
  auth: string | undefined;
}

interface Attr {
  attributeId: string;
  noteId: string;
  type: "label";
  name: string;
  value: string;
  isInheritable: boolean;
  utcDateModified: string;
}

interface Card {
  noteId: string;
  title: string;
  attrs: Attr[];
}

const DEFAULT_DATE = "2026-10-20 09:00:00.000Z";
const attr = (
  attributeId: string,
  noteId: string,
  name: string,
  value: string,
  date = DEFAULT_DATE,
): Attr => ({
  attributeId,
  noteId,
  type: "label",
  name,
  value,
  isInheritable: false,
  utcDateModified: date,
});

function cards(): Card[] {
  const c = (noteId: string, title: string, attrs: Attr[]): Card => ({ noteId, title, attrs });
  return [
    c("tarjeta00002", "Soldar los pines", [
      attr("atrstatus002", "tarjeta00002", "status", "En progreso"),
      attr("atrvence0002", "tarjeta00002", "vence", "mañana"),
    ]),
    c("tarjeta00004", "Esperar repuesto", [
      attr("atrstatus004", "tarjeta00004", "status", "Bloqueada"),
    ]),
    c("tarjeta00001", "Comprar pilas", [
      attr("atrstatus001", "tarjeta00001", "status", "Por hacer"),
      attr("atrvence0001", "tarjeta00001", "vence", "2026-10-26"),
    ]),
    c("tarjeta00005", "Solo título", []),
    c("tarjeta00003", "Pagar el agua", [
      attr("atrstatus003", "tarjeta00003", "status", "Hecho", "2026-10-24 16:30:00.000Z"),
    ]),
    c("tarjeta00006", "Heredada", [attr("atrplantilla", "plantilla001", "status", "Por hacer")]),
    c("tarjeta00007", "x".repeat(250), [
      attr("atrstatus007", "tarjeta00007", "status", "Por hacer"),
    ]),
    c("tarjeta00008", "Cerrada ayer", [
      attr("atrstatus008", "tarjeta00008", "status", "Hecho", "2026-10-23 12:00:00.000Z"),
    ]),
    c("tarjeta00009", "Archivada", [
      attr("atrstatus009", "tarjeta00009", "status", "Por hacer"),
      attr("atrarchiv009", "tarjeta00009", "archived", ""),
    ]),
  ];
}

export interface FakeEtapi {
  baseUrl: string;
  keyFile: string;
  dir: string;
  requests: Recorded[];
  offline: boolean;
  delayMs: number;
  /** Replaces the body of every answer (status 200). `length: false` sends it chunked. */
  override: { body: string | Buffer; length: boolean } | undefined;
  /** Changes the value of an own label (as if done from Trilium). */
  setLabel(noteId: string, name: string, value: string): void;
  label(noteId: string, name: string): string | undefined;
  patches(): Recorded[];
  close(): Promise<void>;
}

function noteJson(card: Card): Record<string, unknown> {
  const inherited = [
    attr(
      "atrherstatus",
      BOARD,
      "label:status",
      "promoted,alias=Estado,single,select,options=Por hacer;En progreso;Hecho",
    ),
    attr("atrhervence", BOARD, "label:vence", "promoted,alias=Vence,single,date"),
  ];
  return {
    noteId: card.noteId,
    title: card.title,
    type: "text",
    utcDateModified: DEFAULT_DATE,
    attributes: [...card.attrs, ...inherited],
  };
}

export function keyFileIn(dir: string, content = `${TOKEN}\n`, mode = 0o600): string {
  const file = join(dir, "key.txt");
  /* eslint-disable security/detect-non-literal-fs-filename -- temporary test folder */
  writeFileSync(file, content, { mode });
  chmodSync(file, mode);
  /* eslint-enable security/detect-non-literal-fs-filename */
  return file;
}

export async function startFakeEtapi(): Promise<FakeEtapi> {
  const dir = mkdtempSync(join(tmpdir(), "tintero-etapi-"));
  const data = cards();
  const requests: Recorded[] = [];
  const fake: FakeEtapi = {
    baseUrl: "",
    keyFile: keyFileIn(dir),
    dir,
    requests,
    offline: false,
    delayMs: 0,
    override: undefined,
    setLabel(noteId, name, value) {
      const found = data.find((c) => c.noteId === noteId)?.attrs.find((a) => a.name === name);
      if (found) {
        found.value = value;
        found.utcDateModified = "2026-10-24 17:00:00.000Z";
      }
    },
    label: (noteId, name) =>
      data
        .find((c) => c.noteId === noteId)
        ?.attrs.find((a) => a.name === name && a.noteId === noteId)?.value,
    patches: () => requests.filter((r) => r.method === "PATCH"),
    close: () => Promise.resolve(),
  };

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const answer = (req: IncomingMessage, res: ServerResponse, body: string): void => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    if (fake.override) {
      res.writeHead(
        200,
        fake.override.length ? { "content-length": fake.override.body.length } : {},
      );
      res.end(fake.override.body);
      return;
    }
    // eslint-disable-next-line security/detect-possible-timing-attacks -- a fake with a test token
    if (req.headers.authorization !== TOKEN) {
      json(res, 401, { status: 401, code: "NOT_AUTHENTICATED", message: "x" });
      return;
    }
    const notFound = (code: string): void => {
      json(res, 404, { status: 404, code, message: "x" });
    };
    if (req.method === "GET" && path === "/etapi/notes") {
      const ok =
        url.searchParams.get("search") === "#status" &&
        url.searchParams.get("ancestorNoteId") === BOARD &&
        url.searchParams.get("ancestorDepth") === "eq1" &&
        url.searchParams.get("limit") === "1000";
      if (!ok) {
        notFound("NOTE_NOT_FOUND");
        return;
      }
      const withStatus = data.filter((c) => c.attrs.some((a) => a.name === "status"));
      json(res, 200, { results: withStatus.reverse().map(noteJson) });
      return;
    }
    const note = /^\/etapi\/notes\/([A-Za-z0-9_]+)$/.exec(path)?.[1];
    if (req.method === "GET" && note === BOARD) {
      json(res, 200, {
        noteId: BOARD,
        title: "Tablero",
        type: "book",
        childNoteIds: data.map((c) => c.noteId),
        attributes: [],
      });
      return;
    }
    if (req.method === "GET" && note !== undefined) {
      const card = data.find((c) => c.noteId === note);
      if (card) json(res, 200, noteJson(card));
      else notFound("NOTE_NOT_FOUND");
      return;
    }
    const attrId = /^\/etapi\/attributes\/([A-Za-z0-9_]+)$/.exec(path)?.[1];
    if (req.method === "PATCH" && attrId !== undefined) {
      const found = data.flatMap((c) => c.attrs).find((a) => a.attributeId === attrId);
      if (!found) {
        notFound("ATTRIBUTE_NOT_FOUND");
        return;
      }
      found.value = (JSON.parse(body) as { value: string }).value;
      found.utcDateModified = "2026-10-24 17:00:00.000Z";
      json(res, 200, found);
      return;
    }
    res.writeHead(404).end();
  };

  const server: Server = createServer((req, res) => {
    const parts: Buffer[] = [];
    req.on("data", (chunk: Buffer) => parts.push(chunk));
    req.on("end", () => {
      requests.push({
        method: req.method ?? "",
        url: req.url ?? "",
        body: Buffer.concat(parts).toString("utf8"),
        auth: req.headers.authorization,
      });
      if (fake.offline) {
        req.socket.destroy();
        return;
      }
      const run = (): void => {
        answer(req, res, requests.at(-1)?.body ?? "");
      };
      if (fake.delayMs > 0) setTimeout(run, fake.delayMs);
      else run();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fake.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/etapi`;
  fake.close = async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
    rmSync(dir, { recursive: true, force: true });
  };
  return fake;
}
