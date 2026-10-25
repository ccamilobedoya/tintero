// TypeBox schemas of protocol v1. Types are derived from them (never written twice).
import Type from "typebox";
import { ACTION_ID_PATTERN, CRC_PATTERN, HASH_PATTERN, ID_PATTERN, LIMITS } from "./limits.ts";

const int = (min: number, max: number) => Type.Integer({ minimum: min, maximum: max });
const unixTime = () => Type.Integer({ minimum: 0 });

export const PanelSchema = Type.Object({
  w: int(LIMITS.panelMin, LIMITS.panelMax),
  h: int(LIMITS.panelMin, LIMITS.panelMax),
  dpi: int(LIMITS.dpiMin, LIMITS.dpiMax),
  depth: Type.Literal(1),
});

const ViewSummarySchema = Type.Object({
  id: Type.String({ pattern: ID_PATTERN }),
  hash: Type.String({ pattern: HASH_PATTERN }),
  format: Type.Union([Type.Literal("raw1"), Type.Literal("png1")]),
  bytes: int(1, LIMITS.maxImageBytes),
  crc32: Type.String({ pattern: CRC_PATTERN }),
  parent: Type.Optional(Type.String({ pattern: ID_PATTERN })),
});

export const IndexResponseSchema = Type.Object({
  protocol: Type.Literal(1),
  server_time: unixTime(),
  next_wake_s: int(LIMITS.minWakeS, LIMITS.maxWakeS),
  full_refresh: Type.Boolean(),
  panel: PanelSchema,
  current: Type.String({ pattern: ID_PATTERN }),
  views: Type.Array(ViewSummarySchema, { minItems: 1, maxItems: LIMITS.maxViews }),
});

const ZoneSchema = Type.Object({
  id: Type.String({ pattern: ID_PATTERN }),
  x: Type.Integer({ minimum: 0, maximum: LIMITS.panelMax }),
  y: Type.Integer({ minimum: 0, maximum: LIMITS.panelMax }),
  w: int(LIMITS.minZoneSize, LIMITS.panelMax),
  h: int(LIMITS.minZoneSize, LIMITS.panelMax),
  act: Type.Union([Type.Literal("toggle"), Type.Literal("open")]),
});

export const ZonesResponseSchema = Type.Object({
  view: Type.String({ pattern: ID_PATTERN }),
  hash: Type.String({ pattern: HASH_PATTERN }),
  zones: Type.Array(ZoneSchema, { minItems: 0, maxItems: LIMITS.maxZones }),
  focus: Type.Optional(
    Type.Object({
      ring: int(1, LIMITS.maxFocusRing),
      pad: int(1, LIMITS.maxFocusPad),
      dash: int(0, LIMITS.maxFocusDash),
    }),
  ),
});

const ActionSchema = Type.Object({
  id: Type.String({ pattern: ACTION_ID_PATTERN }),
  view: Type.String({ pattern: ID_PATTERN }),
  zone: Type.String({ pattern: ID_PATTERN }),
  act: Type.Union([Type.Literal("toggle"), Type.Literal("open")]),
  at: unixTime(),
});

export const ActionsRequestSchema = Type.Object({
  actions: Type.Array(ActionSchema, { minItems: 1, maxItems: LIMITS.maxActions }),
});

const ActionResultSchema = Type.Object({
  id: Type.String({ pattern: ACTION_ID_PATTERN }),
  status: Type.Union([Type.Literal("applied"), Type.Literal("duplicate"), Type.Literal("stale")]),
});

export const ActionsResponseSchema = Type.Object({
  results: Type.Array(ActionResultSchema, { minItems: 1, maxItems: LIMITS.maxActions }),
  index_changed: Type.Boolean(),
});

const LogEntrySchema = Type.Object({
  at: unixTime(),
  level: Type.Union([Type.Literal("error"), Type.Literal("warn"), Type.Literal("info")]),
  msg: Type.String({ minLength: 1, maxLength: LIMITS.maxLogMsg }),
});

export const LogRequestSchema = Type.Object({
  entries: Type.Array(LogEntrySchema, { minItems: 1, maxItems: LIMITS.maxLogEntries }),
});

const ERROR_CODES = [
  "invalid_request",
  "unknown_view",
  "stale_view",
  "stale_zone",
  "too_large",
  "too_many",
  "busy",
] as const;

export const ErrorBodySchema = Type.Object({
  error: Type.Object({
    code: Type.Union(ERROR_CODES.map((code) => Type.Literal(code))),
    msg: Type.String({ maxLength: LIMITS.maxLogMsg }),
  }),
});

// Parsed form of the headers the device sends (not a JSON body, so no JSON Schema file).
export const DeviceHeadersSchema = Type.Object({
  protocol: Type.Literal(1),
  firmware: Type.String({ minLength: 1, maxLength: 32 }),
  power: Type.Union([Type.Literal("battery"), Type.Literal("usb")]),
  batteryMv: Type.Optional(int(2500, 4500)),
  rssi: Type.Optional(int(-120, 0)),
  formats: Type.Array(Type.Union([Type.Literal("raw1"), Type.Literal("png1")]), { minItems: 1 }),
  panel: PanelSchema,
  view: Type.Optional(Type.String({ pattern: ID_PATTERN })),
});

export type Panel = Type.Static<typeof PanelSchema>;
export type ViewSummary = Type.Static<typeof ViewSummarySchema>;
export type IndexResponse = Type.Static<typeof IndexResponseSchema>;
export type Zone = Type.Static<typeof ZoneSchema>;
export type ZonesResponse = Type.Static<typeof ZonesResponseSchema>;
export type Action = Type.Static<typeof ActionSchema>;
export type ActionsRequest = Type.Static<typeof ActionsRequestSchema>;
export type ActionResult = Type.Static<typeof ActionResultSchema>;
export type ActionsResponse = Type.Static<typeof ActionsResponseSchema>;
export type LogEntry = Type.Static<typeof LogEntrySchema>;
export type LogRequest = Type.Static<typeof LogRequestSchema>;
export type ErrorBody = Type.Static<typeof ErrorBodySchema>;
export type DeviceHeaders = Type.Static<typeof DeviceHeadersSchema>;
