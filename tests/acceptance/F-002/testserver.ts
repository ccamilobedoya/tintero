// Test server for F-002: a contract-compliant Tintero server on 127.0.0.1 (ephemeral port).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32Hex, raw1Bytes, type Panel, type Zone } from "../../../contract/src/index.ts";

export const PANEL: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
export const ROW = 100; // bytes per row (800 px)
export const IMG_BYTES = 48000;

export interface Logged {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface ViewDef {
  id: string;
  seed: number;
  hash: string;
  image: Buffer;
  zones: Zone[];
  parent?: string;
}

/** Deterministic image with a known pattern; (5,5) is always black and (5,300) always white. */
export function makeImage(seed: number): Buffer {
  const buf = Buffer.alloc(IMG_BYTES);
  for (let i = 0; i < IMG_BYTES; i++)
    buf[i] = (i * (seed * 2 + 3) + seed * 31 + ((i >> 5) ^ seed)) & 0xff;
  setPixel(buf, 5, 5, true);
  setPixel(buf, 5, 300, false);
  return buf;
}

export function pixel(img: Uint8Array, x: number, y: number): boolean {
  return (((img[y * ROW + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1) === 1;
}

export function setPixel(img: Uint8Array, x: number, y: number, black: boolean): void {
  const i = y * ROW + (x >> 3);
  const mask = 1 << (7 - (x & 7));
  img[i] = black ? (img[i] ?? 0) | mask : (img[i] ?? 0) & ~mask;
}

const Z = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  act: "toggle" | "open",
): Zone => ({
  id,
  x,
  y,
  w,
  h,
  act,
});

export function baseViews(): ViewDef[] {
  return [
    {
      id: "todo",
      seed: 1,
      hash: "9f2c1a7b",
      image: makeImage(1),
      zones: [
        Z("t1", 24, 72, 752, 40, "toggle"),
        Z("t2", 24, 120, 752, 40, "toggle"),
        Z("ev1", 24, 400, 360, 56, "open"),
      ],
    },
    {
      id: "agenda",
      seed: 2,
      hash: "41d0e2aa",
      image: makeImage(2),
      zones: [Z("a1", 24, 72, 400, 40, "open")],
    },
    { id: "jira", seed: 3, hash: "77aa00ff", image: makeImage(3), zones: [] },
  ];
}

export class TestServer {
  views: ViewDef[] = baseViews();
  current = "todo";
  nextWakeS = 1800;
  indexPanel: Panel = { ...PANEL };
  log: Logged[] = [];
  connections = 0;
  maxConcurrent = 0;
  private inflight = 0;
  // knobs
  corruptImages = new Set<string>(); // serve the image with one byte changed (crc stays)
  extraImageBytes = new Map<string, number>(); // append bytes beyond the declared size
  stale409 = 0; // number of image requests to answer 409 stale_view (Infinity = always)
  indexPadding = 0; // extra bytes in the index body
  actionStatus: "applied" | "duplicate" | "stale" = "applied";
  indexChanged = false;
  openGoesToDetail = false;
  delayMs = 5;
  private readonly sockets = new Set<Socket>();
  private server: Server | undefined;
  private port = 0;

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  resetCounters(): void {
    this.log = [];
    this.connections = 0;
    this.maxConcurrent = 0;
  }

  async start(): Promise<void> {
    const server = createServer((req, res) => {
      this.inflight++;
      this.maxConcurrent = Math.max(this.maxConcurrent, this.inflight);
      res.on("close", () => {
        this.inflight--;
      });
      void this.handle(req, res);
    });
    server.on("connection", (socket) => {
      this.connections++;
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
    });
    this.server = server;
    await new Promise<void>((resolve) => server.listen(this.port, "127.0.0.1", resolve));
    this.port = (server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }

  bump(id: string, hash: string): void {
    const v = this.views.find((x) => x.id === id);
    if (!v) throw new Error("no view " + id);
    v.seed += 100;
    v.image = makeImage(v.seed);
    v.hash = hash;
  }

  indexJson(): string {
    const views = this.views.map((v) => ({
      id: v.id,
      hash: v.hash,
      format: "raw1",
      bytes: this.indexPanel.w === PANEL.w ? IMG_BYTES : raw1Bytes(this.indexPanel),
      crc32: crc32Hex(v.image),
      ...(v.parent !== undefined ? { parent: v.parent } : {}),
    }));
    const doc: { pad?: string; [k: string]: unknown } = {
      protocol: 1,
      server_time: 1761096000,
      next_wake_s: this.nextWakeS,
      full_refresh: false,
      panel: this.indexPanel,
      current: this.current,
      views,
    };
    if (this.indexPadding > 0) doc.pad = "x".repeat(this.indexPadding);
    return JSON.stringify(doc);
  }

  /** Total of views/* + queue.json would be measured on the store; this is only the server side. */
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    const url = req.url ?? "";
    this.log.push({ method: req.method ?? "", path: url, headers: req.headers, body });
    await new Promise((r) => setTimeout(r, this.delayMs));
    const send = (status: number, data: Buffer | string, type = "application/json"): void => {
      res.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(data) });
      res.end(data);
    };
    const path = url.split("?")[0] ?? "";
    if (req.method === "GET" && path === "/api/v1/index") {
      send(200, this.indexJson());
      return;
    }
    const m = /^\/api\/v1\/views\/([a-z0-9_-]+)\/(image|zones)$/.exec(path);
    if (req.method === "GET" && m) {
      const view = this.views.find((v) => v.id === m[1]);
      if (!view) {
        send(404, JSON.stringify({ error: { code: "unknown_view", msg: "no" } }));
        return;
      }
      if (m[2] === "image") {
        if (this.stale409 > 0) {
          this.stale409--;
          send(409, JSON.stringify({ error: { code: "stale_view", msg: "old hash" } }));
          return;
        }
        let img = Buffer.from(view.image);
        if (this.corruptImages.has(view.id)) img[100] = (img[100] ?? 0) ^ 0xff;
        const extra = this.extraImageBytes.get(view.id);
        if (extra) img = Buffer.concat([img, Buffer.alloc(extra, 0x55)]);
        send(200, img, "application/octet-stream");
        return;
      }
      send(200, JSON.stringify({ view: view.id, hash: view.hash, zones: view.zones }));
      return;
    }
    if (req.method === "POST" && path === "/api/v1/actions") {
      const parsed = JSON.parse(body) as {
        actions: { id: string; view: string; zone: string; act: string }[];
      };
      const results = parsed.actions.map((a) => ({ id: a.id, status: this.actionStatus }));
      let changed = this.indexChanged;
      if (this.openGoesToDetail && parsed.actions.some((a) => a.act === "open")) {
        if (!this.views.some((v) => v.id === "detalle")) {
          this.views.push({
            id: "detalle",
            seed: 9,
            hash: "d3ad0001",
            image: makeImage(9),
            zones: [],
            parent: "todo",
          });
        }
        this.current = "detalle";
        changed = true;
      }
      send(200, JSON.stringify({ results, index_changed: changed }));
      return;
    }
    if (req.method === "POST" && path === "/api/v1/log") {
      send(200, "{}");
      return;
    }
    send(404, JSON.stringify({ error: { code: "invalid_request", msg: "no" } }));
  }
}

// --- helpers ---------------------------------------------------------------------------------------

export function tmpStore(): string {
  return mkdtempSync(join(tmpdir(), "tintero-f002-"));
}

export function rmStore(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function readStoreFile(store: string, name: string): Buffer {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
  return readFileSync(join(store, name));
}

export function storeHas(store: string, name: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
  return existsSync(join(store, name));
}

export function storeJson(store: string, name: string): unknown {
  return JSON.parse(readStoreFile(store, name).toString("utf8"));
}

function sizeOf(file: string): number {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
    return statSync(file).size;
  } catch {
    return 0; // renamed or removed while measuring
  }
}

/** Sum of views/* + queue.json. */
export function flashUsed(store: string): number {
  let total = 0;
  const dir = join(store, "views");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
  if (existsSync(dir)) for (const f of readdirSync(dir)) total += sizeOf(join(dir, f));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
  if (existsSync(join(store, "queue.json"))) total += sizeOf(join(store, "queue.json"));
  return total;
}

export function viewFiles(store: string, id: string): string[] {
  return ["raw1", "zones.json", "meta.json"].filter((ext) => storeHas(store, `views/${id}.${ext}`));
}

export function reqLine(l: Logged): string {
  return `${l.method} ${l.path.split("?")[0]}`;
}

/** Expected raw1 with the 3 px focus frame inverted inside the zone rectangle. */
export function withFocus(img: Uint8Array, z: Zone): Uint8Array {
  const out = Uint8Array.from(img);
  for (let y = z.y; y < z.y + z.h; y++) {
    for (let x = z.x; x < z.x + z.w; x++) {
      const edge = Math.min(x - z.x, z.x + z.w - 1 - x, y - z.y, z.y + z.h - 1 - y);
      if (edge < 3) setPixel(out, x, y, !pixel(img, x, y));
    }
  }
  return out;
}
