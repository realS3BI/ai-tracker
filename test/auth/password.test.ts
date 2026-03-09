import argon2 from "argon2";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "../../src/auth/password.js";

describe("verifyPassword", () => {
  it("accepts correct password and rejects incorrect password", async () => {
    const hash = await argon2.hash("secret-123");
    await expect(verifyPassword("secret-123", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });
});
