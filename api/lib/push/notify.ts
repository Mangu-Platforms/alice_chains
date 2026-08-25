/**
 * Deciding who gets a notification for a new message.
 *
 * The rule is: every other member of the conversation who is not currently
 * connected. Someone with the app open already saw it arrive over the socket,
 * and a notification for a message they are looking at is noise.
 */
import { getOnlineUsers } from "../../socket";
import { participantIds } from "../realtime";
import { blockedWith } from "../authz";
import { sendToUsers, pushIsConfigured } from "./send";

const PREVIEW_LENGTH = 140;

export interface MessageNotification {
  conversationId: number;
  senderId: number;
  senderName: string | null;
  conversationName: string | null;
  isGroup: boolean;
  content: string;
  hasAttachment: boolean;
}

/**
 * Notify the members who are not watching. Never throws.
 *
 * Delivery failure must not fail the message that triggered it, so every error
 * is swallowed here rather than propagating into the send path.
 */
export async function notifyNewMessage(input: MessageNotification): Promise<void> {
  if (!pushIsConfigured()) return;

  try {
    const [members, blocked] = await Promise.all([
      participantIds(input.conversationId),
      blockedWith(input.senderId),
    ]);

    const online = getOnlineUsers();
    const recipients = members.filter(
      (id) => id !== input.senderId && !online.has(id) && !blocked.has(id)
    );

    if (recipients.length === 0) return;

    const sender = input.senderName || "Someone";
    const preview = input.content.trim();

    await sendToUsers(recipients, {
      // In a group the title names the group and the body names the speaker,
      // because "Bob" alone does not say where to look.
      title: input.isGroup ? input.conversationName || "Group chat" : sender,
      body: input.isGroup
        ? `${sender}: ${bodyFor(preview, input.hasAttachment)}`
        : bodyFor(preview, input.hasAttachment),
      // Deep link, so tapping lands in the conversation rather than the app's
      // front page.
      url: `/chat?c=${input.conversationId}`,
      // One tag per conversation: a burst of messages collapses into the
      // latest instead of stacking.
      tag: `conversation-${input.conversationId}`,
    });
  } catch (error) {
    console.error("Push notification failed:", error);
  }
}

function bodyFor(content: string, hasAttachment: boolean): string {
  if (!content) return hasAttachment ? "Sent an attachment" : "Sent a message";
  const trimmed =
    content.length > PREVIEW_LENGTH ? `${content.slice(0, PREVIEW_LENGTH - 1)}…` : content;
  return hasAttachment ? `${trimmed} (with an attachment)` : trimmed;
}
