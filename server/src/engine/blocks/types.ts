// What every block receives and returns (ADR-0009: blocks do not know where the data comes from).
import type { Panel } from "../../../../contract/src/index.ts";
import type { DayParts } from "../dates.ts";
import type { Slot, Source } from "../config.ts";
import type { Raw } from "../html.ts";
import type { Metrics } from "../theme.ts";

export interface BlockContext {
  panel: Panel;
  metrics: Metrics;
  /** Size of the slot, and of its content (the slot minus the margin `M` on every side). */
  outerW: number;
  outerH: number;
  w: number;
  h: number;
  area: string;
  slot: Slot;
  source: Source;
  timeZone: string;
  today: DayParts;
  /** Public holidays already corrected: `dayKey` → name (F-013). */
  holidays: ReadonlyMap<string, string>;
  /** `sin datos desde HH:MM` when the source has not been read well for over 5 min. */
  stale?: string | undefined;
  /** Asks for a focus zone on a row; returns the opaque `data-zone` id, or undefined when none is given. */
  focus(itemId: string, act: "toggle" | "open", w: number, h: number): string | undefined;
}

export interface BlockResult {
  /** Markup positioned inside the content box (its origin is the content corner). */
  html: Raw;
  /** Items the block did not show. */
  hidden: number;
  tooSmall: boolean;
}

export type Block = (context: BlockContext) => BlockResult;
