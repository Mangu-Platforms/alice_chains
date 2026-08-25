/**
 * The send outbox (BUILD_PLAN P-UX-2).
 *
 * A message composed while the socket is down was lost silently: the composer
 * cleared, `emit` went nowhere, and nothing ever said so. This holds those
 * sends and replays them on reconnect.
 *
 * In memory only, deliberately. Persisting to `localStorage` would mean a
 * message reappearing days later, sent into a conversation whose context has
 * moved on, from a session that may since have been revoked — the failure mode
 * is worse than losing the draft. A reload discards the queue, and the member
 * still has the text on screen until it is sent.
 *
 * Exactly-once is the whole point, so it is worth stating how it is achieved:
 * every send carries a client-generated `tempId`, the server echoes it back on
 * the resulting `newMessage`, and an entry is removed when its `tempId` returns.
 * A replay that the server already applied is therefore acknowledged rather
 * than duplicated.
 */

export interface OutboxEntry {
  tempId: string;
  conversationId: number;
  content: string;
  replyToId?: number;
  queuedAt: number;
  attempts: number;
}

export type OutboxListener = (entries: OutboxEntry[]) => void;

/**
 * Give up after this many attempts. A message that has failed repeatedly is
 * more likely to be rejected than unlucky — over the length cap, into a
 * conversation the member was removed from — and retrying it forever would
 * block everything queued behind it.
 */
export const MAX_SEND_ATTEMPTS = 5;

/** Nothing is held longer than this; a very old message is not worth sending. */
export const MAX_QUEUE_AGE_MS = 10 * 60 * 1000;

export class Outbox {
  private entries: OutboxEntry[] = [];
  private listeners = new Set<OutboxListener>();
  private sequence = 0;

  /** A tempId unique within this tab. */
  nextTempId(): string {
    this.sequence += 1;
    return `t-${Date.now().toString(36)}-${this.sequence}`;
  }

  subscribe(listener: OutboxListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  snapshot(): OutboxEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  size(): number {
    return this.entries.length;
  }

  /** Queue a send. Returns the entry, whose tempId the caller emits. */
  enqueue(input: {
    conversationId: number;
    content: string;
    replyToId?: number;
    tempId?: string;
    now?: number;
  }): OutboxEntry {
    const entry: OutboxEntry = {
      tempId: input.tempId ?? this.nextTempId(),
      conversationId: input.conversationId,
      content: input.content,
      replyToId: input.replyToId,
      queuedAt: input.now ?? Date.now(),
      attempts: 0,
    };

    this.entries.push(entry);
    this.notify();
    return entry;
  }

  /**
   * Remove an entry the server has acknowledged.
   *
   * Returns whether anything was removed, so a caller can tell an echo of its
   * own queued send from a message that arrived some other way.
   */
  acknowledge(tempId: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.tempId !== tempId);
    if (this.entries.length !== before) {
      this.notify();
      return true;
    }
    return false;
  }

  /** Remove an entry the server refused. */
  fail(tempId: string): OutboxEntry | undefined {
    const entry = this.entries.find((e) => e.tempId === tempId);
    this.entries = this.entries.filter((e) => e.tempId !== tempId);
    if (entry) this.notify();
    return entry;
  }

  /**
   * The entries to replay, oldest first, dropping anything stale or exhausted.
   *
   * Order is preserved: messages sent while offline should arrive in the order
   * they were written, not the order the network happens to deliver them.
   */
  takeForReplay(now = Date.now()): OutboxEntry[] {
    const expired = this.entries.filter(
      (entry) => now - entry.queuedAt > MAX_QUEUE_AGE_MS || entry.attempts >= MAX_SEND_ATTEMPTS
    );

    if (expired.length > 0) {
      const dropped = new Set(expired.map((e) => e.tempId));
      this.entries = this.entries.filter((entry) => !dropped.has(entry.tempId));
    }

    for (const entry of this.entries) entry.attempts += 1;
    if (expired.length > 0 || this.entries.length > 0) this.notify();

    return this.entries.map((entry) => ({ ...entry }));
  }

  /** Entries dropped for being stale or exhausted, so the UI can say so. */
  drain(now = Date.now()): OutboxEntry[] {
    const expired = this.entries.filter(
      (entry) => now - entry.queuedAt > MAX_QUEUE_AGE_MS || entry.attempts >= MAX_SEND_ATTEMPTS
    );
    if (expired.length === 0) return [];

    const dropped = new Set(expired.map((e) => e.tempId));
    this.entries = this.entries.filter((entry) => !dropped.has(entry.tempId));
    this.notify();
    return expired;
  }

  clear(): void {
    this.entries = [];
    this.notify();
  }

  /** Everything queued for one conversation, for rendering it as pending. */
  forConversation(conversationId: number): OutboxEntry[] {
    return this.entries.filter((entry) => entry.conversationId === conversationId);
  }
}
