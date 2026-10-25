import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadState, saveState, type SavedState } from "./state.ts";

const NOW = new Date("2026-10-24T17:00:00Z");
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tintero-state-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const sample = (over: Partial<SavedState> = {}): SavedState => ({
  version: 1,
  boardNoteId: "tablero00001",
  savedAt: "2026-10-24T16:59:00.000Z",
  lastGood: {
    readAt: "2026-10-24T16:59:00.000Z",
    tasks: [{ id: "tarjeta00001", title: "Comprar pilas", done: false, stage: "todo" }],
  },
  statuses: { tarjeta00001: "Por hacer" },
  pending: { tarjeta00001: { next: "Hecho", since: "2026-10-24T16:59:30.000Z" } },
  ...over,
});

const raw = (text: string, mode = 0o600): string => {
  const file = join(dir, "state.json");
  /* eslint-disable security/detect-non-literal-fs-filename -- temporary test folder */
  writeFileSync(file, text);
  chmodSync(file, mode);
  /* eslint-enable security/detect-non-literal-fs-filename */
  return file;
};

describe("saveState with a planted temporary name", () => {
  it("does not follow a link at the temporary name and saves the state", async () => {
    const file = join(dir, "state.json");
    const target = join(dir, "target.txt");
    /* eslint-disable security/detect-non-literal-fs-filename -- temporary test folder */
    writeFileSync(target, "original");
    symlinkSync(target, `${file}.tmp-${process.pid}`);
    await saveState(file, sample());
    expect(readFileSync(target, "utf8")).toBe("original");
    expect(readdirSync(dir).sort()).toEqual(["state.json", "target.txt"]);
    /* eslint-enable security/detect-non-literal-fs-filename */
    expect(loadState(file, "tablero00001", NOW)).toEqual({ state: sample() });
  });

  it("replaces a leftover regular file of the same name", async () => {
    const file = join(dir, "state.json");
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- temporary test folder
    writeFileSync(`${file}.tmp-${process.pid}`, "old");
    await saveState(file, sample());
    expect(loadState(file, "tablero00001", NOW)).toEqual({ state: sample() });
  });
});

describe("saveState / loadState", () => {
  it("round-trips with mode 600 and no temporary file left", async () => {
    const file = join(dir, "state.json");
    await saveState(file, sample());
    expect(statSync(file).mode & 0o777).toBe(0o600); // eslint-disable-line security/detect-non-literal-fs-filename -- temporary test folder
    expect(readdirSync(dir)).toEqual(["state.json"]); // eslint-disable-line security/detect-non-literal-fs-filename -- temporary test folder
    expect(loadState(file, "tablero00001", NOW)).toEqual({ state: sample() });
  });

  it("throws toward a missing folder and leaves nothing behind", async () => {
    await expect(saveState(join(dir, "nope", "state.json"), sample())).rejects.toThrow();
    expect(readdirSync(dir)).toEqual([]); // eslint-disable-line security/detect-non-literal-fs-filename -- temporary test folder
  });
});

describe("loadState problems", () => {
  it("reports each problem and never throws", () => {
    expect(loadState(join(dir, "none.json"), "tablero00001", NOW)).toEqual({
      state: null,
      problem: "missing",
    });
    expect(loadState(raw("{"), "tablero00001", NOW).problem).toBe("bad-json");
    expect(loadState(raw('{"version":1}'), "tablero00001", NOW).problem).toBe("bad-json");
    expect(loadState(raw(JSON.stringify(sample()), 0o644), "tablero00001", NOW).problem).toBe(
      "permissions",
    );
    expect(loadState(raw(JSON.stringify(sample())), "otro", NOW).problem).toBe("other-board");
    expect(loadState(raw("x".repeat(1_048_577)), "tablero00001", NOW)).toEqual({
      state: null,
      problem: "too-large",
    });
    expect(loadState(dir, "tablero00001", NOW).state).toBeNull();
  });

  it("rejects ids and times with the wrong shape", () => {
    const badId = sample({ statuses: { "../x": "Por hacer" } });
    expect(loadState(raw(JSON.stringify(badId)), "tablero00001", NOW).problem).toBe("bad-json");
    const badTime = sample({ pending: { tarjeta00001: { next: "Hecho", since: "ayer" } } });
    expect(loadState(raw(JSON.stringify(badTime)), "tablero00001", NOW).problem).toBe("bad-json");
  });

  it("drops a last read older than 24 h but keeps statuses and pending", () => {
    const old = sample({
      lastGood: { readAt: "2026-10-23T16:59:00.000Z", tasks: [] },
    });
    const { state, problem } = loadState(raw(JSON.stringify(old)), "tablero00001", NOW);
    expect(problem).toBeUndefined();
    expect(state?.lastGood).toBeNull();
    expect(state?.statuses).toEqual(old.statuses);
    expect(state?.pending).toEqual(old.pending);
  });
});
