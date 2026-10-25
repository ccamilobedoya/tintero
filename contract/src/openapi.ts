// OpenAPI 3.1 document of protocol v1, built from the same TypeBox schemas.
import { PROTOCOL_VERSION } from "./limits.ts";
import {
  ActionsRequestSchema,
  ActionsResponseSchema,
  ErrorBodySchema,
  IndexResponseSchema,
  LogRequestSchema,
  ZonesResponseSchema,
} from "./schemas.ts";

// TypeBox schemas carry internal symbol keys; a JSON round trip leaves plain JSON Schema.
const plain = (schema: object): object => JSON.parse(JSON.stringify(schema)) as object;
const ref = (name: string): object => ({ $ref: `#/components/schemas/${name}` });

const headerParam = (
  name: string,
  description: string,
  schema: object,
  required: boolean,
  example?: unknown,
): object => ({
  name,
  in: "header",
  required,
  description,
  schema,
  ...(example === undefined ? {} : { example }),
});

const deviceHeaders = [
  headerParam("Tintero-Protocol", "Protocol version.", { type: "string", enum: ["1"] }, true, "1"),
  headerParam(
    "Tintero-Firmware",
    "Firmware version text.",
    { type: "string", minLength: 1, maxLength: 32 },
    true,
    "0.1.0",
  ),
  headerParam(
    "Tintero-Power",
    "Power source.",
    { type: "string", enum: ["battery", "usb"] },
    true,
    "battery",
  ),
  headerParam(
    "Tintero-Battery-mV",
    "Battery voltage in millivolts.",
    { type: "integer", minimum: 2500, maximum: 4500 },
    false,
  ),
  headerParam(
    "Tintero-RSSI",
    "Wi-Fi signal in dBm.",
    { type: "integer", minimum: -120, maximum: 0 },
    false,
  ),
  headerParam(
    "Tintero-Formats",
    "Comma separated image formats the device accepts (raw1, png1).",
    { type: "string", pattern: "^(raw1|png1)(,(raw1|png1))*$" },
    true,
    "raw1",
  ),
  headerParam(
    "Tintero-Panel",
    "Panel the device declares: w=<width>,h=<height>,dpi=<ppp>,depth=<bits>.",
    { type: "string", pattern: "^w=\\d{1,4},h=\\d{1,4},dpi=\\d{1,3},depth=\\d$" },
    true,
    "w=800,h=480,dpi=124,depth=1",
  ),
  headerParam(
    "Tintero-View",
    "View the device is showing now (optional). The server draws it first and answers it as current.",
    { type: "string", pattern: "^[a-z0-9_-]{1,16}$" },
    false,
    "todo",
  ),
];

const viewId = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-z0-9_-]{1,16}$" },
  example: "todo",
};
const hashParam = {
  name: "h",
  in: "query",
  required: true,
  description: "Current hash of the view.",
  schema: { type: "string", pattern: "^[0-9a-f]{8,16}$" },
  example: "9f2c1a7b",
};

const indexExample = {
  protocol: 1,
  server_time: 1761096000,
  next_wake_s: 1800,
  full_refresh: false,
  panel: { w: 800, h: 480, dpi: 124, depth: 1 },
  current: "todo",
  views: [
    { id: "todo", hash: "9f2c1a7b", format: "raw1", bytes: 48000, crc32: "3a1f09c4" },
    { id: "agenda", hash: "41d0e2aa", format: "raw1", bytes: 48000, crc32: "b7e2d150" },
  ],
};
const zonesExample = {
  view: "todo",
  hash: "9f2c1a7b",
  zones: [
    { id: "t1", x: 24, y: 72, w: 752, h: 40, act: "toggle" },
    { id: "t2", x: 24, y: 120, w: 752, h: 40, act: "toggle" },
    { id: "ev1", x: 24, y: 400, w: 360, h: 56, act: "open" },
  ],
  focus: { ring: 3, pad: 6, dash: 8 },
};
const actionsRequestExample = {
  actions: [{ id: "a7f3c9e2b1", view: "todo", zone: "t2", act: "toggle", at: 1761096123 }],
};
const actionsResponseExample = {
  results: [{ id: "a7f3c9e2b1", status: "applied" }],
  index_changed: true,
};
const logExample = { entries: [{ at: 1761096200, level: "warn", msg: "wifi tardó 9 s" }] };

