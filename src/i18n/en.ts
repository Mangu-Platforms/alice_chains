/**
 * The English message catalogue (BUILD_PLAN S-20).
 *
 * Every user-visible string that this app *announces* — accessible names, live
 * announcements, status text — lives here rather than inline, so a translator
 * has one file to work from and a reviewer can see the whole vocabulary at
 * once.
 *
 * Values may be a string or a function of parameters. A function is used
 * wherever a translation needs to reorder or pluralise, because
 * `"You have " + n + " messages"` cannot be translated into a language that
 * puts the number elsewhere or inflects the noun.
 */
export const en = {
  // ── Accessible names for icon-only controls ───────────────────────────
  "a11y.closeSidebar": "Close the conversation list",
  "a11y.openSidebar": "Open the conversation list",
  "a11y.accountMenu": "Account menu",
  "a11y.conversationMenu": "Conversation options",
  "a11y.startCall": "Start a voice call",
  "a11y.startVideoCall": "Start a video call",
  "a11y.searchConversation": "Search this conversation",
  "a11y.sendMessage": "Send message",
  "a11y.attachFile": "Attach a file",
  "a11y.uploading": "Uploading",
  "a11y.messageActions": "Message actions",
  "a11y.addReaction": "Add a reaction",
  "a11y.replyToMessage": "Reply to this message",
  "a11y.cancelReply": "Cancel reply",
  "a11y.editMessage": "Edit message",
  "a11y.back": "Go back",
  "a11y.acceptRequest": (name: string) => `Accept the contact request from ${name}`,
  "a11y.declineRequest": (name: string) => `Decline the contact request from ${name}`,
  "a11y.messageContact": (name: string) => `Send a message to ${name}`,
  "a11y.removeContact": (name: string) => `Remove ${name} from your contacts`,
  "a11y.removeMember": (name: string) => `Remove ${name} from the group`,
  "a11y.reactWith": (emoji: string) => `React with ${emoji}`,
  "a11y.searchUsers": "Search for a user by name or email address",
  "a11y.searchMessages": "Search messages",
  "a11y.closeSearch": "Close search",
  "search.placeholderConversation": "Search this conversation…",
  "search.placeholderGlobal": "Search all conversations…",
  "search.scopeThisConversation": "This conversation",
  "search.scopeEverywhere": "Everywhere",
  "search.noResults": "No messages found",
  "search.prompt": (n: number) => `Type at least ${n} characters to search`,
  "search.resultCount": (n: number) =>
    n === 1 ? "1 message found" : `${n} messages found`,

  // ── Live announcements ────────────────────────────────────────────────
  // Read aloud by a screen reader as they change, so they are written as
  // complete sentences rather than fragments.
  "live.newMessageFrom": (name: string) => `New message from ${name}`,
  "live.newMessageIn": (conversation: string, name: string) =>
    `New message in ${conversation} from ${name}`,
  "live.messageSent": "Message sent",
  "live.conversationOpened": (name: string) => `Opened the conversation with ${name}`,
  "live.someoneIsTyping": (name: string) => `${name} is typing`,
  "live.connectionLost": "Connection lost. Reconnecting.",
  "live.connectionRestored": "Connection restored.",

  // ── Counts, which pluralise ───────────────────────────────────────────
  "count.unreadMessages": (n: number) =>
    n === 1 ? "1 unread message" : `${n} unread messages`,
  "count.reactions": (emoji: string, n: number, mine: boolean) =>
    `${emoji}, ${n === 1 ? "1 reaction" : `${n} reactions`}${mine ? ", including yours" : ""}`,
  "count.onlineNow": (n: number) => (n === 1 ? "1 person online" : `${n} people online`),
  "count.members": (n: number) => (n === 1 ? "1 member" : `${n} members`),

  // ── Status ────────────────────────────────────────────────────────────
  "status.online": "Online",
  "status.offline": "Offline",
  "status.messageDeleted": "Message deleted",
  "status.edited": "edited",
  "status.noMessagesYet": "No messages yet",
} as const;

export type MessageKey = keyof typeof en;
export type Catalogue = typeof en;
