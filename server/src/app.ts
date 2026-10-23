// The Fastify app: the 5 routes of contract v1 over the demonstration views (F-003).
import { createHash } from "node:crypto";
import http from "node:http";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  crc32Hex,
  raw1Bytes,
  validateActionsRequest,
  validateDeviceHeaders,
  validateLogRequest,
  type ActionsResponse,
  type IndexResponse,
  type Panel,
  type ViewSummary,
  type Zone,
  type ZonesResponse,
} from "../../contract/src/index.ts";
import { logDevice, logRequest } from "./log.ts";
import { DemoState } from "./state.ts";
import { contentKey, makeViews, type DemoView } from "./views.ts";

export interface ServerConfig {
  nextWakeS: number;
  headersTimeoutMs: number;
}

type ErrorCode = "invalid_request" | "unknown_view" | "stale_view" | "too_large";

const BODY_LIMIT = 4096;
const MAX_HEADER_SIZE = 8192;
const MAX_TEXT_HEADER = 64;
const CACHE_LIMIT = 48;
const HASH_QUERY = /^[0-9a-f]{8,16}$/;

interface Rendered {
  image: Buffer;
  zones: Zone[];
  hash: string;
  crc32: string;
}

// The latest app's state, so demoViews() can show "the current state of the demonstration".
let latestState = new DemoState();
export const demoViews = (): DemoView[] => makeViews(latestState);

function sendError(reply: FastifyReply, status: number, code: ErrorCode, msg: string) {
  const body = { error: { code, msg } };
  return reply.code(status).type("application/json").send(JSON.stringify(body));
}

const header = (request: FastifyRequest, name: string): string | undefined => {
  // eslint-disable-next-line security/detect-object-injection -- name is a fixed literal from this module
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
};

