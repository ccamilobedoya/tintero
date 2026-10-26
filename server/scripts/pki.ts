// Private CA of Tintero (F-004): `npm run pki -- init|server|device <folder> [name]`, and
// `firmware` (F-018) to write the header with one device's certificates for the ESP32.
// Uses the `openssl` CLI through execFile (no shell). Everything lives outside the repo.
/* eslint-disable security/detect-non-literal-fs-filename -- every path is built from the folder given by the owner, after checkFolder */
import { execFile } from "node:child_process";
import { randomBytes, X509Certificate } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fingerprint, readCapped } from "../src/tls.ts";

const run = promisify(execFile);
const REPO = realpathSync(resolve(import.meta.dirname, "../.."));
const ID = /^[a-z0-9-]{1,32}$/;
const DNS_LABEL = /^[a-z0-9-]{1,63}$/i;
const CA_DAYS = 3650;
const DEVICE_DAYS = 1826;
const SERVER_DAYS = 730;

class PkiError extends Error {}

/** Real path of a path that may not exist yet (the deepest existing ancestor is resolved). */
function realTarget(path: string): string {
  let current = resolve(path);
  const rest: string[] = [];
  while (!existsSync(current)) {
    rest.unshift(current.slice(dirname(current).length + 1));
    current = dirname(current);
  }
  return join(realpathSync(current), ...rest);
}

function checkFolder(dir: string): string {
  if (dir === "") throw new PkiError("folder is required");
  const real = realTarget(dir);
  const rel = relative(REPO, real);
  if (rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"))) {
    throw new PkiError("the folder is inside the repository");
  }
  return real;
}

function checkDns(name: string): void {
  const labels = name.split(".");
  const edges = (label: string): boolean => !label.startsWith("-") && !label.endsWith("-");
  if (name.length > 253 || !labels.every((label) => DNS_LABEL.test(label) && edges(label))) {
    throw new PkiError("invalid DNS name");
  }
}

function ensureAbsent(files: string[]): void {
  for (const file of files) {
    if (existsSync(file)) throw new PkiError("a destination file already exists");
  }
}

function ensureCa(dir: string): void {
  if (!existsSync(join(dir, "ca.key")) || !existsSync(join(dir, "ca.crt"))) {
    throw new PkiError("the CA does not exist in the folder (run init first)");
  }
}

function makeDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

async function openssl(args: string[]): Promise<void> {
  try {
    await run("openssl", args, { timeout: 30_000, maxBuffer: 1 << 20 });
  } catch {
    throw new PkiError("openssl failed");
  }
}

