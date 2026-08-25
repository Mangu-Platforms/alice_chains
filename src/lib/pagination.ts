/**
 * Loading older messages into the thread (BACKLOG H-9).
 *
 * `message.listByConversation` has taken `limit`/`offset` since it was
 * written; the client passed `limit: 50` and never moved it, so a
 * conversation longer than 50 messages was silently truncated with no way
 * back into its own history. These are the decisions around "load older" kept
 * as pure functions, because each one has an edge that is easy to get wrong
 * inside a component: when to offer another page, where the scrollbar should
 * land after older messages are prepended above what is already on screen,
 * and when loading history should NOT also yank the view down to the newest
 * message.
 */

/** How many messages the client asks for in one page. */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * Whether an older page is worth offering.
 *
 * The server returns at most `requested` rows; getting back fewer than that
 * means the conversation's start has been reached; getting back zero (an
 * empty conversation) is the same case. Getting back exactly `requested` is a
 * one-page-late false positive when a conversation's length lands exactly on
 * a page boundary — the next "Load older" click returns nothing further and
 * the affordance disappears then, rather than one click early hiding real
 * history.
 */
export function hasMoreOlderMessages(returned: number, requested: number): boolean {
  return returned > 0 && returned >= requested;
}

/**
 * Where the scrollbar should land after older messages are prepended above
 * what was already rendered.
 *
 * Prepending content above the visible viewport pushes everything down by
 * exactly the height that was added, so the fix is arithmetic, not a scroll
 * event to chase: measure the container's `scrollHeight` before the new
 * messages render and again after, and add the difference to the scroll
 * position that was already there. Getting this wrong is the entire
 * difference between "load older" feeling seamless and every click hurling
 * the reader back to a random point in the conversation.
 */
export function scrollTopAfterPrepend(
  previousScrollHeight: number,
  nextScrollHeight: number,
  previousScrollTop: number
): number {
  return previousScrollTop + (nextScrollHeight - previousScrollHeight);
}

/**
 * Whether the view should jump to the newest message.
 *
 * True when there was nothing on screen before (first open), or when the
 * newest message changed — a fresh arrival, or a different conversation
 * entirely. False when only older history was prepended: the newest message
 * is unchanged, so the reader's place in the thread should not move under
 * them. An edit or a reaction changes the array's contents but not which
 * message is newest, so those do not trigger it either — which is a quieter
 * thread, not just a side effect of this fix.
 */
export function shouldScrollToNewest(
  previous: readonly { id: number }[] | undefined,
  next: readonly { id: number }[] | undefined
): boolean {
  if (!next || next.length === 0) return false;
  if (!previous || previous.length === 0) return true;

  const previousNewest = previous[previous.length - 1]?.id;
  const nextNewest = next[next.length - 1]?.id;
  return previousNewest !== nextNewest;
}
