/**
 * Composer behaviour that does not need a DOM (BUILD_PLAN P-UX-3).
 *
 * The composer's three new behaviours — a length counter, emoji insertion at
 * the caret, and paste-to-attach — are each a small decision made on every
 * keystroke or paste. Kept here as pure functions they can be tested in the
 * Node environment the suite already runs in, rather than needing a browser
 * that this repository has no dependency for.
 */
import { MAX_MESSAGE_LENGTH } from "@contracts/constants";

/**
 * How close to the cap the counter appears. Showing it from the first
 * character is noise — a member typing "ok" does not need to be told they have
 * 3998 characters left — and showing it only once the cap is breached is too
 * late to be useful, because by then the work of writing is already done.
 */
export const COUNTER_THRESHOLD = 200;

export interface CounterState {
  /** Whether to show the counter at all. */
  visible: boolean;
  /** Characters left before the cap; negative once it is exceeded. */
  remaining: number;
  /** True when the message is too long to send. */
  over: boolean;
}

export function counterState(length: number, max: number = MAX_MESSAGE_LENGTH): CounterState {
  const remaining = max - length;
  return {
    visible: remaining <= COUNTER_THRESHOLD,
    remaining,
    over: remaining < 0,
  };
}

export interface CaretInsertion {
  value: string;
  /** Where the caret should sit afterwards: just past what was inserted. */
  caret: number;
}

/**
 * Insert text at the caret, replacing any selection.
 *
 * A picker that always appends to the end is wrong the moment someone goes
 * back to fix a word — the emoji lands at the far end of the message rather
 * than where they were looking. A null selection means the field was never
 * focused, in which case appending is the only sensible reading.
 */
export function insertAtCaret(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  insert: string
): CaretInsertion {
  const start = clamp(selectionStart ?? value.length, 0, value.length);
  const end = clamp(selectionEnd ?? start, start, value.length);

  return {
    value: value.slice(0, start) + insert + value.slice(end),
    caret: start + insert.length,
  };
}

function clamp(n: number, low: number, high: number) {
  return Math.min(Math.max(n, low), high);
}

/** The shape of `ClipboardEvent.clipboardData`, narrowed to what is read here. */
export interface ClipboardLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; getAsFile(): File | null }> | null;
}

/**
 * The files carried by a paste, if any.
 *
 * Browsers disagree about where a pasted screenshot lands: some populate
 * `clipboardData.files`, others expose it only through `items` with
 * `kind === "file"`. Reading both means a paste works in either, and an
 * ordinary text paste — which has neither — comes back empty and is left
 * alone rather than being swallowed.
 */
export function filesFromClipboard(data: ClipboardLike | null | undefined): File[] {
  if (!data) return [];

  const direct = Array.from(data.files ?? []);
  if (direct.length > 0) return direct;

  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}
