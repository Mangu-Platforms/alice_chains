import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  boolean,
  index,
  uniqueIndex,
  foreignKey,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";

// S-3. Until migration 0002 this file declared six tables with 0 foreign keys,
// 0 secondary indexes and 1 unique constraint, so referential integrity,
// idempotency and every hot-path lookup were unprotected — and the
// `onDuplicateKeyUpdate` / try-catch duplicate handlers scattered through the
// routers could never fire, because there was no unique key to conflict on.
// Constraint names are explicit so the generated SQL is deterministic.
// See DATA_MODEL.md 3.1-3.3 for the per-constraint justification.

// ─── Users (managed by auth) ──────────────────────────────────────
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  status: varchar("status", { length: 100 }).default("Hey there! I'm using Alice Chains."),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Conversations ────────────────────────────────────────────────
export const conversations = mysqlTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }),
    type: mysqlEnum("type", ["direct", "group"]).default("direct").notNull(),
    avatar: text("avatar"),
    createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("conversations_createdBy_idx").on(t.createdBy),
    // FK-10 RESTRICT, not CASCADE: a group must not evaporate when its creator
    // closes their account. Forces the explicit ownership transfer F-7 adds.
    foreignKey({
      name: "conversations_createdBy_users_id_fk",
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
  ]
);

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// ─── Conversation Participants ────────────────────────────────────
export const conversationParticipants = mysqlTable(
  "conversation_participants",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversationId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    lastReadAt: timestamp("lastReadAt"),
  },
  (t) => [
    uniqueIndex("cp_conversation_user_uq").on(t.conversationId, t.userId), // UQ-1
    index("cp_user_idx").on(t.userId), // IX-2
    foreignKey({
      name: "cp_conversationId_conversations_id_fk",
      columns: [t.conversationId],
      foreignColumns: [conversations.id],
    }).onDelete("cascade"), // FK-1
    // FK-2 CASCADE: the membership row IS the ACL, so a dangling one would
    // grant permission to a principal that no longer exists.
    foreignKey({
      name: "cp_userId_users_id_fk",
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ]
);

export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = typeof conversationParticipants.$inferInsert;

// ─── Messages ─────────────────────────────────────────────────────
export const messages = mysqlTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversationId", { mode: "number", unsigned: true }).notNull(),
    senderId: bigint("senderId", { mode: "number", unsigned: true }).notNull(),
    content: text("content").notNull(),
    type: mysqlEnum("type", ["text", "image", "file"]).default("text").notNull(),
    fileUrl: text("fileUrl"),
    replyToId: bigint("replyToId", { mode: "number", unsigned: true }),
    isEdited: boolean("isEdited").default(false).notNull(),
    // F-2. Deletion is soft: the row survives as a tombstone so a reply chain
    // keeps its shape and clients can render "message deleted" without a full
    // refetch. `content` is blanked at delete time, so the body is not
    // retrievable even though the row is.
    deletedAt: timestamp("deletedAt"),
    deletedBy: bigint("deletedBy", { mode: "number", unsigned: true }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt), // IX-1
    // Serves the paths that must skip tombstones: the sidebar's last-message
    // projection and the unread count.
    index("messages_conversation_active_idx").on(
      t.conversationId,
      t.deletedAt,
      t.createdAt
    ),
    index("messages_sender_idx").on(t.senderId), // IX-6
    index("messages_replyTo_idx").on(t.replyToId),
    foreignKey({
      name: "messages_conversationId_conversations_id_fk",
      columns: [t.conversationId],
      foreignColumns: [conversations.id],
    }).onDelete("cascade"), // FK-3
    // FK-4 RESTRICT: deleting a user must not silently erase a conversation's
    // history for everyone else in it.
    foreignKey({
      name: "messages_senderId_users_id_fk",
      columns: [t.senderId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    // FK-5 SET NULL: a deleted parent degrades the reply to a normal message
    // rather than cascade-deleting an unrelated author's post.
    foreignKey({
      name: "messages_replyToId_messages_id_fk",
      columns: [t.replyToId],
      foreignColumns: [t.id as AnyMySqlColumn],
    }).onDelete("set null"),
    // SET NULL, not RESTRICT: who deleted a message is useful provenance, but
    // it must not keep an account alive.
    foreignKey({
      name: "messages_deletedBy_users_id_fk",
      columns: [t.deletedBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),
  ]
);

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ─── Message Read Receipts ────────────────────────────────────────
export const messageReads = mysqlTable(
  "message_reads",
  {
    id: serial("id").primaryKey(),
    messageId: bigint("messageId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    readAt: timestamp("readAt").defaultNow().notNull(),
  },
  (t) => [
    // UQ-2. Its leading column also serves the receipt fetch, so the separately
    // listed IX-5 would be redundant and is deliberately omitted.
    uniqueIndex("message_reads_message_user_uq").on(t.messageId, t.userId),
    index("message_reads_user_idx").on(t.userId),
    foreignKey({
      name: "message_reads_messageId_messages_id_fk",
      columns: [t.messageId],
      foreignColumns: [messages.id],
    }).onDelete("cascade"), // FK-6
    foreignKey({
      name: "message_reads_userId_users_id_fk",
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"), // FK-7
  ]
);

export type MessageRead = typeof messageReads.$inferSelect;

// ─── Message Reactions (F-3) ──────────────────────────────────────────────
//
// One row per (message, member, emoji). The unique key is what makes the
// toggle honest: tapping the same emoji twice removes the row rather than
// stacking a second one, and two taps racing each other cannot both insert.
export const messageReactions = mysqlTable(
  "message_reactions",
  {
    id: serial("id").primaryKey(),
    messageId: bigint("messageId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    // varchar(32) holds a grapheme cluster with ZWJ sequences and skin-tone
    // modifiers — "👨‍👩‍👧‍👦" is 25 bytes on its own. utf8mb4 is required; utf8mb3
    // would truncate it.
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("message_reactions_msg_user_emoji_uq").on(t.messageId, t.userId, t.emoji),
    index("message_reactions_message_idx").on(t.messageId),
    foreignKey({
      name: "message_reactions_messageId_messages_id_fk",
      columns: [t.messageId],
      foreignColumns: [messages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "message_reactions_userId_users_id_fk",
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ]
);

export type MessageReaction = typeof messageReactions.$inferSelect;

// ─── Attachments (F-4) ────────────────────────────────────────────────────
//
// `messageId` is nullable because an upload is created BEFORE the message that
// references it: the client asks for an upload target, puts the bytes, then
// sends a message naming the attachment. A row that never gets a message is an
// abandoned upload, reaped after 24 hours.
//
// This deprecates `messages.fileUrl`, which is kept and no longer written; it
// is dropped in a later migration, after a backfill.
export const attachments = mysqlTable(
  "attachments",
  {
    id: serial("id").primaryKey(),
    messageId: bigint("messageId", { mode: "number", unsigned: true }),
    uploaderId: bigint("uploaderId", { mode: "number", unsigned: true }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    // 127 chars is the RFC 6838 practical maximum.
    mimeType: varchar("mimeType", { length: 127 }).notNull(),
    byteSize: bigint("byteSize", { mode: "number", unsigned: true }).notNull(),
    width: bigint("width", { mode: "number", unsigned: true }),
    height: bigint("height", { mode: "number", unsigned: true }),
    checksumSha256: varchar("checksumSha256", { length: 64 }),
    status: mysqlEnum("status", ["pending", "ready", "failed", "quarantined"])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("attachments_storageKey_uq").on(t.storageKey),
    index("attachments_message_idx").on(t.messageId),
    index("attachments_uploader_created_idx").on(t.uploaderId, t.createdAt),
    foreignKey({
      name: "attachments_messageId_messages_id_fk",
      columns: [t.messageId],
      foreignColumns: [messages.id],
    }).onDelete("cascade"),
    // RESTRICT, like messages.senderId: deleting an account must go through an
    // explicit purge rather than silently orphaning stored bytes.
    foreignKey({
      name: "attachments_uploaderId_users_id_fk",
      columns: [t.uploaderId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
  ]
);

export type Attachment = typeof attachments.$inferSelect;

// ─── Contacts (Friend relationships) ──────────────────────────────
export const contacts = mysqlTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    contactUserId: bigint("contactUserId", { mode: "number", unsigned: true }).notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "blocked"]).default("pending").notNull(),
    nickname: varchar("nickname", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("contacts_user_contact_uq").on(t.userId, t.contactUserId), // UQ-3
    index("contacts_contactUser_status_idx").on(t.contactUserId, t.status), // IX-3
    index("contacts_user_status_idx").on(t.userId, t.status), // IX-4
    foreignKey({
      name: "contacts_userId_users_id_fk",
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"), // FK-8
    foreignKey({
      name: "contacts_contactUserId_users_id_fk",
      columns: [t.contactUserId],
      foreignColumns: [users.id],
    }).onDelete("cascade"), // FK-9
  ]
);

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ─── Sessions (server-side record, SEC-C-05/06) ───────────────────────────
//
// The session cookie is a self-contained signed payload, so before S-17 there
// was nothing to revoke: `/api/logout` cleared the caller's own cookie and a
// copy taken beforehand stayed valid on every other device for the full seven
// days. This table is the revocation point. The payload carries `sid`; the
// server resolves it here on every request.
export const sessions = mysqlTable("sessions", {
  // A 32-byte random value, base64url — 43 characters.
  id: varchar("id", { length: 43 }).primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Drives the 24-hour idle expiry. Refreshed at most once every 5 minutes so
  // an active session does not cost a write on every request.
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  // Set by logout and by administrative deactivation (S-18). Non-null means the
  // session is dead on every device, immediately.
  revokedAt: timestamp("revokedAt"),
  // A hash, never the raw header: useful for "you signed in from a new device"
  // without retaining a fingerprint.
  uaHash: varchar("uaHash", { length: 64 }),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;
