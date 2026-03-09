import type { ProviderSnapshot } from "../types.js";

export async function getCursorSnapshot(now: Date = new Date()): Promise<ProviderSnapshot> {
  return {
    provider: "cursor",
    status: "unsupported",
    title: "Cursor Limits",
    updatedAt: now.toISOString(),
    message: "Unavailable.",
    source: "official-docs-status"
  };
}
