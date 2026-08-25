/**
 * BUILD_PLAN P-UX-3 — the composer's decisions.
 *
 * Cases: TC-UX-07…09 — the counter, emoji insertion, and paste-to-attach.
 *
 * The composer's new behaviours are each a small rule applied on every
 * keystroke or paste, and each of them has an edge that is easy to get wrong:
 * a counter that appears too early, an insertion that lands at the end of the
 * message rather than at the caret, a text paste swallowed because it was
 * mistaken for a file. These pin all three.
 */
import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH } from "@contracts/constants";
import { ALL_EMOJI, EMOJI_GROUPS } from "./emoji";
import {
  COUNTER_THRESHOLD,
  counterState,
  filesFromClipboard,
  insertAtCaret,
} from "./composer";

describe("the length counter (P-UX-3)", () => {
  it("stays hidden while the cap is far away", () => {
    // TC-UX-07a
    expect(counterState(0).visible).toBe(false);
    expect(counterState(100).visible).toBe(false);
  });

  it("appears exactly at the threshold, not one character later", () => {
    // TC-UX-07b — an off-by-one here is invisible in use and wrong forever.
    const justBefore = MAX_MESSAGE_LENGTH - COUNTER_THRESHOLD - 1;
    expect(counterState(justBefore).visible).toBe(false);
    expect(counterState(justBefore + 1).visible).toBe(true);
  });

  it("counts down to zero without declaring the message over", () => {
    // TC-UX-07c — a message of exactly the cap is legal.
    const atCap = counterState(MAX_MESSAGE_LENGTH);
    expect(atCap.remaining).toBe(0);
    expect(atCap.over).toBe(false);
  });

  it("goes negative rather than clamping once the cap is passed", () => {
    // TC-UX-07d — "0 left" while still typing is a control that lies; the
    // number has to say how much must come out.
    const over = counterState(MAX_MESSAGE_LENGTH + 12);
    expect(over.remaining).toBe(-12);
    expect(over.over).toBe(true);
    expect(over.visible).toBe(true);
  });
});

describe("inserting at the caret (P-UX-3)", () => {
  it("inserts where the caret is, not at the end", () => {
    // TC-UX-08a
    const result = insertAtCaret("hello world", 5, 5, "👍");
    expect(result.value).toBe("hello👍 world");
    expect(result.caret).toBe(7); // the emoji is a surrogate pair
  });

  it("replaces a selection", () => {
    // TC-UX-08b
    const result = insertAtCaret("hello world", 0, 5, "🔥");
    expect(result.value).toBe("🔥 world");
  });

  it("appends when the field was never focused", () => {
    // TC-UX-08c — a null selection is not position zero.
    const result = insertAtCaret("hello", null, null, "!");
    expect(result.value).toBe("hello!");
    expect(result.caret).toBe(6);
  });

  it("clamps a caret that outran the value", () => {
    // TC-UX-08d — React state and the DOM selection can disagree for a frame.
    expect(insertAtCaret("hi", 99, 99, "!").value).toBe("hi!");
    expect(insertAtCaret("hi", -3, -3, "!").value).toBe("!hi");
  });
});

describe("paste-to-attach (P-UX-3)", () => {
  const png = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });

  it("takes files straight off the clipboard", () => {
    // TC-UX-09a
    expect(filesFromClipboard({ files: [png] })).toEqual([png]);
  });

  it("falls back to items, which is where some browsers put a screenshot", () => {
    const found = filesFromClipboard({
      files: [],
      items: [
        { kind: "string", getAsFile: () => null },
        { kind: "file", getAsFile: () => png },
      ],
    });
    expect(found).toEqual([png]);
  });

  it("returns nothing for an ordinary text paste, so the text is left alone", () => {
    // TC-UX-09b — the failure this prevents is a paste that vanishes.
    expect(filesFromClipboard({ items: [{ kind: "string", getAsFile: () => null }] }))
      .toEqual([]);
    expect(filesFromClipboard({})).toEqual([]);
    expect(filesFromClipboard(null)).toEqual([]);
    expect(filesFromClipboard(undefined)).toEqual([]);
  });

  it("drops an item that claims to be a file but yields none", () => {
    expect(filesFromClipboard({ items: [{ kind: "file", getAsFile: () => null }] }))
      .toEqual([]);
  });
});

describe("the emoji palette (P-UX-3)", () => {
  it("holds no duplicates, which would collide as React keys", () => {
    expect(new Set(ALL_EMOJI).size).toBe(ALL_EMOJI.length);
  });

  it("names every group, because the grid is labelled by it", () => {
    for (const group of EMOJI_GROUPS) {
      expect(group.name.trim()).not.toBe("");
      expect(group.emoji.length).toBeGreaterThan(0);
    }
  });
});
