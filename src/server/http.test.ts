import { beforeEach, describe, expect, test } from "vitest";

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://example.invalid/test";
  process.env.BETTER_AUTH_SECRET = "abcdefghijklmnopqrstuvwxyz123456";
  process.env.SETTINGS_ENCRYPTION_KEY = "abcdefghijklmnopqrstuvwxyz123456";
  process.env.ALLOW_PRIVATE_EGRESS = "false";
  process.env.ALLOW_INSECURE_HTTP = "false";
});

describe("outbound URL policy", () => {
  test("requires HTTPS", async () => {
    const { assertSafeOutboundUrl } = await import("./http");
    await expect(assertSafeOutboundUrl("http://example.com")).rejects.toThrow(
      "HTTPS is required",
    );
  });

  test("rejects credentials in URL", async () => {
    const { assertSafeOutboundUrl } = await import("./http");
    await expect(
      assertSafeOutboundUrl("https://user:pass@example.com"),
    ).rejects.toThrow("Credentials in URLs");
  });

  test("rejects loopback", async () => {
    const { assertSafeOutboundUrl } = await import("./http");
    await expect(
      assertSafeOutboundUrl("https://127.0.0.1/mcp"),
    ).rejects.toThrow("blocked");
  });
});
