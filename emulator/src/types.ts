// Public types of the emulator (F-002).
import type { Panel } from "../../contract/src/index.ts";

export interface EmulatorConfig {
  server: string; // base URL, http or https
  store: string; // folder that simulates the flash (outside the repo)
  panel: Panel;
  formats: ("raw1" | "png1")[];
  power: "battery" | "usb";
  batteryMv?: number;
  rssi?: number;
  firmware: string;
  extraViewsPerWake: number;
  flashBytes: number;
  timeoutMs: number;
  fallbackWakeS: number;
}

export interface RequestRecord {
  method: "GET" | "POST";
  path: string;
  status: number | "error";
  bytes: number;
}

export type EmulatorErrorCode =
  | "index_invalid"
  | "panel_mismatch"
  | "crc_mismatch"
  | "bad_image"
  | "zones_invalid"
  | "stale_view"
  | "flash_full"
  | "network"
  | "too_large";

export interface EmulatorError {
  code: EmulatorErrorCode;
  view?: string;
}

export interface WakeReport {
  requests: RequestRecord[];
  downloaded: string[];
  current: string | null;
  nextWakeS: number;
  errors: EmulatorError[];
  connections: number;
}

export type Key = "tab" | "long-tab" | "ok" | "long-ok";

export interface PressReport {
  key: Key;
  current: string | null;
  focus: string | null;
  requests: RequestRecord[];
  errors: EmulatorError[];
}
