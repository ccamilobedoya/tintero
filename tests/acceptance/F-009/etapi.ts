/* eslint-disable security/detect-possible-timing-attacks -- falso de prueba con token fijo */
// ETAPI falso de F-009 (ficha, sección «ETAPI falso»): 127.0.0.1, puerto 0, token fijo.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const TOKEN = "token-de-prueba-123";
export const BOARD = "tablero00001";
export const DEFAULT_DATE = "2026-10-20 09:00:00.000Z";

export interface Recorded {
  method: string;
  path: string; // ruta con consulta
  body: string;
  authorization: string | undefined;
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

const attr = (
  noteId: string,
  attributeId: string,
  name: string,
  value: string,
  utcDateModified = DEFAULT_DATE,
): Attr => ({
  attributeId,
  noteId,
  type: "label",
  name,
  value,
  isInheritable: false,
  utcDateModified,
});

function cards(): Card[] {
  const own = (id: string, ...a: Attr[]): Attr[] => a.map((x) => ({ ...x, noteId: id }));
  return [
    {
      noteId: "tarjeta00002",
      title: "Soldar los pines",
      attrs: own(
        "tarjeta00002",
        attr("", "atrstatus002", "status", "En progreso"),
        attr("", "atrvence0002", "vence", "mañana"),
      ),
    },
    {
      noteId: "tarjeta00004",
      title: "Esperar repuesto",
      attrs: own("tarjeta00004", attr("", "atrstatus004", "status", "Bloqueada")),
    },
    {
      noteId: "tarjeta00001",
      title: "Comprar pilas",
      attrs: own(
        "tarjeta00001",
        attr("", "atrstatus001", "status", "Por hacer"),
        attr("", "atrvence0001", "vence", "2026-10-26"),
      ),
    },
    { noteId: "tarjeta00005", title: "Solo título", attrs: [] },
    {
      noteId: "tarjeta00003",
      title: "Pagar el agua",
      attrs: own(
        "tarjeta00003",
        attr("", "atrstatus003", "status", "Hecho", "2026-10-24 16:30:00.000Z"),
      ),
    },
    {
      noteId: "tarjeta00006",
      title: "Heredada",
      attrs: [attr("plantilla001", "atrplantilla", "status", "Por hacer")],
    },
    {
      noteId: "tarjeta00007",
      title: "x".repeat(250),
      attrs: own("tarjeta00007", attr("", "atrstatus007", "status", "Por hacer")),
    },
    {
      noteId: "tarjeta00008",
      title: "Cerrada ayer",
      attrs: own(
        "tarjeta00008",
        attr("", "atrstatus008", "status", "Hecho", "2026-10-23 12:00:00.000Z"),
      ),
    },
    {
      noteId: "tarjeta00009",
      title: "Archivada",
      attrs: own(
        "tarjeta00009",
        attr("", "atrstatus009", "status", "Por hacer"),
        attr("", "atrarchiv009", "archived", ""),
      ),
    },
  ];
}

/** Todo lo que la tabla de la ficha pone en el falso y no debe aparecer en un registro. */
export const FORBIDDEN_IN_LOGS: string[] = [
  ...cards().flatMap((c) => [c.noteId, c.title.slice(0, 12), ...c.attrs.map((a) => a.attributeId)]),
  "tablero00001",
  "plantilla001",
  TOKEN,
];

export interface BodyOverride {
  body: string | Buffer;
  /** Si es false, sin Content-Length (la respuesta sale por partes). */
  contentLength: boolean;
}

export interface FakeEtapi {
  base: string;
  port: number;
  requests: Recorded[];
  /** Cierra cada conexión sin responder. */
  offline: boolean;
  /** Espera N ms antes de responder. */
  delayMs: number;
  /** Devuelve este cuerpo (200) a cualquier petición autorizada. */
  override: BodyOverride | undefined;
  setStatus(noteId: string, value: string): void;
  statusOf(noteId: string): string | undefined;
  close(): Promise<void>;
}

function fullAttrs(c: Card): Attr[] {
  return [
    ...c.attrs,
    attr(
      BOARD,
      "atrherest0001",
      "label:status",
      "promoted,alias=Estado,single,select,options=Por hacer;En progreso;Hecho",
    ),
    attr(BOARD, "atrherevn0001", "label:vence", "promoted,alias=Vence,single,date"),
  ];
}
const noteJson = (c: Card): unknown => ({
  noteId: c.noteId,
  title: c.title,
  type: "text",
  utcDateModified: DEFAULT_DATE,
  attributes: fullAttrs(c),
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const parts: Buffer[] = [];
    req.on("data", (d: Buffer) => parts.push(d));
    req.on("end", () => {
      resolve(Buffer.concat(parts).toString("utf8"));
    });
    req.on("error", () => {
      resolve("");
    });
  });
}

