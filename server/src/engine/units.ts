// Physical units to pixels (D5 of F-001): everything in the engine is sized in mm and pt.
export function mmToPx(mm: number, dpi: number): number {
  return Math.max(1, Math.round((mm * dpi) / 25.4));
}

export function ptToPx(pt: number, dpi: number): number {
  return Math.max(1, Math.round((pt * dpi) / 72));
}
