import { describe, expect, it } from "vitest";
import { mergeProviderSnapshots } from "../../src/cli.js";
import type { ProviderSnapshot, SnapshotResponse } from "../../src/types.js";

const remoteSnapshot: SnapshotResponse = {
  generatedAt: "2026-03-10T09:00:00.000Z",
  providers: [
    {
      provider: "openai-codex",
      status: "ok",
      title: "OpenAI Codex Limits",
      remainingDisplay: "88%/70%",
      usedDisplay: "12%/30%",
      limitDisplay: "5h/7d",
      updatedAt: "2026-03-10T09:00:00.000Z",
      message: "Backend Codex data",
      source: "codex-cache"
    },
    {
      provider: "openai-api",
      status: "ok",
      title: "OpenAI API Balance",
      remainingUsd: 90,
      usedUsd: 10,
      limitUsd: 100,
      unit: "usd",
      updatedAt: "2026-03-10T09:00:00.000Z",
      message: "Backend OpenAI data",
      source: "official-api"
    },
    {
      provider: "openrouter",
      status: "ok",
      title: "OpenRouter Balance",
      remainingUsd: 8,
      usedUsd: 2,
      limitUsd: 10,
      unit: "usd",
      updatedAt: "2026-03-10T09:00:00.000Z",
      message: "Backend OpenRouter data",
      source: "official-api"
    },
    {
      provider: "cursor",
      status: "ok",
      title: "Cursor Limits",
      remainingUsd: 4,
      usedUsd: 16,
      limitUsd: 20,
      unit: "usd",
      updatedAt: "2026-03-10T09:00:00.000Z",
      message: "Backend Cursor data",
      source: "official-dashboard-api"
    }
  ]
};

describe("mergeProviderSnapshots", () => {
  it("prefers local provider data over backend values", () => {
    const localProviders: ProviderSnapshot[] = [
      {
        provider: "openai-codex",
        status: "ok",
        title: "OpenAI Codex Limits",
        remainingDisplay: "96%/87%",
        usedDisplay: "4%/13%",
        limitDisplay: "5h/7d",
        updatedAt: "2026-03-10T10:00:00.000Z",
        message: "Local Codex session limits",
        source: "local-codex-session"
      },
      {
        provider: "cursor",
        status: "ok",
        title: "Cursor Limits",
        remainingUsd: 5,
        usedUsd: 15,
        limitUsd: 20,
        unit: "usd",
        updatedAt: "2026-03-10T10:00:00.000Z",
        message: "Local Cursor data",
        source: "official-dashboard-api"
      }
    ];

    const merged = mergeProviderSnapshots(remoteSnapshot, localProviders, "2026-03-10T10:00:00.000Z");

    expect(merged.providers.find((provider) => provider.provider === "openai-codex")?.message).toBe(
      "Local Codex session limits"
    );
    expect(merged.providers.find((provider) => provider.provider === "cursor")?.message).toBe("Local Cursor data");
    expect(merged.providers.find((provider) => provider.provider === "openai-api")?.message).toBe("Backend OpenAI data");
  });

  it("fills missing backend providers with actionable placeholders", () => {
    const merged = mergeProviderSnapshots(
      null,
      [
        {
          provider: "openai-codex",
          status: "unsupported",
          title: "OpenAI Codex Limits",
          updatedAt: "2026-03-10T10:00:00.000Z",
          message: "No local Codex data",
          source: "local-codex-session"
        }
      ],
      "2026-03-10T10:00:00.000Z",
      "No CLI token found."
    );

    expect(merged.providers).toHaveLength(4);
    expect(merged.providers.find((provider) => provider.provider === "openai-api")?.message).toBe("No CLI token found.");
    expect(merged.providers.find((provider) => provider.provider === "openai-codex")?.message).toBe("No local Codex data");
  });
});
