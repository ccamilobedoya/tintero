// Minimal raw1 drawing (R2): MSB first, 1 = black, rows padded to the byte (contract F-001).
import { raw1Bytes, type Panel } from "../../contract/src/index.ts";

export class Canvas {
  readonly w: number;
  readonly h: number;
  private readonly stride: number;
  private readonly data: Uint8Array;

  constructor(panel: Panel) {
    this.w = panel.w;
    this.h = panel.h;
    this.stride = Math.ceil(panel.w / 8);
    this.data = new Uint8Array(raw1Bytes(panel));
  }

  /** Paints a rectangle black, clipped to the canvas. */
  fillRect(x: number, y: number, w: number, h: number): void {
    const x1 = Math.min(this.w, x + w);
    const y1 = Math.min(this.h, y + h);
    for (let py = Math.max(0, y); py < y1; py++) {
      for (let px = Math.max(0, x); px < x1; px++) {
        const index = py * this.stride + (px >> 3);
        // eslint-disable-next-line security/detect-object-injection -- index is numeric and bounded by the clamped loop limits
        this.data[index] = (this.data[index] ?? 0) | (0x80 >> (px & 7));
      }
    }
  }

  /** Border of `t` px drawn inside the rectangle. */
  strokeRect(x: number, y: number, w: number, h: number, t: number): void {
    this.fillRect(x, y, w, t);
    this.fillRect(x, y + h - t, w, t);
    this.fillRect(x, y, t, h);
    this.fillRect(x + w - t, y, t, h);
  }

  vline(x: number): void {
    this.fillRect(x, 0, 1, this.h);
  }

  hline(y: number): void {
    this.fillRect(0, y, this.w, 1);
  }

  bytes(): Uint8Array {
    return this.data;
  }
}