const json = (schemaName: string, example: unknown): object => ({
  "application/json": { schema: ref(schemaName), example },
});
const errorResponse = (description: string, code: string, extraHeaders?: object): object => ({
  description,
  ...(extraHeaders === undefined ? {} : { headers: extraHeaders }),
  content: json("ErrorBody", { error: { code, msg: description } }),
});
const retryAfter = {
  "Retry-After": { description: "Seconds to wait.", schema: { type: "integer", minimum: 0 } },
};
const notFoundAuth = {
  description: "Unknown route, or the device has no valid certificate (empty body).",
};
const common = {
  "400": errorResponse("invalid_request", "invalid_request"),
  "404": notFoundAuth,
  "413": errorResponse("too_large", "too_large"),
  "429": errorResponse("too_many", "too_many", retryAfter),
  "503": errorResponse("busy", "busy", retryAfter),
};

const viewResponses = {
  "404": errorResponse("unknown_view", "unknown_view"),
  "409": errorResponse("stale_view", "stale_view"),
};

export const openApiDocument: object = {
  openapi: "3.1.0",
  info: {
    title: "Tintero device API",
    version: `${PROTOCOL_VERSION}.0.0`,
    description:
      "Protocol v1 between e-ink devices and the Tintero server. Receivers ignore unknown fields. " +
      "Without a valid device certificate every route answers 404 with no body.",
  },
  servers: [{ url: "https://tintero.example" }],
  security: [{ deviceCertificate: [] }],
  paths: {
    "/api/v1/index": {
      get: {
        operationId: "getIndex",
        summary: "Index of views for the declared panel",
        description:
          "`full_refresh: true` means the next image the device shows uses the slow full refresh.",
        parameters: deviceHeaders,
        responses: {
          "200": {
            description: "Index",
            headers: {
              "Tintero-Protocol": { schema: { type: "string", enum: ["1"] } },
            },
            content: json("IndexResponse", indexExample),
          },
          ...common,
        },
      },
    },
    "/api/v1/views/{id}/image": {
      get: {
        operationId: "getViewImage",
        summary: "Image of a view (raw1 or png1)",
        parameters: [viewId, hashParam, ...deviceHeaders],
        responses: {
          "200": {
            description: "Image bytes; raw1 is ceil(w/8)*h bytes, 1 = black, MSB first.",
            headers: { ETag: { schema: { type: "string" }, example: '"9f2c1a7b"' } },
            content: {
              "image/png": { schema: { type: "string", format: "binary" } },
              "application/octet-stream": { schema: { type: "string", format: "binary" } },
            },
          },
          "304": { description: "Same hash as If-None-Match." },
          ...common,
          ...viewResponses,
        },
      },
    },
    "/api/v1/views/{id}/zones": {
      get: {
        operationId: "getViewZones",
        summary: "Touch zones of a view, in Tab order",
        description:
          "Zones are byte aligned: x and w are multiples of 8 (error unaligned). `focus` gives the ring " +
          "thickness, the blank band inside each zone (pad >= ring) and the dash length (0 = solid).",
        parameters: [viewId, hashParam, ...deviceHeaders],
        responses: {
          "200": { description: "Zones", content: json("ZonesResponse", zonesExample) },
          ...common,
          ...viewResponses,
        },
      },
    },
    "/api/v1/actions": {
      post: {
        operationId: "postActions",
        summary: "Send actions done by the device (idempotent by id)",
        parameters: deviceHeaders,
        requestBody: {
          required: true,
          content: json("ActionsRequest", actionsRequestExample),
        },
        responses: {
          "200": {
            description: "Result per action",
            content: json("ActionsResponse", actionsResponseExample),
          },
          ...common,
        },
      },
    },
    "/api/v1/log": {
      post: {
        operationId: "postLog",
        summary: "Send device log entries",
        parameters: deviceHeaders,
        requestBody: { required: true, content: json("LogRequest", logExample) },
        responses: { "204": { description: "Accepted" }, ...common },
      },
    },
  },
  components: {
    securitySchemes: {
      deviceCertificate: { type: "mutualTLS", description: "Per-device certificate (L1)." },
    },
    schemas: {
      IndexResponse: plain(IndexResponseSchema),
      ZonesResponse: plain(ZonesResponseSchema),
      ActionsRequest: plain(ActionsRequestSchema),
      ActionsResponse: plain(ActionsResponseSchema),
      LogRequest: plain(LogRequestSchema),
      ErrorBody: plain(ErrorBodySchema),
    },
  },
};
