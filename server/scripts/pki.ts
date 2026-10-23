// Private CA of Tintero (F-004): `npm run pki -- init|server|device <folder> [name]`.
// Uses the `openssl` CLI through execFile (no shell). Everything lives outside the repo.
/* eslint-disable security/detect-non-literal-fs-filename -- every path is built from the folder given by the owner, after checkFolder */
import { execFile } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fingerprint } from "../src/tls.ts";

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

async function install(work: string, files: { from: string; to: string; mode: number }[]) {
  for (const file of files) {
    const data = await readFile(join(work, file.from));
    await writeFile(file.to, data, { flag: "wx", mode: file.mode });
    chmodSync(file.to, file.mode);
  }
}

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
    const pem = await readFile(crt);
    return `${fingerprint(new X509Certificate(pem).raw)} ${id}`;
  });
}

const USAGE =
  "usage: pki init <folder> | pki server <folder> <dns-name> | pki device <folder> <id>";

/** Runs the CLI; returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  const [command, dir = "", name = ""] = argv;
  try {
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
