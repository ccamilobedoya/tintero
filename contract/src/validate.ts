// Validators: schema check (TypeBox Value, no compiler) plus the rules a schema cannot express.
// They never log what they receive (S6).
import { crc32 } from "node:zlib";
import type { TSchema } from "typebox";
import Value from "typebox/value";
import { LIMITS } from "./limits.ts";
import {
  ActionsRequestSchema,
  ActionsResponseSchema,
  DeviceHeadersSchema,
  ErrorBodySchema,
  IndexResponseSchema,
  LogRequestSchema,
  PanelSchema,
  ZonesResponseSchema,
  type ActionsRequest,
  type ActionsResponse,
  type DeviceHeaders,
  type ErrorBody,
  type IndexResponse,
  type LogRequest,
  type Panel,
  type ZonesResponse,
} from "./schemas.ts";

export type ContractErrorCode =
  | "invalid_json"
  | "schema"
  | "too_large"
  | "duplicate_id"
  | "unknown_current"
  | "out_of_panel"
  | "raw1_size"
  | "bad_image"
  | "crc_mismatch";
export interface ContractError {
  path: string;
  code: ContractErrorCode;
}
export type Validation<T> = { ok: true; value: T } | { ok: false; errors: ContractError[] };

const fail = (...errors: ContractError[]): { ok: false; errors: ContractError[] } => ({
  ok: false,
  errors,
});

function dedupe(errors: ContractError[]): ContractError[] {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.code}|${error.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Parses JSON text, checks the schema, strips unknown fields and runs the extra rules. */
function validateBody<T>(
  raw: string,
  schema: TSchema,
  maxBytes: number | undefined,
  extra: (value: T) => ContractError[],
): Validation<T> {
  // Size is checked before parsing so an oversized body is never parsed.
  if (maxBytes !== undefined && Buffer.byteLength(raw, "utf8") > maxBytes) {
    return fail({ path: "", code: "too_large" });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail({ path: "", code: "invalid_json" });
  }
  const errors: ContractError[] = [];
  if (!Value.Check(schema, parsed)) {
    for (const issue of Value.Errors(schema, parsed)) {
      errors.push({ path: issue.instancePath, code: "schema" });
    }
    if (!errors.some((error) => error.code === "schema")) errors.push({ path: "", code: "schema" });
    return fail(...dedupe(errors));
  }
  // Unknown fields are accepted on input but not exposed in the result (I5).
  const value = Value.Clean(schema, parsed) as T;
  errors.push(...extra(value));
  return errors.length > 0 ? fail(...dedupe(errors)) : { ok: true, value };
}

export function raw1Bytes(panel: Panel): number {
  return Math.ceil(panel.w / 8) * panel.h;
}

function duplicates(ids: string[], base: string): ContractError[] {
  const seen = new Set<string>();
  const errors: ContractError[] = [];
  ids.forEach((id, index) => {
    if (seen.has(id)) errors.push({ path: `${base}/${index}/id`, code: "duplicate_id" });
    seen.add(id);
  });
  return errors;
}

export function validateIndex(raw: string): Validation<IndexResponse> {
  return validateBody<IndexResponse>(raw, IndexResponseSchema, LIMITS.maxIndexBytes, (index) => {
    const errors = duplicates(
      index.views.map((view) => view.id),
      "/views",
    );
    if (!index.views.some((view) => view.id === index.current)) {
      errors.push({ path: "/current", code: "unknown_current" });
    }
    const expected = raw1Bytes(index.panel);
    index.views.forEach((view, i) => {
      if (view.format === "raw1" && view.bytes !== expected) {
        errors.push({ path: `/views/${i}/bytes`, code: "raw1_size" });
      }
    });
    return errors;
  });
}

export function validateZones(raw: string, panel: Panel): Validation<ZonesResponse> {
  return validateBody<ZonesResponse>(raw, ZonesResponseSchema, LIMITS.maxZonesBytes, (body) => {
    const errors = duplicates(
      body.zones.map((zone) => zone.id),
      "/zones",
    );
    body.zones.forEach((zone, i) => {
      if (zone.x + zone.w > panel.w || zone.y + zone.h > panel.h) {
        errors.push({ path: `/zones/${i}`, code: "out_of_panel" });
      }
    });
    return errors;
  });
}

export function validateActionsRequest(raw: string): Validation<ActionsRequest> {
  return validateBody<ActionsRequest>(raw, ActionsRequestSchema, undefined, () => []);
}

export function validateActionsResponse(raw: string): Validation<ActionsResponse> {
  return validateBody<ActionsResponse>(raw, ActionsResponseSchema, undefined, () => []);
}

export function validateLogRequest(raw: string): Validation<LogRequest> {
  return validateBody<LogRequest>(raw, LogRequestSchema, undefined, () => []);
}

export function validateErrorBody(raw: string): Validation<ErrorBody> {
  return validateBody<ErrorBody>(raw, ErrorBodySchema, undefined, () => []);
}

// --- Panel header -------------------------------------------------------------------------------

const PANEL_HEADER = /^w=(\d{1,4}),h=(\d{1,4}),dpi=(\d{1,3}),depth=(\d)$/;

export function parsePanelHeader(value: string): Validation<Panel> {
  const match = PANEL_HEADER.exec(value);
  if (!match) return fail({ path: "", code: "schema" });
  const panel = {
    w: Number(match[1]),
    h: Number(match[2]),
    dpi: Number(match[3]),
    depth: Number(match[4]),
  };
  if (!Value.Check(PanelSchema, panel)) return fail({ path: "", code: "schema" });
  return { ok: true, value: Value.Clean(PanelSchema, panel) as Panel };
}

export function formatPanelHeader(panel: Panel): string {
  return `w=${panel.w},h=${panel.h},dpi=${panel.dpi},depth=${panel.depth}`;
}

// --- Device headers -----------------------------------------------------------------------------

export function validateDeviceHeaders(
  headers: Record<string, string | undefined>,
): Validation<DeviceHeaders> {
  const lower = new Map<string, string>();
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) lower.set(name.toLowerCase(), value.trim());
  }
  const errors: ContractError[] = [];
  const bad = (name: string): void => {
    errors.push({ path: `/${name}`, code: "schema" });
  };
  const get = (name: string): string | undefined => {
    const value = lower.get(name.toLowerCase());
    if (value === undefined) bad(name);
    return value;
  };

  const protocol = get("Tintero-Protocol");
  const firmware = get("Tintero-Firmware");
  const power = get("Tintero-Power");
  const formatsRaw = get("Tintero-Formats");
  const panelRaw = get("Tintero-Panel");

  const candidate: Record<string, unknown> = {
    protocol: protocol === "1" ? 1 : undefined,
    firmware,
    power,
    formats: formatsRaw?.split(",").map((item) => item.trim()),
  };
  const optionalInt = (name: string, pattern: RegExp): number | undefined => {
    const value = lower.get(name.toLowerCase());
    if (value === undefined) return undefined;
    if (pattern.test(value)) return Number(value);
    bad(name);
    return undefined;
  };
  const batteryMv = optionalInt("Tintero-Battery-mV", /^\d{1,5}$/);
  const rssi = optionalInt("Tintero-RSSI", /^-?\d{1,4}$/);
  if (batteryMv !== undefined) candidate.batteryMv = batteryMv;
  if (rssi !== undefined) candidate.rssi = rssi;

  if (panelRaw !== undefined) {
    const panel = parsePanelHeader(panelRaw);
    if (panel.ok) candidate.panel = panel.value;
    else bad("Tintero-Panel");
  }

  if (!Value.Check(DeviceHeadersSchema, candidate)) {
    // Map schema failures back to header names; anything unmapped is reported on the whole set.
    const names = new Map([
      ["protocol", "Tintero-Protocol"],
      ["firmware", "Tintero-Firmware"],
      ["power", "Tintero-Power"],
      ["batteryMv", "Tintero-Battery-mV"],
      ["rssi", "Tintero-RSSI"],
      ["formats", "Tintero-Formats"],
      ["panel", "Tintero-Panel"],
    ]);
    for (const issue of Value.Errors(DeviceHeadersSchema, candidate)) {
      const name = names.get(issue.instancePath.split("/")[1] ?? "");
      if (name !== undefined) bad(name);
    }
    if (errors.length === 0) errors.push({ path: "", code: "schema" });
    return fail(...dedupe(errors));
  }
  if (errors.length > 0) return fail(...dedupe(errors));
  return { ok: true, value: Value.Clean(DeviceHeadersSchema, candidate) as DeviceHeaders };
}

