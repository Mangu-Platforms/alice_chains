/**
 * A small emoji palette (BUILD_PLAN P-UX-3).
 *
 * Hand-curated rather than pulled in. A full emoji package is several hundred
 * kilobytes of data plus an index, all of it on the critical path unless it is
 * split out — and this repository's working agreement makes adding a
 * dependency a decision rather than a side effect. A few dozen of the ones
 * people actually use covers the case; a member who wants something else has
 * their operating system's own picker, which is better than any in-page one.
 */
export interface EmojiGroup {
  name: string;
  emoji: readonly string[];
}

export const EMOJI_GROUPS: readonly EmojiGroup[] = [
  {
    name: "Smileys",
    emoji: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂",
      "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "😘",
      "😋", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥳",
      "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "😣",
      "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠",
    ],
  },
  {
    name: "Gestures",
    emoji: [
      "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤘",
      "👏", "🙌", "🤝", "🙏", "💪", "👋", "🖐️", "✋",
    ],
  },
  {
    name: "Hearts",
    emoji: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💯"],
  },
  {
    name: "Objects",
    emoji: [
      "🔥", "✨", "🎉", "🎊", "🎁", "🏆", "⭐", "🌟",
      "💡", "📌", "📎", "📅", "⏰", "☕", "🍕", "🍺",
    ],
  },
] as const;

/** Every emoji in the palette, flattened. */
export const ALL_EMOJI: readonly string[] = EMOJI_GROUPS.flatMap((g) => g.emoji);

