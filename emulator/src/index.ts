// Public entry of the emulator (F-002).
export type {
  EmulatorConfig,
  EmulatorError,
  EmulatorErrorCode,
  Key,
  PressReport,
  RequestRecord,
  WakeReport,
} from "./types.ts";
export { defaultConfig } from "./config.ts";
export { runWake } from "./wake.ts";
export { press } from "./press.ts";
export { renderScreen } from "./screen.ts";
export { encodePng1 } from "./png.ts";
