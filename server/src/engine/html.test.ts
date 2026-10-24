import { describe, expect, it } from "vitest";
import { escapeHtml, html, page, raw } from "./html.ts";

describe("html", () => {
  it("escapes the five dangerous characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("escapes every value of the template and keeps Raw and literals", () => {
    const evil = `<img src="http://example.invalid/x"><script>1</script>`;
    const items = [html`<i>${"&"}</i>`, "<"];
    const safe = raw("<b>ok</b>");
    const out = html`<p>${evil}</p>`.value + html`${safe}${items}${3}${null}`.value;
    expect(out).toBe(
      "<p>&lt;img src=&quot;http://example.invalid/x&quot;&gt;&lt;script&gt;1&lt;/script&gt;</p><b>ok</b><i>&amp;</i>&lt;3",
    );
  });

  it("builds a page with the CSP, no scripts, no url() and no @font-face", () => {
    const out = page(800, 480, html`<p>hi</p>`);
    expect(out).toContain("default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;");
    expect(out).toContain("width:800px;height:480px");
    expect(out).not.toMatch(/<script|url\(|@font-face/);
  });
});