export async function startEtapi(): Promise<FakeEtapi> {
  const data = cards();
  const requests: Recorded[] = [];
  const timers = new Set<NodeJS.Timeout>();
  const sockets = new Set<import("node:net").Socket>();
  const state = { offline: false, delayMs: 0, override: undefined as BodyOverride | undefined };

  const json = (res: ServerResponse, status: number, value: unknown): void => {
    const text = JSON.stringify(value);
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(text),
    });
    res.end(text);
  };
  const notFound = (res: ServerResponse, code = "NOT_FOUND"): void => {
    json(res, 404, { status: 404, code, message: "no existe" });
  };

  const answer = (req: IncomingMessage, res: ServerResponse, body: string): void => {
    if (state.override) {
      const o = state.override;
      const buf = typeof o.body === "string" ? Buffer.from(o.body) : o.body;
      if (o.contentLength) {
        res.writeHead(200, { "Content-Type": "application/json", "Content-Length": buf.length });
        res.end(buf);
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        const step = 65536;
        for (let i = 0; i < buf.length; i += step) res.write(buf.subarray(i, i + step));
        res.end();
      }
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = req.method ?? "";
    const path = url.pathname;
    if (method === "GET" && path === "/etapi/notes") {
      const q = url.searchParams;
      if (
        q.get("search") !== "#status" ||
        q.get("ancestorNoteId") !== BOARD ||
        q.get("ancestorDepth") !== "eq1" ||
        q.get("limit") !== "1000"
      ) {
        notFound(res);
        return;
      }
      const hit = data.filter((c) => fullAttrs(c).some((a) => a.name === "status"));
      json(res, 200, { results: [...hit].reverse().map(noteJson) });
      return;
    }
    if (method === "GET" && path === `/etapi/notes/${BOARD}`) {
      json(res, 200, {
        noteId: BOARD,
        title: "Tablero",
        type: "book",
        childNoteIds: data.map((c) => c.noteId),
        attributes: [],
      });
      return;
    }
    const noteMatch = /^\/etapi\/notes\/([A-Za-z0-9_]+)$/.exec(path);
    if (method === "GET" && noteMatch) {
      const card = data.find((c) => c.noteId === noteMatch[1]);
      if (card) json(res, 200, noteJson(card));
      else notFound(res, "NOTE_NOT_FOUND");
      return;
    }
    const attrMatch = /^\/etapi\/attributes\/([A-Za-z0-9_]+)$/.exec(path);
    if (method === "PATCH" && attrMatch) {
      const found = data.flatMap((c) => c.attrs).find((a) => a.attributeId === attrMatch[1]);
      if (!found) {
        notFound(res, "ATTRIBUTE_NOT_FOUND");
        return;
      }
      let value: unknown;
      try {
        value = (JSON.parse(body) as { value?: unknown }).value;
      } catch {
        value = undefined;
      }
      if (typeof value !== "string") {
        json(res, 400, { status: 400, code: "BAD_REQUEST", message: "value" });
        return;
      }
      found.value = value;
      found.utcDateModified = new Date().toISOString().replace("T", " ");
      json(res, 200, found);
      return;
    }
    notFound(res);
  };

  const server: Server = createServer((req, res) => {
    void readBody(req).then((body) => {
      requests.push({
        method: req.method ?? "",
        path: req.url ?? "",
        body,
        authorization: req.headers.authorization,
      });
      if (state.offline) {
        req.socket.destroy();
        return;
      }
      const go = (): void => {
        if (req.headers.authorization !== TOKEN) {
          json(res, 401, { status: 401, code: "NOT_AUTHENTICATED", message: "token" });
          return;
        }
        answer(req, res, body);
      };
      if (state.delayMs > 0) {
        const t = setTimeout(() => {
          timers.delete(t);
          if (!res.destroyed) go();
        }, state.delayMs);
        timers.add(t);
      } else go();
    });
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  const fake: FakeEtapi = {
    base: `http://127.0.0.1:${port}/etapi`,
    port,
    requests,
    get offline() {
      return state.offline;
    },
    set offline(v: boolean) {
      state.offline = v;
    },
    get delayMs() {
      return state.delayMs;
    },
    set delayMs(v: number) {
      state.delayMs = v;
    },
    get override() {
      return state.override;
    },
    set override(v: BodyOverride | undefined) {
      state.override = v;
    },
    setStatus(noteId, value) {
      const a = data.find((c) => c.noteId === noteId)?.attrs.find((x) => x.name === "status");
      if (a) a.value = value;
    },
    statusOf(noteId) {
      return data.find((c) => c.noteId === noteId)?.attrs.find((x) => x.name === "status")?.value;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const t of timers) clearTimeout(t);
        for (const s of sockets) s.destroy();
        server.close(() => {
          resolve();
        });
      }),
  };
  return fake;
}
