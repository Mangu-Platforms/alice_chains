/**
 * BACKLOG H-9 — deciding when to load older messages, and how not to disturb
 * the reader while doing it.
 *
 * Cases: TC-UX-11…13.
 */
import { describe, expect, it } from "vitest";
import {
  hasMoreOlderMessages,
  MESSAGE_PAGE_SIZE,
  scrollTopAfterPrepend,
  shouldScrollToNewest,
} from "./pagination";

describe("offering another page (H-9)", () => {
  it("offers one when a full page came back", () => {
    // TC-UX-11a
    expect(hasMoreOlderMessages(50, 50)).toBe(true);
  });

  it("does not offer one once the conversation's start is reached", () => {
    // TC-UX-11b — fewer rows than asked for means there is nothing before them.
    expect(hasMoreOlderMessages(12, 50)).toBe(false);
  });

  it("does not offer one for an empty conversation", () => {
    expect(hasMoreOlderMessages(0, 50)).toBe(false);
  });

  it("exports the page size the client actually requests", () => {
    expect(MESSAGE_PAGE_SIZE).toBeGreaterThan(0);
  });
});

describe("where the scrollbar lands after prepending history (H-9)", () => {
  it("holds the reader's place as the container grows", () => {
    // TC-UX-12a — 40 rows appear above what was already visible; the reader
    // should not perceive any movement at all.
    expect(scrollTopAfterPrepend(2000, 2800, 50)).toBe(850);
  });

  it("is a no-op when nothing was actually added", () => {
    // A page that returned no new rows must not move the scrollbar.
    expect(scrollTopAfterPrepend(2000, 2000, 50)).toBe(50);
  });
});

describe("when loading history must not jump to the newest message (H-9)", () => {
  const at = (id: number) => ({ id });

  it("scrolls down on the very first load", () => {
    // TC-UX-13a
    expect(shouldScrollToNewest(undefined, [at(1), at(2)])).toBe(true);
    expect(shouldScrollToNewest([], [at(1), at(2)])).toBe(true);
  });

  it("scrolls down when a new message actually arrived", () => {
    expect(shouldScrollToNewest([at(1), at(2)], [at(1), at(2), at(3)])).toBe(true);
  });

  it("does NOT scroll down when older history was merely prepended", () => {
    // TC-UX-13b — this is the case the whole feature exists to get right:
    // the newest message (id 2) is unchanged, only older ones were added
    // above it.
    expect(shouldScrollToNewest([at(1), at(2)], [at(-3), at(-2), at(-1), at(1), at(2)])).toBe(
      false
    );
  });

  it("does not scroll down for an edit or a reaction, which changes the array but not the newest id", () => {
    const before = [at(1), at(2)];
    const after = [{ id: 1 }, { id: 2 }]; // new object identity, same ids
    expect(shouldScrollToNewest(before, after)).toBe(false);
  });

  it("does not scroll when the page becomes empty", () => {
    expect(shouldScrollToNewest([at(1)], [])).toBe(false);
    expect(shouldScrollToNewest([at(1)], undefined)).toBe(false);
  });
});
