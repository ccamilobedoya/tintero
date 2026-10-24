// The only way HTML is built (sensitive zone): a template function that escapes every value.
// Data text can never become markup, so nothing drawn can reach the network (CA19).

export class Raw {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

const ESCAPES = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES.get(char) ?? char);
}

/** Marks markup already built by `html` (or a fixed literal) as safe. */
export const raw = (value: string): Raw => new Raw(value);

function render(value: unknown): string {
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "string") return escapeHtml(value);
  return "";
}

/** Template tag: literal parts are trusted; every `${value}` is escaped unless it is a `Raw`. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = strings[0] ?? "";
  values.forEach((value, i) => {
    out += render(value) + (strings[i + 1] ?? "");
  });
  return new Raw(out);
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'";

/** A full page: CSP first, no scripts, no `url()`, no `@font-face` (fonts come from fontconfig). */
export function page(width: number, height: number, body: Raw, css = ""): string {
  return html`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta http-equiv="Content-Security-Policy" content="${CSP}" />
        <style>
          *{box-sizing:border-box;margin:0;padding:0}html,body{width:${width}px;height:${height}px;background:#fff;color:#000;overflow:hidden}body{position:relative}.a{position:absolute}.t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}${raw(css)}
        </style>
      </head>
      <body>
        ${body}
      </body>
    </html>`.value;
}