/** Runs `build` in a private temporary folder and always removes it. */
async function withWork<T>(build: (work: string) => Promise<T>): Promise<T> {
  const work = mkdtempSync(join(tmpdir(), "tintero-pki-"));
  try {
    return await build(work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Copies each `from` to its `to` (exclusive); if any fails, removes what this call installed. */
export async function installFiles(
  files: { from: string; to: string; mode: number }[],
): Promise<void> {
  const installed: string[] = [];
  try {
    for (const file of files) {
      // nosemgrep: tintero-lectura-sin-tope -- a PEM that this program just generated in its private temp folder
      const data = await readFile(file.from);
      try {
        // Exclusive creation with the final mode from the start (never the source's mode).
        await writeFile(file.to, data, { flag: "wx", mode: file.mode });
      } catch (error) {
        // A partial destination is ours to remove; one that already existed never is.
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") rmSync(file.to, { force: true });
        throw error;
      }
      installed.push(file.to);
      await chmod(file.to, file.mode);
    }
  } catch (error) {
    for (const path of installed) rmSync(path, { force: true });
    throw error;
  }
}

const install = (work: string, files: { from: string; to: string; mode: number }[]) =>
  installFiles(files.map((file) => ({ ...file, from: join(work, file.from) })));

const genKey = (path: string): Promise<void> =>
  openssl(["genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", path]);

const CONFIG = "[req]\ndistinguished_name = dn\nprompt = no\n[dn]\nCN = x\n";

export async function pkiInit(dir: string): Promise<void> {
  const real = checkFolder(dir);
  ensureAbsent([join(real, "ca.key"), join(real, "ca.crt")]);
  await withWork(async (work) => {
    await writeFile(join(work, "req.cnf"), CONFIG);
    await genKey(join(work, "ca.key"));
    await openssl([
      "req", "-x509", "-new", "-config", join(work, "req.cnf"),
      "-key", join(work, "ca.key"), "-sha256", "-days", String(CA_DAYS),
      "-subj", "/CN=Tintero CA",
      "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
      "-addext", "keyUsage=critical,keyCertSign,cRLSign",
      "-out", join(work, "ca.crt"),
    ]); // prettier-ignore
    makeDir(real);
    await install(work, [
      { from: "ca.key", to: join(real, "ca.key"), mode: 0o600 },
      { from: "ca.crt", to: join(real, "ca.crt"), mode: 0o644 },
    ]);
  });
}

/** Issues a leaf certificate signed by the CA of `dir`; returns after the files are in `work`. */
async function issue(
  work: string,
  dir: string,
  subject: string,
  extensions: string,
  days: number,
): Promise<void> {
  await writeFile(join(work, "req.cnf"), CONFIG);
  await writeFile(join(work, "ext.cnf"), `[ext]\n${extensions}\n`);
  await genKey(join(work, "leaf.key"));
  await openssl([
    "req", "-new", "-config", join(work, "req.cnf"), "-key", join(work, "leaf.key"),
    "-subj", subject, "-out", join(work, "leaf.csr"),
  ]); // prettier-ignore
  await openssl([
    "x509", "-req", "-in", join(work, "leaf.csr"),
    "-CA", join(dir, "ca.crt"), "-CAkey", join(dir, "ca.key"),
    "-CAcreateserial", "-CAserial", join(work, "ca.srl"),
    "-days", String(days), "-sha256",
    "-extfile", join(work, "ext.cnf"), "-extensions", "ext",
    "-out", join(work, "leaf.crt"),
  ]); // prettier-ignore
}

export async function pkiServer(dir: string, dnsName: string): Promise<void> {
  const real = checkFolder(dir);
  checkDns(dnsName);
  ensureCa(real);
  ensureAbsent([join(real, "server.key"), join(real, "server.crt")]);
  await withWork(async (work) => {
    const extensions =
      `subjectAltName = DNS:${dnsName}\nextendedKeyUsage = serverAuth\n` +
      "basicConstraints = CA:FALSE\nkeyUsage = digitalSignature";
    await issue(work, real, `/CN=${dnsName}`, extensions, SERVER_DAYS);
    await install(work, [
      { from: "leaf.key", to: join(real, "server.key"), mode: 0o600 },
      { from: "leaf.crt", to: join(real, "server.crt"), mode: 0o644 },
    ]);
  });
}

export async function pkiDevice(dir: string, id: string): Promise<string> {
  const real = checkFolder(dir);
  if (!ID.test(id)) throw new PkiError("invalid device id");
  ensureCa(real);
  const devices = join(real, "devices");
  const key = join(devices, `${id}.key`);
  const crt = join(devices, `${id}.crt`);
  ensureAbsent([key, crt]);
  return withWork(async (work) => {
    const extensions =
      "extendedKeyUsage = clientAuth\nbasicConstraints = CA:FALSE\nkeyUsage = digitalSignature";
    await issue(work, real, `/CN=${id}`, extensions, DEVICE_DAYS);
    makeDir(devices);
    await install(work, [
      { from: "leaf.key", to: key, mode: 0o600 },
      { from: "leaf.crt", to: crt, mode: 0o644 },
    ]);
    // nosemgrep: tintero-lectura-sin-tope -- the certificate this program just installed, one PEM
    const pem = await readFile(crt);
    return `${fingerprint(new X509Certificate(pem).raw)} ${id}`;
  });
}

const MAX_FIRMWARE_PEM = 4096;
const PEM_SHAPE = /^-----BEGIN [A-Z ]+-----\n[A-Za-z0-9+/=\n]+-----END [A-Z ]+-----\n?$/;
const DEFAULT_FIRMWARE_OUT = join(REPO, "firmware", "include", "tintero_certs.h");

/** Reads one PEM (at most 4 096 bytes, checked while reading) and checks it has the PEM shape. */
function readPem(file: string): string {
  let text: string;
  try {
    text = readCapped(file, MAX_FIRMWARE_PEM).toString("utf8").replaceAll("\r\n", "\n");
  } catch {
    throw new PkiError("a certificate or key file is missing, too large or not a regular file");
  }
  if (!PEM_SHAPE.test(text)) throw new PkiError("a file is not a plain PEM");
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** A file inside the repo may only be written when git ignores it (fails closed). */
async function ensureIgnoredByGit(target: string): Promise<void> {
  const rel = relative(REPO, target);
  if (rel.startsWith("..") || rel.startsWith("/")) return; // outside the repo: git never sees it
  try {
    await run("git", ["-C", REPO, "check-ignore", "-q", "--", rel], { timeout: 10_000 });
  } catch {
    throw new PkiError("the output is inside the repository and git does not ignore it");
  }
}

function firmwareHeader(host: string, id: string, ca: string, cert: string, key: string): string {
  const pem = (name: string, text: string): string =>
    `static const char ${name}[] = R"PEM(${text})PEM";\n`;
  return (
    "// Generated by `npm run pki -- firmware`. It holds this device's private key:\n" +
    "// git ignores it; never commit it, paste it or share it.\n" +
    "#pragma once\n\n" +
    `static const char TINTERO_HOST[] = "${host}";\n` +
    `static const char TINTERO_DEVICE_ID[] = "${id}";\n\n` +
    pem("TINTERO_CA_PEM", ca) +
    pem("TINTERO_DEVICE_CERT_PEM", cert) +
    pem("TINTERO_DEVICE_KEY_PEM", key)
  );
}

/**
 * Writes the C++ header with the CA and the certificate and key of ONE device (a stolen device
 * never exposes another). The file is replaced atomically with mode 600. Returns the path.
 */
export async function pkiFirmware(
  dir: string,
  host: string,
  id: string,
  out: string = DEFAULT_FIRMWARE_OUT,
): Promise<string> {
  const real = checkFolder(dir);
  if (host === "") throw new PkiError("--host is required");
  checkDns(host);
  if (!ID.test(id)) throw new PkiError("invalid device id");
  const ca = readPem(join(real, "ca.crt"));
  const cert = readPem(join(real, "devices", `${id}.crt`));
  const key = readPem(join(real, "devices", `${id}.key`));
  const target = realTarget(out);
  if (!existsSync(dirname(target))) throw new PkiError("the output folder does not exist");
  const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  // The temporary file holds the key too: git must ignore it as well as the destination.
  await ensureIgnoredByGit(target);
  await ensureIgnoredByGit(temp);
  try {
    await writeFile(temp, firmwareHeader(host, id, ca, cert, key), { flag: "wx", mode: 0o600 });
    await chmod(temp, 0o600);
    renameSync(temp, target);
  } catch {
    rmSync(temp, { force: true });
    throw new PkiError("could not write the output file");
  }
  return target;
}

const USAGE =
  "usage: pki init <folder> | pki server <folder> <dns-name> | pki device <folder> <id> | " +
  "pki firmware <folder> --host <dns-name> <id> [--out <file>]";

/** `firmware <folder> --host <name> <id> [--out <file>]` → the parts, or undefined if malformed. */
function parseFirmwareArgs(
  args: string[],
): { dir: string; host: string; ids: string[]; out?: string } | undefined {
  let host: string | undefined;
  let out: string | undefined;
  const positional: string[] = [];
  const queue = [...args];
  for (let arg = queue.shift(); arg !== undefined; arg = queue.shift()) {
    if (arg === "--host" || arg === "--out") {
      const value = queue.shift();
      if (value === undefined || (arg === "--host" ? host : out) !== undefined) return undefined;
      if (arg === "--host") host = value;
      else out = value;
    } else if (arg.startsWith("--")) return undefined;
    else positional.push(arg);
  }
  const [dir, ...ids] = positional;
  if (dir === undefined) return undefined;
  return { dir, host: host ?? "", ids, ...(out === undefined ? {} : { out }) };
}

/** Runs the CLI; returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  const [command, dir = "", name = ""] = argv;
  try {
    if (command === "firmware") {
      const parsed = parseFirmwareArgs(argv.slice(1));
      if (parsed?.ids.length !== 1) {
        console.error(USAGE);
        return 2;
      }
      const path = await pkiFirmware(parsed.dir, parsed.host, parsed.ids[0] ?? "", parsed.out);
      console.log(`wrote ${path}`);
      return 0;
    }
    if (command === "init" && argv.length === 2) await pkiInit(dir);
    else if (command === "server" && argv.length === 3) await pkiServer(dir, name);
    else if (command === "device" && argv.length === 3) console.log(await pkiDevice(dir, name));
    else {
      console.error(USAGE);
      return 2;
    }
    return 0;
  } catch (error) {
    console.error(error instanceof PkiError ? error.message : "pki failed");
    return 2;
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
