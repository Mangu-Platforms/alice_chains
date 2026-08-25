/**
 * BUILD_PLAN P-UX-2 — the send outbox.
 *
 * Cases: TC-UX-04…06. A message composed while the socket was down was lost
 * silently: the composer cleared and `emit` went nowhere.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_QUEUE_AGE_MS, MAX_SEND_ATTEMPTS, Outbox } from "./outbox";

describe("the outbox (P-UX-2)", () => {
  let outbox: Outbox;

  beforeEach(() => {
    outbox = new Outbox();
  });

  it("holds a send made while offline", () => {
    outbox.enqueue({ conversationId: 1, content: "queued" });
    expect(outbox.size()).toBe(1);
  });

  it("replays in the order the messages were written", () => {
    outbox.enqueue({ conversationId: 1, content: "first" });
    outbox.enqueue({ conversationId: 1, content: "second" });
    outbox.enqueue({ conversationId: 1, content: "third" });

    expect(outbox.takeForReplay().map((e) => e.content)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  // TC-UX-05 — exactly once.
  it("removes an entry the server acknowledges by tempId", () => {
    const entry = outbox.enqueue({ conversationId: 1, content: "one" });

    expect(outbox.acknowledge(entry.tempId)).toBe(true);
    expect(outbox.size()).toBe(0);
  });

  it("acknowledging twice is a no-op, so a replay cannot duplicate", () => {
    const entry = outbox.enqueue({ conversationId: 1, content: "one" });

    expect(outbox.acknowledge(entry.tempId)).toBe(true);
    // The same message echoed again — a replay the server had already applied.
    expect(outbox.acknowledge(entry.tempId)).toBe(false);
    expect(outbox.size()).toBe(0);
  });

  it("ignores an acknowledgement for a message it never queued", () => {
    outbox.enqueue({ conversationId: 1, content: "mine" });
    expect(outbox.acknowledge("someone-elses-tempId")).toBe(false);
    expect(outbox.size()).toBe(1);
  });

  it("issues a distinct tempId every time", () => {
    const ids = new Set(Array.from({ length: 100 }, () => outbox.nextTempId()));
    expect(ids.size).toBe(100);
  });

  it("removes an entry the server refused, and hands it back", () => {
    const entry = outbox.enqueue({ conversationId: 1, content: "rejected" });

    const failed = outbox.fail(entry.tempId);
    expect(failed?.content).toBe("rejected");
    expect(outbox.size()).toBe(0);
  });

  // TC-UX-06 — a message that cannot be sent must not block the queue.
  it("gives up after too many attempts", () => {
    outbox.enqueue({ conversationId: 1, content: "doomed" });

    for (let i = 0; i < MAX_SEND_ATTEMPTS; i += 1) outbox.takeForReplay();

    expect(outbox.takeForReplay()).toHaveLength(0);
    expect(outbox.size()).toBe(0);
  });

  it("does not hold a message longer than the maximum age", () => {
    const longAgo = Date.now() - MAX_QUEUE_AGE_MS - 1000;
    outbox.enqueue({ conversationId: 1, content: "stale", now: longAgo });
    outbox.enqueue({ conversationId: 1, content: "fresh" });

    expect(outbox.takeForReplay().map((e) => e.content)).toEqual(["fresh"]);
  });

  it("reports what it dropped, so the member can be told", () => {
    const longAgo = Date.now() - MAX_QUEUE_AGE_MS - 1000;
    outbox.enqueue({ conversationId: 1, content: "stale", now: longAgo });

    const dropped = outbox.drain();
    expect(dropped.map((e) => e.content)).toEqual(["stale"]);
    expect(outbox.size()).toBe(0);
  });

  it("keeps each conversation's pending messages separate", () => {
    outbox.enqueue({ conversationId: 1, content: "in one" });
    outbox.enqueue({ conversationId: 2, content: "in two" });

    expect(outbox.forConversation(1).map((e) => e.content)).toEqual(["in one"]);
    expect(outbox.forConversation(2).map((e) => e.content)).toEqual(["in two"]);
  });

  it("carries a reply target through the queue", () => {
    outbox.enqueue({ conversationId: 1, content: "a reply", replyToId: 42 });
    expect(outbox.takeForReplay()[0].replyToId).toBe(42);
  });

  it("tells subscribers whenever the queue changes", () => {
    const listener = vi.fn();
    outbox.subscribe(listener);
    // Called once immediately with the current state, so a subscriber never
    // renders an empty queue that is not empty.
    expect(listener).toHaveBeenCalledTimes(1);

    const entry = outbox.enqueue({ conversationId: 1, content: "x" });
    expect(listener).toHaveBeenCalledTimes(2);

    outbox.acknowledge(entry.tempId);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("stops telling a subscriber that has unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = outbox.subscribe(listener);
    unsubscribe();

    outbox.enqueue({ conversationId: 1, content: "x" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("hands out copies, so a caller cannot mutate the queue by accident", () => {
    outbox.enqueue({ conversationId: 1, content: "original" });

    const snapshot = outbox.snapshot();
    snapshot[0].content = "tampered";

    expect(outbox.snapshot()[0].content).toBe("original");
  });
});
