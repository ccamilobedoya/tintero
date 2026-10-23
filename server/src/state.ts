// In-memory state of the demonstration (D4): checkboxes, current view, actions already seen.
import type { Action } from "../../contract/src/index.ts";

const SEEN_LIMIT = 1000;
const BOXES = ["c1", "c2", "c3"];

export type ActionStatus = "applied" | "duplicate" | "stale";

export class DemoState {
  readonly checked: boolean[] = [false, false, false];
  current: "demo" | "detalle" = "demo";
  private readonly seen = new Set<string>();

  /** Applies one action once per id; reports whether the index changed. */
  apply(action: Action): { status: ActionStatus; changed: boolean } {
    if (this.seen.has(action.id)) return { status: "duplicate", changed: false };
    this.seen.add(action.id);
    if (this.seen.size > SEEN_LIMIT) {
      const oldest = this.seen.values().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
    if (action.view !== "demo") return { status: "stale", changed: false };
    const box = BOXES.indexOf(action.zone);
    if (action.act === "toggle" && box >= 0) {
      // eslint-disable-next-line security/detect-object-injection -- box comes from indexOf over a fixed list and is checked >= 0
      this.checked[box] = this.checked[box] !== true;
      return { status: "applied", changed: true };
    }
    if (action.act === "open" && action.zone === "abrir") {
      const changed = this.current !== "detalle";
      this.current = "detalle";
      return { status: "applied", changed };
    }
    return { status: "stale", changed: false };
  }
}
