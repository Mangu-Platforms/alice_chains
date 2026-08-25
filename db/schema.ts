import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  boolean,
} from "drizzle-orm/mysql-core";

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
export const conversations = mysqlTable("conversations", {
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
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// ─── Conversation Participants ────────────────────────────────────
export const conversationParticipants = mysqlTable("conversation_participants", {
  id: serial("id").primaryKey(),
  conversationId: bigint("conversationId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  lastReadAt: timestamp("lastReadAt"),
});

export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = typeof conversationParticipants.$inferInsert;

// ─── Messages ─────────────────────────────────────────────────────
export const messages = mysqlTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: bigint("conversationId", { mode: "number", unsigned: true }).notNull(),
  senderId: bigint("senderId", { mode: "number", unsigned: true }).notNull(),
  content: text("content").notNull(),
  type: mysqlEnum("type", ["text", "image", "file"]).default("text").notNull(),
  fileUrl: text("fileUrl"),
  replyToId: bigint("replyToId", { mode: "number", unsigned: true }),
  isEdited: boolean("isEdited").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ─── Message Read Receipts ────────────────────────────────────────
export const messageReads = mysqlTable("message_reads", {
  id: serial("id").primaryKey(),
  messageId: bigint("messageId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  readAt: timestamp("readAt").defaultNow().notNull(),
});

export type MessageRead = typeof messageReads.$inferSelect;

// ─── Contacts (Friend relationships) ──────────────────────────────
export const contacts = mysqlTable("contacts", {
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
});

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