// --- CRC and images -----------------------------------------------------------------------------

export function crc32Hex(bytes: Uint8Array): string {
  return crc32(bytes).toString(16).padStart(8, "0");
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngProblem(bytes: Uint8Array, panel: Panel): boolean {
  if (bytes.length < 29) return true;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!PNG_SIGNATURE.every((byte, i) => view.getUint8(i) === byte)) return true;
  const isIhdr = view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452;
  if (!isIhdr) return true;
  return (
    view.getUint32(16) !== panel.w ||
    view.getUint32(20) !== panel.h ||
    view.getUint8(24) !== 1 || // bit depth
    view.getUint8(25) !== 0 || // grayscale
    view.getUint8(28) !== 0 // no interlace
  );
}

export function checkImage(
  format: "png1" | "raw1",
  bytes: Uint8Array,
  panel: Panel,
  crc?: string,
): Validation<Uint8Array> {
  const errors: ContractError[] = [];
  if (bytes.length > LIMITS.maxImageBytes) {
    errors.push({ path: "", code: "too_large" });
  } else if (format === "raw1" ? bytes.length !== raw1Bytes(panel) : pngProblem(bytes, panel)) {
    errors.push({ path: "", code: "bad_image" });
  }
  if (crc !== undefined && crc !== crc32Hex(bytes)) {
    errors.push({ path: "", code: "crc_mismatch" });
  }
  return errors.length > 0 ? fail(...errors) : { ok: true, value: bytes };
}
