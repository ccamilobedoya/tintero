// List of allowed devices (L1/L3, F-004): `<fingerprint> <id>` per line, reread when it changes.
import { statSync } from "node:fs";
import { logDevicesError } from "./log.ts";
import { readCapped } from "./tls.ts";

export const MAX_DEVICES_BYTES = 65_536;
const LINE = /^([0-9a-f]{64}) ([a-z0-9-]{1,32})$/;

class ListError extends Error {}

/** Parses the list; throws a ListError with a short reason when anything is invalid. */
export function parseDevices(text: string): Map<string, string> {
  const byFingerprint = new Map<string, string>();
  const ids = new Set<string>();
  for (const line of text.split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    const match = LINE.exec(line);
    if (!match) throw new ListError("invalid line");
    const [, print = "", id = ""] = match;
    if (byFingerprint.has(print) || ids.has(id)) throw new ListError("duplicate entry");
    byFingerprint.set(print, id);
    ids.add(id);
  }
  return byFingerprint;
}

export class DeviceList {
  private signature = "";
  private devices = new Map<string, string>();
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  /** The id of the device with this fingerprint, or undefined (also when the list is invalid). */
  lookup(print: string): string | undefined {
    this.refresh();
    return this.devices.get(print);
  }

  private refresh(): void {
    let signature: string;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the command line of the owner
      const stat = statSync(this.file);
      signature = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`;
    } catch {
      signature = "unreadable";
    }
    if (signature === this.signature) return;
    this.signature = signature;
    try {
      if (signature === "unreadable") throw new ListError("unreadable");
      this.devices = parseDevices(readCapped(this.file, MAX_DEVICES_BYTES).toString("utf8"));
    } catch (error) {
      this.devices = new Map(); // fail closed: nobody is listed
      // Only our own short reasons are logged (system errors carry paths).
      logDevicesError(error instanceof ListError ? error.message : "unreadable or too large");
    }
  }
}
