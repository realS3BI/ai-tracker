import type { AppConfig } from "../config.js";
import type { ProviderSnapshot, SnapshotResponse } from "../types.js";
import { getCodexSnapshot } from "./codex.js";
import { getCursorSnapshot } from "./cursor.js";
import { getOpenAiApiSnapshot } from "./openaiApi.js";
import { getOpenRouterSnapshot } from "./openrouter.js";

async function safeProviderCall(
  provider: Promise<ProviderSnapshot>,
  fallback: ProviderSnapshot
): Promise<ProviderSnapshot> {
  try {
    return await provider;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return {
      ...fallback,
      message: `Provider exception: ${reason}`
    };
  }
}

export async function getSnapshot(config: AppConfig, now: Date = new Date()): Promise<SnapshotResponse> {
  const timestamp = now.toISOString();

  const [codex, openaiApi, openrouter, cursor] = await Promise.all([
    safeProviderCall(getCodexSnapshot(config, now), {
      provider: "openai-codex",
      status: "error",
      title: "OpenAI Codex Limits",
      updatedAt: timestamp,
      message: "Unable to fetch provider snapshot.",
      source: "local-codex-session"
    }),
    safeProviderCall(getOpenAiApiSnapshot(config, now), {
      provider: "openai-api",
      status: "error",
      title: "OpenAI API Balance",
      updatedAt: timestamp,
      message: "Unable to fetch provider snapshot.",
      source: "official-api"
    }),
    safeProviderCall(getOpenRouterSnapshot(config, now), {
      provider: "openrouter",
      status: "error",
      title: "OpenRouter Balance",
      updatedAt: timestamp,
      message: "Unable to fetch provider snapshot.",
      source: "official-api"
    }),
    safeProviderCall(getCursorSnapshot(now), {
      provider: "cursor",
      status: "error",
      title: "Cursor Limits",
      updatedAt: timestamp,
      message: "Unable to fetch provider snapshot.",
      source: "official-docs-status"
    })
  ]);

  return {
    generatedAt: timestamp,
    providers: [codex, openaiApi, openrouter, cursor]
  };
}
