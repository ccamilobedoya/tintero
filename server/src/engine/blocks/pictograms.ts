// The six pictograms of the calendars (F-014, ADR-0053): 16 × 16 drawings, black, crisp edges.
import type { Icon } from "../config.ts";
import { raw, type Raw } from "../html.ts";

export const PICTOGRAMS: Record<Icon, string> = {
  persona: '<circle cx="8" cy="4" r="3.5"/><path d="M1 16V13C1 10 4 9 8 9S15 10 15 13V16Z"/>',
  maletin: '<path d="M5 1H11V5H9V3H7V5H5Z"/><rect x="0" y="5" width="16" height="10"/>',
  casa: '<polygon points="8,0 16,7.5 13.5,7.5 13.5,16 9.5,16 9.5,11 6.5,11 6.5,16 2.5,16 2.5,7.5 0,7.5"/>',
  pastel:
    '<rect x="1" y="9" width="14" height="7"/><rect x="7" y="4" width="2" height="5"/><polygon points="8,0 9.6,2.2 8,3.6 6.4,2.2"/>',
  corazon:
    '<path d="M8 15L1.5 8.5C-0.5 6.5 0.5 1.5 4.3 1.5C6 1.5 7.3 2.6 8 4C8.7 2.6 10 1.5 11.7 1.5C15.5 1.5 16.5 6.5 14.5 8.5Z"/>',
  estrella:
    '<polygon points="8,0 10,5.6 16,5.8 11.3,9.5 13,15.5 8,12 3,15.5 4.7,9.5 0,5.8 6,5.6"/>',
};

/** The pictogram as an inline `<svg>` of `px` × `px`; the drawings are fixed literals. */
export function pictogram(icon: Icon, px: number): Raw {
  const size = Math.max(1, Math.round(px));
  return raw(
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges" fill="#000" style="display:block">${PICTOGRAMS[icon]}</svg>`, // eslint-disable-line security/detect-object-injection -- icon is a typed union
  );
}
