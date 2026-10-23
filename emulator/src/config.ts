import type { EmulatorConfig } from "./types.ts";

export function defaultConfig(server: string, store: string): EmulatorConfig {
  return {
    server,
    store,
    panel: { w: 800, h: 480, dpi: 124, depth: 1 },
    formats: ["raw1"],
    power: "battery",
    firmware: "emulator-0.1.0",
    extraViewsPerWake: 2,
    flashBytes: 1_468_006,
    timeoutMs: 10_000,
    fallbackWakeS: 300,
  };
}
