// Limits of protocol v1 (F-001). Values come straight from the ficha.
export const PROTOCOL_VERSION = 1;

export const LIMITS = {
  panelMin: 8,
  panelMax: 2048,
  dpiMin: 50,
  dpiMax: 400,
  maxIndexBytes: 2048,
  maxZonesBytes: 4096,
  maxViews: 16,
  maxZones: 48,
  minZoneSize: 8,
  maxImageBytes: 1_048_576,
  minWakeS: 30,
  maxWakeS: 86_400,
  maxActions: 8,
  maxLogEntries: 10,
  maxLogMsg: 200,
} as const;

export const ID_PATTERN = "^[a-z0-9_-]{1,16}$";
export const ACTION_ID_PATTERN = "^[a-z0-9_-]{8,24}$";
export const HASH_PATTERN = "^[0-9a-f]{8,16}$";
export const CRC_PATTERN = "^[0-9a-f]{8}$";
