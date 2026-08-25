/**
 * BUILD_PLAN F-4 — the SigV4 implementation, checked against AWS's own
 * published values rather than against itself.
 *
 * A signing bug does not fail loudly: it produces a URL that looks right and
 * returns 403 from the object store, which is easy to misread as a credential
 * or bucket-policy problem. These pin the algorithm.
 */
import { describe, expect, it } from "vitest";
import { amzDates, presign, signingKey, uriEncode } from "./sigv4";

describe("SigV4 primitives", () => {
  // AWS "Examples of the Complete Version 4 Signing Process", derived key.
  it("derives the documented signing key", () => {
    const key = signingKey(
      "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      "20150830",
      "us-east-1",
      "iam"
    );
    expect(key.toString("hex")).toBe(
      "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9"
    );
  });

  it("encodes per RFC 3986, not per encodeURIComponent", () => {
    // The characters encodeURIComponent leaves alone and AWS does not. Getting
    // this wrong signs one string and sends another.
    expect(uriEncode("!'()*")).toBe("%21%27%28%29%2A");
    expect(uriEncode("a-b_c.d~e")).toBe("a-b_c.d~e");
    expect(uriEncode("a b")).toBe("a%20b");
    expect(uriEncode("é")).toBe("%C3%A9");
  });

  it("encodes the slash only when asked", () => {
    expect(uriEncode("a/b")).toBe("a%2Fb");
    expect(uriEncode("/bucket/key", false)).toBe("/bucket/key");
  });

  it("formats the two AWS date forms", () => {
    const { amzDate, dateStamp } = amzDates(new Date("2026-08-25T19:30:45.123Z"));
    expect(amzDate).toBe("20260825T193045Z");
    expect(dateStamp).toBe("20260825");
  });
});

describe("presigned URLs", () => {
  const base = {
    endpoint: "http://localhost:9000",
    path: "/alice-attachments/7/2026-08/deadbeefdeadbeefdeadbeefdeadbeef.png",
    region: "us-east-1",
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin",
    expiresIn: 900,
    now: new Date("2026-08-25T19:30:45.000Z"),
  } as const;

  it("carries every parameter the service requires", () => {
    const url = new URL(presign({ ...base, method: "PUT" }));

    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toBe(
      "minioadmin/20260825/us-east-1/s3/aws4_request"
    );
    expect(url.searchParams.get("X-Amz-Date")).toBe("20260825T193045Z");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps the object path unescaped, as the canonical request requires", () => {
    const url = presign({ ...base, method: "GET" });
    expect(url).toContain(
      "/alice-attachments/7/2026-08/deadbeefdeadbeefdeadbeefdeadbeef.png?"
    );
  });

  it("is deterministic for the same inputs", () => {
    expect(presign({ ...base, method: "PUT" })).toBe(presign({ ...base, method: "PUT" }));
  });

  it("changes the signature when anything signed changes", () => {
    const put = presign({ ...base, method: "PUT" });
    const signatureOf = (u: string) => new URL(u).searchParams.get("X-Amz-Signature");

    expect(signatureOf(presign({ ...base, method: "GET" }))).not.toBe(signatureOf(put));
    expect(signatureOf(presign({ ...base, method: "PUT", expiresIn: 901 }))).not.toBe(
      signatureOf(put)
    );
    expect(signatureOf(presign({ ...base, method: "PUT", path: "/other/key" }))).not.toBe(
      signatureOf(put)
    );
    expect(
      signatureOf(presign({ ...base, method: "PUT", secretAccessKey: "other" }))
    ).not.toBe(signatureOf(put));
    expect(
      signatureOf(presign({ ...base, method: "PUT", now: new Date("2026-08-26T19:30:45Z") }))
    ).not.toBe(signatureOf(put));
  });

  it("signs response-header overrides, so they cannot be tampered with", () => {
    const withOverrides = presign({
      ...base,
      method: "GET",
      query: {
        "response-content-type": "image/png",
        "response-content-disposition": 'inline; filename="a.png"',
      },
    });
    const url = new URL(withOverrides);

    expect(url.searchParams.get("response-content-type")).toBe("image/png");
    expect(url.searchParams.get("X-Amz-Signature")).not.toBe(
      new URL(presign({ ...base, method: "GET" })).searchParams.get("X-Amz-Signature")
    );
  });

  it("sorts the canonical query by encoded key", () => {
    const url = presign({
      ...base,
      method: "GET",
      query: { zebra: "1", alpha: "2" },
    });
    const query = url.split("?")[1];
    const keys = query.split("&").map((p) => p.split("=")[0]);
    const withoutSignature = keys.filter((k) => k !== "X-Amz-Signature");

    expect(withoutSignature).toEqual([...withoutSignature].sort());
  });
});
