import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";

describe("verifyPassword", () => {
  it("accepts correct password and rejects incorrect password", () => {
    const hash = hashPassword("secret-123");
    expect(verifyPassword("secret-123", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });
});
