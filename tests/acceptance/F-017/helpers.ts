/* eslint-disable security/detect-non-literal-fs-filename -- dato grabado y READMEs del repo */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../F-013/helpers.ts";

export * from "../F-015/helpers.ts";

export const FIX17 = new URL("./fixtures/", import.meta.url).pathname;
export const readRepo = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Reloj del lunes 2 de noviembre (festivo), 08:00 en Lima. */
export const NOW_NOV2_17 = "2026-11-02T13:00:00Z";

const VOID = new Set(["br", "img", "meta", "link", "input", "hr", "col", "area", "base"]);

/**
 * Estilos en línea de los elementos que envuelven al texto `text` (del más cercano al más lejano).
 * Vacío si ningún nodo de texto, recortado, es exactamente `text`.
 */
export function styleChain(html: string, text: string): string[] {
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[5] !== undefined) {
      if (m[5].trim() === text && stack.length > 0) return [...stack].reverse();
      continue;
    }
    const tag = (m[2] ?? "").toLowerCase();
    if (m[1] === "/") {
      stack.pop();
      continue;
    }
    if (tag === "script" || tag === "style") continue;
    if (VOID.has(tag) || m[4] === "/") continue;
    stack.push((/style\s*=\s*"([^"]*)"/.exec(m[3] ?? "")?.[1] ?? "").replace(/\s+/g, ""));
  }
  return [];
}

/** Valor más cercano declarado de `prop` en la cadena de estilos, o `undefined` si nadie lo declara. */
export function nearest(chain: string[], prop: string): string | undefined {
  for (const style of chain) {
    for (const decl of style.split(";")) {
      const at = decl.indexOf(":");
      if (at > 0 && decl.slice(0, at) === prop) return decl.slice(at + 1).replace("!important", "");
    }
  }
  return undefined;
}

/** `0`, `0px`, `0.0px` → `"0"`; `1px` → `"1px"`; sin declarar → `undefined`. */
export function spacing(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return /^0(px|em|rem)?$/.test(value) ? "0" : value;
}
