/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- las funciones nuevas de F-008 se leen de los módulos públicos por nombre (aún no existen al escribir las pruebas) */
import * as contractModule from "../../../contract/src/index.ts";
import * as emulatorModule from "../../../emulator/src/index.ts";
import type { Panel, Zone } from "../../../contract/src/index.ts";
import type { Engine, RenderedView } from "../../../server/src/engine/index.ts";

export * from "../F-006/helpers.ts";

export interface Focus {
  ring: number;
  pad: number;
  dash: number;
}

/** `RenderedView` as F-008 declares it. */
export type View8 = RenderedView & { bandInk: string[]; focus: Focus };

export interface Index8 {
  current: string;
  views: View8[];
  fullRefresh: boolean;
}

/** `engine.index(device, panel, { view })` with the F-008 signature. */
export async function index8(
  engine: Engine,
  device: string,
  panel: Panel,
  view?: string,
): Promise<Index8> {
  const loose = engine as unknown as {
    index: (d: string, p: Panel, o?: { view?: string }) => Promise<{ ok: boolean; value?: Index8 }>;
  };
  const r = await loose.index(device, panel, view === undefined ? undefined : { view });
  if (!r.ok || !r.value) throw new Error(`index failed: ${JSON.stringify(r)}`);
  return r.value;
}

export function view8(views: View8[], id: string): View8 {
  const v = views.find((x) => x.id === id);
  if (!v) throw new Error(`view ${id} missing`);
  return v;
}

const contract = contractModule as unknown as Record<string, unknown>;

export function checkFocusBand(
  raw1: Uint8Array,
  panel: Panel,
  zones: Zone[],
  pad: number,
): string[] {
  const fn = contract.checkFocusBand;
  if (typeof fn !== "function") throw new Error("checkFocusBand no está exportada por contract");
  return fn(raw1, panel, zones, pad);
}

export function limit(name: string): unknown {
  const limits = contract.LIMITS as Record<string, unknown>;
  return limits[name];
}

const emulator = emulatorModule as unknown as Record<string, unknown>;

/** `renderScreen(raw1, panel, focus?, ring = 3, dash = 0)` with the F-008 signature. */
export function renderScreen8(
  raw1: Uint8Array,
  panel: Panel,
  focus?: Zone,
  ring?: number,
  dash?: number,
): Uint8Array {
  const fn = emulator.renderScreen;
  if (typeof fn !== "function") throw new Error("renderScreen no está exportada por emulator");
  return fn(raw1, panel, focus, ring, dash);
}

/** Black pixels of the packed raw1 (1 = black) in column `x` over the rows of a zone. */
export function blackInColumn(raw1: Uint8Array, w: number, x: number, z: Zone): number {
  let n = 0;
  for (let y = z.y; y < z.y + z.h; y++) {
    const byte = raw1[y * Math.ceil(w / 8) + (x >> 3)] ?? 0;
    if ((byte & (0x80 >> (x & 7))) !== 0) n++;
  }
  return n;
}
