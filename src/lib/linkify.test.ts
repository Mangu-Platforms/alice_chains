/**
 * BUILD_PLAN P-LINK-1 — URL detection in message text.
 *
 * Cases: TC-LINK-01…03.
 */
import { describe, expect, it } from "vitest";
import { isSafeHref, splitLinks } from "./linkify";

const links = (text: string) => splitLinks(text).filter((p) => p.type === "link");
const rendered = (text: string) => splitLinks(text).map((p) => p.value).join("");

describe("link detection (P-LINK-1)", () => {
  it("finds an http and an https URL", () => {
    expect(links("see https://example.com")[0].href).toBe("https://example.com");
    expect(links("see http://example.com")[0].href).toBe("http://example.com");
  });

  it("links a bare www. address over https", () => {
    expect(links("see www.example.com")[0].href).toBe("https://www.example.com");
  });

  it("finds several in one message", () => {
    expect(links("https://a.test and https://b.test")).toHaveLength(2);
  });

  it("leaves the surrounding text alone", () => {
    const text = "look at https://example.com for details";
    expect(rendered(text)).toBe(text);
    expect(splitLinks(text)[0]).toMatchObject({ type: "text", value: "look at " });
  });

  it("keeps a full stop out of the link", () => {
    const [link] = links("see https://example.com.");
    expect(link.href).toBe("https://example.com");
    expect(rendered("see https://example.com.")).toBe("see https://example.com.");
  });

  it("keeps a closing bracket in a URL that opened one", () => {
    const [link] = links("https://en.wikipedia.org/wiki/Foo_(bar)");
    expect(link.href).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
  });

  it("keeps a closing bracket out when the URL did not open one", () => {
    const [link] = links("(see https://example.com)");
    expect(link.href).toBe("https://example.com");
  });

  // TC-LINK-02 — the one that matters.
  it("never links a javascript: URL", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(links(hostile)).toHaveLength(0);
      // Still shown, just as text — React escapes it.
      expect(rendered(hostile)).toBe(hostile);
    }
  });

  it("rejects those hrefs directly too", () => {
    expect(isSafeHref("https://example.com")).toBe(true);
    expect(isSafeHref("http://example.com")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,x")).toBe(false);
    expect(isSafeHref("not a url")).toBe(false);
    expect(isSafeHref("")).toBe(false);
  });

  it("does not link a word that merely contains a scheme name", () => {
    expect(links("the javascript language")).toHaveLength(0);
    expect(links("httpsomething")).toHaveLength(0);
  });

  // TC-LINK-03
  it("returns plain text unchanged", () => {
    const text = "no links here at all";
    expect(splitLinks(text)).toEqual([{ type: "text", value: text }]);
  });

  it("handles an empty message", () => {
    expect(splitLinks("")).toEqual([{ type: "text", value: "" }]);
  });

  it("preserves every character of the original", () => {
    for (const text of [
      "https://a.test",
      "a https://b.test c",
      "((https://c.test))",
      "https://d.test, https://e.test.",
      "no links",
    ]) {
      expect(rendered(text)).toBe(text);
    }
  });
});
