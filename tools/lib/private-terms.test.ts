import { describe, expect, it } from "vitest";
import { findPrivateTerms } from "./private-terms.ts";

describe("findPrivateTerms", () => {
  it("finds whole words, ignoring case", () => {
    expect(findPrivateTerms("hola\nlo aprobó FOO ayer\nnada", ["foo"])).toEqual([2]);
  });

  it("does not match inside other words", () => {
    expect(findPrivateTerms("foobar y barfoo", ["foo"])).toEqual([]);
  });

  it("matches terms with dots, slashes and spaces", () => {
    expect(findPrivateTerms("ver host.example.net:8443", ["host.example.net"])).toEqual([1]);
    expect(findPrivateTerms("la Casa Azul", ["casa azul"])).toEqual([1]);
  });

  it("still matches when glued to digits or underscores", () => {
    expect(findPrivateTerms("foo_x y foo2", ["foo"])).toEqual([1]);
  });

  it("treats accented letters as part of a word", () => {
    expect(findPrivateTerms("fooá", ["foo"])).toEqual([]);
  });
});
