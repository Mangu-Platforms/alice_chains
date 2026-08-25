/**
 * BUILD_PLAN S-20 — the message catalogue and locale-aware formatting.
 *
 * These run in Node, where `navigator` is undefined, so `currentLocale()`
 * falls back to English — which is itself worth pinning: a formatter that
 * throws when there is no browser would take the server-rendered path with it.
 */
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { formatDate, formatRelative, formatTime, t } from "./index";

describe("the message catalogue (S-20)", () => {
  it("returns a plain entry", () => {
    expect(t("status.online")).toBe("Online");
  });

  it("applies a parameterised entry", () => {
    expect(t("a11y.reactWith", "👍")).toBe("React with 👍");
    expect(t("live.newMessageFrom", "Alice")).toBe("New message from Alice");
  });

  it("pluralises rather than appending an s", () => {
    expect(t("count.unreadMessages", 1)).toBe("1 unread message");
    expect(t("count.unreadMessages", 5)).toBe("5 unread messages");
    expect(t("count.members", 1)).toBe("1 member");
    expect(t("count.onlineNow", 0)).toBe("0 people online");
  });

  it("builds a reaction label a screen reader can read aloud", () => {
    expect(t("count.reactions", "👍", 1, false)).toBe("👍, 1 reaction");
    expect(t("count.reactions", "👍", 3, true)).toBe("👍, 3 reactions, including yours");
  });

  it("has no empty entries", () => {
    for (const [key, value] of Object.entries(en)) {
      if (typeof value === "string") {
        expect(value.trim(), `${key} is empty`).not.toBe("");
      } else {
        expect(typeof value, `${key} is neither a string nor a function`).toBe("function");
      }
    }
  });

  it("names every accessibility key under the a11y prefix", () => {
    // So an audit can find them, and a translator can see which strings are
    // read aloud rather than displayed.
    const keys = Object.keys(en);
    expect(keys.filter((k) => k.startsWith("a11y.")).length).toBeGreaterThan(15);
    expect(keys.every((k) => k.includes("."))).toBe(true);
  });
});

describe("locale-aware formatting (S-20)", () => {
  const noon = new Date("2026-08-25T12:34:56Z");

  it("formats a time through Intl rather than a hard-coded pattern", () => {
    const formatted = formatTime(noon);
    // Not asserting a literal: the point is that it follows the environment's
    // convention rather than always emitting HH:mm.
    expect(formatted).toMatch(/\d/);
    expect(formatted).toBe(
      new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(noon)
    );
  });

  it("spells the month out, so a date is not ambiguous across locales", () => {
    // 08/09 is September 8th to most of the world and August 9th to some of it.
    expect(formatDate(noon)).toMatch(/Aug/);
    expect(formatDate(noon)).toContain("2026");
  });

  it("describes a relative time in words", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelative(fiveMinutesAgo)).toMatch(/5 minutes ago/);

    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    expect(formatRelative(yesterday)).toMatch(/yesterday|1 day ago/i);
  });

  it("does not throw where there is no browser", () => {
    // `currentLocale()` reads `navigator`, which is undefined in Node. A
    // formatter that threw here would take any server-side render with it.
    expect(() => formatTime(noon)).not.toThrow();
    expect(() => formatDate(noon)).not.toThrow();
    expect(() => formatRelative(noon)).not.toThrow();
  });
});
