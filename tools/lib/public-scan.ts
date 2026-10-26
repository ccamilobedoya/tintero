// Publication guard (F-018, R7): what a public repo must never carry, found without a private list.
// Looks for personal paths, e-mail addresses, tailnet names, IPv4 addresses, private keys,
// high-entropy strings and image metadata, in the working tree or in every blob of the history.
// Reports file, line and kind only — never the value found.
// Exceptions: tools/public-scan-allow.txt, one "<file glob> <kind>  # reason" per line.
// CLI: --tree | --history   [--json <out>]   · exit 0 clean, 1 findings (or a read error), 2 usage.
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { matchesAny } from "./glob.ts";

export const KINDS = [
  "home-path",
  "email",
  "ts-net",
  "ipv4",
  "private-key",
  "entropy",
  "metadata",
  "unreadable",
] as const;
export type Kind = (typeof KINDS)[number];

export interface ScanHit {
  file: string;
  line: number;
  kind: Kind;
}

export interface BinaryEntry {
  file: string;
  type: string;
  bytes: number;
}

export interface AllowRule {
  glob: string;
  /** A public-scan kind, or `trufflehog:<Detector>` for the second detector (D11). */
  kind: string;
}

const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_LINE_CHARS = 20_000;
const SKIP = [/^node_modules(\/|$)/, /(^|\/)package-lock\.json$/];

const HOME = /\/home\/[a-z_][a-z0-9_-]*\/|\b[A-Za-z]:\\{1,2}Users\\{1,2}[A-Za-z0-9._-]+/;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const SAFE_EMAIL_DOMAIN = /(^|\.)(example\.(com|org|net)|example|invalid|test)$/i;
const TS_NET = /\b([a-z0-9][a-z0-9.-]*\.)ts\.net\b/gi;
const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![.\d])/g;
const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const TOKEN = /[A-Za-z0-9+_-]{32,}={0,2}/g;

/** Test addresses that may appear: loopback, documentation ranges and the existing fixtures. */
function allowedIpv4(octets: readonly number[]): boolean {
  const [a, b, c, d] = octets as [number, number, number, number];
  if (a === 127) return true;
  if (a === 0 && b === 0 && c === 0 && d === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a === 192 && b === 168 && c === 1 && d === 10) return true;
  return a === 10 && b === 0 && c === 0 && d === 1;
}

export function entropy(text: string): number {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

function secretLike(token: string): boolean {
  return /[A-Z]/.test(token) && /[a-z]/.test(token) && /\d/.test(token) && entropy(token) >= 4.0;
}

function lineKinds(line: string): Kind[] {
  const kinds = new Set<Kind>();
  if (HOME.test(line)) kinds.add("home-path");
  for (const match of line.matchAll(EMAIL)) {
    const domain = match[1] ?? "";
    const local = match[0].slice(0, match[0].length - domain.length - 1);
    if (!SAFE_EMAIL_DOMAIN.test(domain) && !/noreply/i.test(local) && !/noreply/i.test(domain))
      kinds.add("email");
  }
  for (const match of line.matchAll(TS_NET)) {
    if (!/(^|\.)(example|ejemplo)\./i.test(match[1] ?? "")) kinds.add("ts-net");
  }
  for (const match of line.matchAll(IPV4)) {
    const octets = match.slice(1, 5).map(Number);
    if (octets.every((octet) => octet <= 255) && !allowedIpv4(octets)) kinds.add("ipv4");
  }
  if (PRIVATE_KEY.test(line)) kinds.add("private-key");
  for (const match of line.matchAll(TOKEN)) if (secretLike(match[0])) kinds.add("entropy");
  return [...kinds];
}

/** Findings in a text file, 1-based lines. */
export function scanText(text: string): { line: number; kind: Kind }[] {
  const hits: { line: number; kind: Kind }[] = [];
  text.split("\n").forEach((line, index) => {
    for (const kind of lineKinds(line.slice(0, MAX_LINE_CHARS)))
      hits.push({ line: index + 1, kind });
  });
  return hits;
}

export function isBinary(data: Buffer): boolean {
  return data.subarray(0, 8000).includes(0);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_METADATA = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);

/** Metadata chunks or segments of a PNG or JPEG; `undefined` when it is neither. */
export function imageMetadata(data: Buffer): string[] | undefined {
  if (data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    const found: string[] = [];
    let at = 8;
    while (at + 8 <= data.length) {
      const length = data.readUInt32BE(at);
      const type = data.toString("latin1", at + 4, at + 8);
      if (PNG_METADATA.has(type)) found.push(type);
      if (type === "IEND") break;
      at += 12 + length;
    }
    return found;
  }
  if (data[0] === 0xff && data[1] === 0xd8) {
    const found: string[] = [];
    let at = 2;
    while (at + 4 <= data.length && data.readUInt8(at) === 0xff) {
      const marker = data.readUInt8(at + 1);
      if (marker === 0xda || marker === 0xd9) break; // image data starts
      const length = data.readUInt16BE(at + 2);
      if (marker === 0xe1) found.push("APP1 (EXIF/XMP)");
      if (marker === 0xed) found.push("APP13 (IPTC)");
      if (marker === 0xfe) found.push("COM");
      at += 2 + length;
    }
    return found;
  }
  return undefined;
}

function fileType(data: Buffer): string {
  if (data.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (data[0] === 0xff && data[1] === 0xd8) return "jpeg";
  return "binary";
}

export function parseAllow(text: string): AllowRule[] {
  const rules: AllowRule[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const [glob, kind, extra] = line.split(/\s+/);
    const known = KINDS.includes(kind as Kind) || /^trufflehog:[A-Za-z0-9]+$/.test(kind ?? "");
    if (glob === undefined || kind === undefined || extra !== undefined || !known)
      throw new Error(`public-scan-allow: línea inválida: ${raw.trim()}`);
    rules.push({ glob, kind });
  }
  return rules;
}

export function allowed(hit: { file: string; kind: string }, rules: readonly AllowRule[]): boolean {
  return rules.some(
    (rule) =>
      rule.kind === hit.kind && matchesAny(hit.file.replace(/ \(historia\)$/, ""), [rule.glob]),
  );
}

/** Findings for one file's bytes. */
export function scanBlob(file: string, data: Buffer, binaries: BinaryEntry[]): ScanHit[] {
  if (isBinary(data)) {
    binaries.push({ file, type: fileType(data), bytes: data.length });
    const meta = imageMetadata(data);
    return meta !== undefined && meta.length > 0 ? [{ file, line: 0, kind: "metadata" }] : [];
  }
  return scanText(data.toString("utf8")).map((hit) => ({ file, ...hit }));
}

function git(args: readonly string[], input?: string): Buffer {
  return execFileSync("git", args, { maxBuffer: 1024 * 1024 * 1024, input });
}

function scanTree(binaries: BinaryEntry[]): ScanHit[] {
  const files = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .toString("utf8")
    .split("\0")
    .filter((file) => file !== "" && !SKIP.some((pattern) => pattern.test(file)));
  return files.flatMap((file) => {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- files listed by git in this repo
      const info = lstatSync(file);
      // A link is published as its target path: scan that text, never what it points to.
      if (info.isSymbolicLink())
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- files listed by git in this repo
        return scanText(readlinkSync(file)).map((hit) => ({ file, ...hit }));
      if (!info.isFile()) return [];
      if (info.size > MAX_FILE_BYTES) return [{ file, line: 0, kind: "unreadable" as const }];
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- files listed by git in this repo, size checked above
      return scanBlob(file, readFileSync(file), binaries);
    } catch (error) {
      // Deleted from the working tree but still in the index: the index copy is what a commit
      // would publish, so that is what gets scanned. Anything else that cannot be read blocks.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        try {
          return scanBlob(file, git(["show", `:${file}`]), binaries);
        } catch {
          return [{ file, line: 0, kind: "unreadable" as const }];
        }
      }
      return [{ file, line: 0, kind: "unreadable" as const }];
    }
  });
}

