// Structured log (S6): one JSON line per request on stdout, never bodies, images or other headers.
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

export const clean = (text: string, max: number): string => text.replace(CONTROL, "").slice(0, max);

function write(entry: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export interface RequestLine {
  method: string;
  route: string;
  status: number;
  bytes: number;
  ms: number;
  firmware: string | null;
  power: "battery" | "usb" | null;
}

export function logRequest(line: RequestLine): void {
  write({
    ts: new Date().toISOString(),
    method: clean(line.method, 16),
    route: clean(line.route.split("?")[0] ?? "", 100),
    status: line.status,
    bytes: line.bytes,
    ms: Math.round(line.ms * 100) / 100,
    firmware: line.firmware === null ? null : clean(line.firmware, 64),
    power: line.power,
  });
}

export function logDevice(level: string, msg: string): void {
  write({ ts: new Date().toISOString(), device_log: { level, msg: clean(msg, 200) } });
}
