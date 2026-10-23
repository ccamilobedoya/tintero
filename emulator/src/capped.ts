// Capped file read of the emulator (its own piece: it does not import anything from `server/`).
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

/** Largest PEM file the emulator accepts (same cap as the server). */
export const MAX_PEM_BYTES = 65_536;

/** Reads a regular file of at most `max` bytes; throws when it is bigger or unreadable. */
export function readCapped(file: string, max: number): Buffer {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the command line of the owner
  const fd = openSync(file, "r");
  try {
    if (!fstatSync(fd).isFile()) throw new Error("not a regular file");
    const buffer = Buffer.alloc(max + 1);
    let total = 0;
    for (;;) {
      const n = readSync(fd, buffer, total, max + 1 - total, null);
      if (n === 0) break;
      total += n;
      if (total > max) throw new Error("file too large");
    }
    return buffer.subarray(0, total);
  } finally {
    closeSync(fd);
  }
}