function scanHistory(binaries: BinaryEntry[]): ScanHit[] {
  const paths = new Map<string, string>();
  for (const line of git(["rev-list", "--all", "--objects"]).toString("utf8").split("\n")) {
    const space = line.indexOf(" ");
    if (space > 0 && !paths.has(line.slice(0, space)))
      paths.set(line.slice(0, space), line.slice(space + 1));
  }
  const types = git(
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    [...paths.keys()].join("\n") + "\n",
  )
    .toString("utf8")
    .split("\n");
  const hits: ScanHit[] = [];
  for (const entry of types) {
    const [oid, type, size] = entry.split(" ");
    if (oid === undefined || type !== "blob") continue;
    const file = `${paths.get(oid) ?? oid} (historia)`;
    if (SKIP.some((pattern) => pattern.test(paths.get(oid) ?? ""))) continue;
    if (Number(size) > MAX_FILE_BYTES) {
      hits.push({ file, line: 0, kind: "unreadable" });
      continue;
    }
    hits.push(...scanBlob(file, git(["cat-file", "blob", oid]), binaries));
  }
  const messages = git(["log", "--all", "--format=%H%n%B%x00"]).toString("utf8");
  for (const block of messages.split("\0")) {
    const [sha = "", ...body] = block.trim().split("\n");
    for (const hit of scanText(body.join("\n")))
      hits.push({ file: `(mensaje ${sha.slice(0, 7)})`, line: hit.line, kind: hit.kind });
  }
  return hits;
}

function main(): number {
  const args = process.argv.slice(2);
  const [mode, ...rest] = args;
  // Exactly one mode, then optionally `--json <out>`: anything else is a usage error.
  const jsonOut = rest[0] === "--json" && rest.length === 2 ? rest[1] : undefined;
  const valid = rest.length === 0 || jsonOut !== undefined;
  if ((mode !== "--tree" && mode !== "--history") || !valid) {
    process.stderr.write("Uso: public-scan --tree | --history [--json <salida>]\n");
    return 2;
  }
  let rules: AllowRule[];
  try {
    const root = git(["rev-parse", "--show-toplevel"]).toString("utf8").trim();
    rules = parseAllow(
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed file of this repo
      readFileSync(`${root}/tools/public-scan-allow.txt`, "utf8").slice(0, 64 * 1024),
    );
    process.chdir(root);
  } catch (error) {
    process.stderr.write(`❌ public-scan: ${(error as Error).message}\n`);
    return 1;
  }
  const binaries: BinaryEntry[] = [];
  let hits: ScanHit[];
  try {
    hits = (mode === "--tree" ? scanTree(binaries) : scanHistory(binaries)).filter(
      (hit) => !allowed(hit, rules),
    );
  } catch (error) {
    process.stderr.write(`❌ public-scan no pudo leer el repo: ${(error as Error).message}\n`);
    return 1;
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- review output chosen by the caller
  if (jsonOut !== undefined) writeFileSync(jsonOut, `${JSON.stringify({ hits, binaries })}\n`);
  if (hits.length === 0) return 0;
  process.stderr.write("❌ Hay datos que no pueden publicarse (archivo:línea · tipo):\n");
  for (const hit of hits.slice(0, 50))
    process.stderr.write(`  - ${hit.file}:${hit.line} · ${hit.kind}\n`);
  if (hits.length > 50) process.stderr.write(`  … y ${hits.length - 50} más\n`);
  return 1;
}

if (import.meta.main) process.exitCode = main();
