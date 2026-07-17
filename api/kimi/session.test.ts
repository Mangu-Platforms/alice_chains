import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "mysql://user:pass@localhost/test";
  process.env.VITE_KIMI_AUTH_URL = "https://auth.example.com";
  process.env.VITE_APP_ID = "test-app";
  process.env.APP_SECRET = "test-secret";
  process.env.JWT_SECRET = "a-long-test-signing-secret";
});

describe("signed sessions", () => {
  it("verifies an authentic token and rejects tampering", async () => {
    const { createSessionToken, verifySessionToken } = await import("./session");
    const token = createSessionToken({ userId: 42, unionId: "alice", name: "Alice" });
    expect(verifySessionToken(token)?.userId).toBe(42);
    expect(verifySessionToken(`${token}tampered`)).toBeUndefined();
  });
});