export function createApp(config: ServerConfig): { app: FastifyInstance; renders(): number } {
  const state = new DemoState();
  latestState = state;
  const views = makeViews(state);
  const cache = new Map<string, Rendered>();
  let renderCount = 0;

  const app = Fastify({
    logger: false,
    bodyLimit: BODY_LIMIT,
    exposeHeadRoutes: false,
    serverFactory: (handler) => {
      const server = http.createServer(
        {
          maxHeaderSize: MAX_HEADER_SIZE,
          connectionsCheckingInterval: Math.max(50, Math.floor(config.headersTimeoutMs / 4)),
        },
        handler,
      );
      server.headersTimeout = config.headersTimeoutMs;
      return server;
    },
  });

  // Bodies are read as text (any content type) with the size cap enforced by Fastify while reading.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    "*",
    { parseAs: "string", bodyLimit: BODY_LIMIT },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    const code = (error as { code?: unknown }).code;
    const status = (error as { statusCode?: unknown }).statusCode;
    if (code === "FST_ERR_CTP_BODY_TOO_LARGE")
      return sendError(reply, 413, "too_large", "body too large");
    if (typeof status === "number" && status >= 400 && status < 500) {
      return sendError(reply, 400, "invalid_request", "invalid request");
    }
    return reply.code(500).send();
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send());

  app.addHook("onResponse", (request, reply, done) => {
    const length = Number(reply.getHeader("content-length"));
    const power = header(request, "tintero-power");
    logRequest({
      method: request.method,
      route: request.raw.url ?? "",
      status: reply.statusCode,
      bytes: Number.isFinite(length) ? length : 0,
      ms: reply.elapsedTime,
      firmware: header(request, "tintero-firmware") ?? null,
      power: power === "battery" || power === "usb" ? power : null,
    });
    done();
  });

  /** Validates the device headers; replies 400 and returns undefined when they fail. */
  function deviceOf(request: FastifyRequest, reply: FastifyReply): Panel | undefined {
    const raw: Record<string, string | undefined> = {};
    let ok = true;
    for (const [name, value] of Object.entries(request.headers)) {
      if (!name.startsWith("tintero-")) continue;
      // eslint-disable-next-line security/detect-object-injection -- name is a header key, raw is a plain local record read via Object.entries
      if (typeof value === "string") raw[name] = value;
      else ok = false; // repeated header
    }
    const result = ok ? validateDeviceHeaders(raw) : undefined;
    const small =
      (raw["tintero-firmware"]?.length ?? 0) <= MAX_TEXT_HEADER &&
      (raw["tintero-formats"]?.length ?? 0) <= MAX_TEXT_HEADER;
    if (result?.ok !== true || !small || !result.value.formats.includes("raw1")) {
      void sendError(reply, 400, "invalid_request", "invalid device headers");
      return undefined;
    }
    return result.value.panel;
  }

  function render(panel: Panel, view: DemoView): Rendered {
    const key = `${panel.w}x${panel.h}@${panel.dpi}|${view.id}|${contentKey(view.id, state)}`;
    const hit = cache.get(key);
    if (hit) return hit;
    renderCount++;
    const image = Buffer.from(view.raw1(panel));
    const zones = view.zones(panel);
    const hash = createHash("sha256")
      .update(image)
      .update(JSON.stringify(zones))
      .digest("hex")
      .slice(0, 16);
    const entry: Rendered = { image, zones, hash, crc32: crc32Hex(image) };
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, entry);
    return entry;
  }

  /** Looks up the view and checks `h`; replies the error itself when it cannot continue. */
  function viewOf(
    request: FastifyRequest,
    reply: FastifyReply,
    panel: Panel,
  ): { view: DemoView; rendered: Rendered } | undefined {
    const params = request.params as { id: string };
    const view = views.find((candidate) => candidate.id === params.id);
    if (!view) {
      void sendError(reply, 404, "unknown_view", "unknown view");
      return undefined;
    }
    const h = (request.query as Record<string, unknown>).h;
    if (typeof h !== "string" || !HASH_QUERY.test(h)) {
      void sendError(reply, 400, "invalid_request", "missing or invalid h");
      return undefined;
    }
    const rendered = render(panel, view);
    if (h !== rendered.hash) {
      void sendError(reply, 409, "stale_view", "stale view");
      return undefined;
    }
    return { view, rendered };
  }

  app.get("/api/v1/index", (request, reply) => {
    const panel = deviceOf(request, reply);
    if (!panel) return reply;
    const summaries: ViewSummary[] = views.map((view) => {
      const rendered = render(panel, view);
      return {
        id: view.id,
        hash: rendered.hash,
        format: "raw1",
        bytes: raw1Bytes(panel),
        crc32: rendered.crc32,
        ...(view.parent === undefined ? {} : { parent: view.parent }),
      };
    });
    const body: IndexResponse = {
      protocol: 1,
      server_time: Math.floor(Date.now() / 1000),
      next_wake_s: config.nextWakeS,
      full_refresh: false,
      panel,
      current: state.current,
      views: summaries,
    };
    return reply.type("application/json").send(JSON.stringify(body));
  });

  app.get("/api/v1/views/:id/image", (request, reply) => {
    const panel = deviceOf(request, reply);
    if (!panel) return reply;
    const found = viewOf(request, reply, panel);
    if (!found) return reply;
    const etag = `"${found.rendered.hash}"`;
    reply.header("etag", etag);
    if (header(request, "if-none-match") === etag) return reply.code(304).send();
    return reply.type("application/octet-stream").send(found.rendered.image);
  });

  app.get("/api/v1/views/:id/zones", (request, reply) => {
    const panel = deviceOf(request, reply);
    if (!panel) return reply;
    const found = viewOf(request, reply, panel);
    if (!found) return reply;
    const body: ZonesResponse = {
      view: found.view.id,
      hash: found.rendered.hash,
      zones: found.rendered.zones,
    };
    return reply.type("application/json").send(JSON.stringify(body));
  });

  app.post("/api/v1/actions", (request, reply) => {
    if (!deviceOf(request, reply)) return reply;
    const parsed = validateActionsRequest(typeof request.body === "string" ? request.body : "");
    if (!parsed.ok) return sendError(reply, 400, "invalid_request", "invalid actions");
    let changed = false;
    const results = parsed.value.actions.map((action) => {
      const outcome = state.apply(action);
      changed ||= outcome.changed;
      return { id: action.id, status: outcome.status };
    });
    const body: ActionsResponse = { results, index_changed: changed };
    return reply.type("application/json").send(JSON.stringify(body));
  });

  app.post("/api/v1/log", (request, reply) => {
    if (!deviceOf(request, reply)) return reply;
    const parsed = validateLogRequest(typeof request.body === "string" ? request.body : "");
    if (!parsed.ok) return sendError(reply, 400, "invalid_request", "invalid log");
    for (const entry of parsed.value.entries) logDevice(entry.level, entry.msg);
    return reply.code(204).send();
  });

  return { app, renders: () => renderCount };
}
