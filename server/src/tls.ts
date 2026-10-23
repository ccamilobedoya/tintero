// TLS options of the server with a mandatory client certificate (L1, F-004) and the fingerprint.
import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import type https from "node:https";

export interface TlsConfig {
  certFile: string;
  keyFile: string;
  clientCaFile: string;
  devicesFile: string;
}

const MAX_PEM_BYTES = 65_536;

/** SHA-256 of the DER certificate: 64 lowercase hex characters, no colons. */
export function fingerprint(certDer: Uint8Array): string {
  return createHash("sha256").update(certDer).digest("hex");
}

/** Reads a file of at most `max` bytes; throws when it is bigger or unreadable. */
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

/** Options for `https.createServer`: the client must present a certificate from the device CA. */
export function tlsOptions(config: TlsConfig, handshakeTimeoutMs: number): https.ServerOptions {
  return {
    cert: readCapped(config.certFile, MAX_PEM_BYTES),
    key: readCapped(config.keyFile, MAX_PEM_BYTES),
    ca: readCapped(config.clientCaFile, MAX_PEM_BYTES),
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    handshakeTimeout: handshakeTimeoutMs,
  };
}
