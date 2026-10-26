import { describe, expect, it } from "vitest";
import { allowed, entropy, imageMetadata, parseAllow, scanBlob, scanText } from "./public-scan.ts";

const kinds = (text: string) => scanText(text).map((hit) => hit.kind);

function png(chunks: [string, Buffer][]): Buffer {
  const parts: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const [type, data] of [...chunks, ["IEND", Buffer.alloc(0)] as [string, Buffer]]) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    parts.push(length, Buffer.from(type, "latin1"), data, Buffer.alloc(4));
  }
  return Buffer.concat(parts);
}

describe("scanText", () => {
  it("finds each kind, with its line", () => {
    expect(kinds("/home/ana/x")).toEqual(["home-path"]);
    expect(kinds("C:\\Users\\ana\\x")).toEqual(["home-path"]);
    expect(kinds("ana@gmail.com")).toEqual(["email"]);
    expect(kinds("casa.tail1234.ts.net")).toEqual(["ts-net"]);
    expect(kinds("100.101.102.103 y 10.1.2.3")).toEqual(["ipv4"]);
    expect(kinds("-----BEGIN EC PRIVATE KEY-----")).toEqual(["private-key"]);
    expect(kinds("Zx8Qp2Lm9Rt4Vb7Nc1Kd6Hf3Jg5Ws0Ye")).toEqual(["entropy"]);
    expect(scanText("a\nb\nana@gmail.com")).toEqual([{ line: 3, kind: "email" }]);
  });

  it("leaves test values and look-alikes alone", () => {
    expect(
      kinds(
        [
          "tintero.example.ts.net tintero.ejemplo.ts.net *.ts.net",
          "192.0.2.1 127.0.0.1 0.0.0.0 198.51.100.7 203.0.113.9 192.168.1.10 10.0.0.1",
          "noreply@github.com a@example.com b@host.example",
          "OID 1.3.6.1.5.5.7.3.1 Chrome 156.0.8078.48 v1.104.2",
          "TS_EXTRA_ARGS=--advertise-tags=tag:tintero --accept-routes=false",
          "tests/acceptance/F-014/calendars-file.test.ts",
          "expect(out).not.toContain('PRIVATE KEY')",
          "sha256:0d003fc3abc4e1565eca8462b992001314de51451e96e3c44de80d116794d5d1",
          "/home/ /homeless/x",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("entropy is the Shannon entropy in bits per character", () => {
    expect(entropy("aaaa")).toBe(0);
    expect(entropy("abcd")).toBe(2);
  });
});

describe("images", () => {
  it("reports PNG metadata chunks and nothing for a clean one", () => {
    expect(imageMetadata(png([["tEXt", Buffer.from("Author\0ana")]]))).toEqual(["tEXt"]);
    expect(imageMetadata(png([["IDAT", Buffer.from([1, 2, 3])]]))).toEqual([]);
    expect(imageMetadata(Buffer.from("hola"))).toBeUndefined();
  });

  it("reports JPEG EXIF", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x45, 0x78, 0xff, 0xda]);
    expect(imageMetadata(jpeg)).toEqual(["APP1 (EXIF/XMP)"]);
  });

  it("lists binaries and flags the ones with metadata", () => {
    const binaries: { file: string; type: string; bytes: number }[] = [];
    const hits = scanBlob("a.png", png([["tEXt", Buffer.from("x\0y")]]), binaries);
    expect(hits).toEqual([{ file: "a.png", line: 0, kind: "metadata" }]);
    expect(binaries[0]?.type).toBe("png");
  });
});

describe("allow list", () => {
  it("parses rules with reasons and matches by file and kind", () => {
    const rules = parseAllow("# x\ndocs/*.md email  # motivo\n");
    expect(allowed({ file: "docs/a.md", kind: "email" }, rules)).toBe(true);
    expect(allowed({ file: "docs/a.md (historia)", kind: "email" }, rules)).toBe(true);
    expect(allowed({ file: "docs/a.md", kind: "ipv4" }, rules)).toBe(false);
  });

  it("rejects a malformed line", () => {
    expect(() => parseAllow("docs/a.md\n")).toThrow();
    expect(() => parseAllow("docs/a.md nope\n")).toThrow();
  });
});

describe("allow list for the second detector", () => {
  it("accepts trufflehog:<Detector> kinds", () => {
    const rules = parseAllow("a.test.ts trufflehog:URI  # motivo\n");
    expect(allowed({ file: "a.test.ts", kind: "trufflehog:URI" }, rules)).toBe(true);
    expect(allowed({ file: "a.test.ts", kind: "trufflehog:Github" }, rules)).toBe(false);
  });
});
