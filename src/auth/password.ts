import { createHash, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  return createHash("sha256").update(password, "utf8").digest("base64");
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  try {
    const computed = hashPassword(password);
    if (computed.length !== passwordHash.length) return false;
    return timingSafeEqual(Buffer.from(computed, "utf8"), Buffer.from(passwordHash, "utf8"));
  } catch {
    return false;
  }
}
