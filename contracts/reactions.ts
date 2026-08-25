/**
 * The reaction palette.
 *
 * Shared so the server validates exactly what the client can offer. An open
 * emoji field would accept any 32-character string — including text — and turn
 * a reaction row into an unmoderated message with no length limit and no
 * authorship UI.
 */
export const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJI as readonly string[]).includes(value);
}

/** Most distinct emoji one member may put on one message. */
export const MAX_REACTIONS_PER_MEMBER_PER_MESSAGE = 6;
