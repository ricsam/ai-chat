import { beforeEach, describe, expect, test } from "vitest";

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://example.invalid/test";
  process.env.BETTER_AUTH_SECRET = "abcdefghijklmnopqrstuvwxyz123456";
  process.env.SETTINGS_ENCRYPTION_KEY = "abcdefghijklmnopqrstuvwxyz123456";
});

describe("secret envelopes", () => {
  test("round trips without exposing plaintext", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const encrypted = encryptSecret("top-secret")!;
    expect(encrypted).not.toContain("top-secret");
    expect(decryptSecret(encrypted)).toBe("top-secret");
  });

  test("detects tampering", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const encrypted = encryptSecret("top-secret")!;
    expect(() => decryptSecret(`${encrypted.slice(0, -2)}xx`)).toThrow();
  });
});
