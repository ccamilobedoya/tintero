// Test double: a small server on 127.0.0.1 (ephemeral port) that follows the v1 contract.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { crc32Hex, type Action, type Panel } from "../../contract/src/index.ts";

export const PANEL: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const IMAGE_BYTES = 48_000;

export interface FakeView {
  raw1: Buffer;
  zones: { id: string; x: number; y: number; w: number; h: number; act: "toggle" | "open" }[];
  parent?: string;
}
export interface Seen {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** A raw1 image: all white except a 100-byte block of black that differs per `seed`. */
export function pattern(seed: number): Buffer {
  const raw = Buffer.alloc(IMAGE_BYTES);
  raw.fill(0xff, seed * 100, seed * 100 + 100);
  raw[0] = seed === 0 ? 0x80 : 0x00; // pixel (0,0) is black only in the first view
  return raw;
}

export class FakeServer {
  views = new Map<string, FakeView>();
  current = "todo";
  indexPanel: Panel = PANEL;
  indexOverride: string | undefined;
  tamper = new Set<string>();
  oversize = new Set<string>();
  staleLeft = 0;
  actionStatus: "applied" | "duplicate" = "applied";
  indexChanged = false;
  onAction: (actions: Action[]) => void = () => undefined;
  seen: Seen[] = [];
  connections = 0;
  maxConcurrent = 0;
  private active = 0;
  private readonly server: http.Server;
  url = "";

  constructor() {
    this.views.set("todo", {
      raw1: pattern(0),
      zones: [
        { id: "t1", x: 24, y: 72, w: 752, h: 40, act: "toggle" },
        { id: "t2", x: 24, y: 120, w: 752, h: 40, act: "toggle" },
        { id: "ev1", x: 24, y: 400, w: 360, h: 56, act: "open" },
      ],
    });
    this.views.set("agenda", {
      raw1: pattern(1),
      zones: [{ id: "a1", x: 24, y: 72, w: 400, h: 40, act: "open" }],
    });
    this.views.set("jira", { raw1: pattern(2), zones: [] });
    this.server = http.createServer((req, res) => {
      this.handle(req, res);
    });
    this.server.on("connection", () => {
      this.connections++;
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${String((this.server.address() as AddressInfo).port)}`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) =>
      this.server.close(() => {
        resolve();
      }),
    );
  }

  hash(id: string): string {
    const view = this.views.get(id);
    return view ? crc32Hex(view.raw1) : "00000000";
  }

  indexText(): string {
    const views = [...this.views].map(([id, view]) => ({
      id,
      hash: this.hash(id),
      format: "raw1",
      bytes: view.raw1.length,
      crc32: crc32Hex(view.raw1),
      ...(view.parent === undefined ? {} : { parent: view.parent }),
    }));
    return JSON.stringify({
      protocol: 1,
      server_time: 1_761_096_000,
      next_wake_s: 1800,
      full_refresh: false,
      panel: this.indexPanel,
      current: this.current,
      views,
    });
  }

  private send(res: http.ServerResponse, status: number, body: string | Buffer): void {
    const buffer = typeof body === "string" ? Buffer.from(body) : body;
    res.writeHead(status, { "Content-Length": buffer.length });
    res.end(buffer);
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.active++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.active);
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const path = req.url ?? "";
      this.seen.push({ method: req.method ?? "", path, headers: req.headers, body });
      // A small delay so overlapping requests would be visible.
      setTimeout(() => {
        this.route(req.method ?? "", path, body, res);
        this.active--;
      }, 2);
    });
  }

  private route(method: string, path: string, body: string, res: http.ServerResponse): void {
    const url = new URL(path, "http://x");
    const parts = url.pathname.split("/");
    if (method === "GET" && url.pathname === "/api/v1/index") {
      this.send(res, 200, this.indexOverride ?? this.indexText());
    } else if (method === "GET" && parts[3] === "views" && parts[5] === "image") {
      const view = this.views.get(parts[4] ?? "");
      if (this.staleLeft > 0) {
        this.staleLeft--;
        this.send(res, 409, '{"error":{"code":"stale_view","msg":"changed"}}');
      } else if (!view) {
        this.send(res, 404, '{"error":{"code":"unknown_view","msg":"no"}}');
      } else {
        let raw = Buffer.from(view.raw1);
        if (this.tamper.has(parts[4] ?? "")) raw[10] = (raw[10] ?? 0) ^ 0xff;
        if (this.oversize.has(parts[4] ?? "")) raw = Buffer.concat([raw, Buffer.alloc(10)]);
        this.send(res, 200, raw);
      }
    } else if (method === "GET" && parts[3] === "views" && parts[5] === "zones") {
      const id = parts[4] ?? "";
      const view = this.views.get(id);
      this.send(
        res,
        view ? 200 : 404,
        JSON.stringify({ view: id, hash: this.hash(id), zones: view?.zones ?? [] }),
      );
    } else if (method === "POST" && url.pathname === "/api/v1/actions") {
      const actions = (JSON.parse(body) as { actions: Action[] }).actions;
      this.onAction(actions);
      this.send(
        res,
        200,
        JSON.stringify({
          results: actions.map((action) => ({ id: action.id, status: this.actionStatus })),
          index_changed: this.indexChanged,
        }),
      );
    } else if (method === "POST" && url.pathname === "/api/v1/log") {
      this.send(res, 200, "{}");
    } else {
      this.send(res, 404, '{"error":{"code":"invalid_request","msg":"no"}}');
    }
  }
}
