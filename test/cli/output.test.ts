import { describe, expect, it } from "vitest";
import { formatSnapshotOutput, renderTable } from "../../src/cli.js";
import type { SnapshotResponse } from "../../src/types.js";

function formatResetValue(value: string, includeDate: boolean): string {
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(includeDate
      ? {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        }
      : {})
  }).format(new Date(value));
}

const sampleSnapshot: SnapshotResponse = {
  generatedAt: "2026-03-09T10:00:00.000Z",
  providers: [
    {
      provider: "openai-codex",
      status: "ok",
      title: "OpenAI Codex Limits",
      remainingDisplay: "96.0% / 87.0%",
      usedDisplay: "4.0% / 13.0%",
      limitDisplay: "5h / 7d",
      resetAt: "2026-03-09T20:56:21.000Z",
      secondaryResetAt: "2026-03-15T07:19:13.000Z",
      updatedAt: "2026-03-09T10:00:00.000Z",
      message: "Local Codex session limits",
      source: "local-codex-session"
    },
    {
      provider: "openai-api",
      status: "ok",
      title: "OpenAI API Balance",
      remainingUsd: 90,
      usedUsd: 10,
      limitUsd: 100,
      unit: "usd",
      updatedAt: "2026-03-09T10:00:00.000Z",
      message: "Monthly budget minus official OpenAI organization costs.",
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
      updatedAt: "2026-03-09T10:00:00.000Z",
      message: "Official OpenRouter credits endpoint.",
      source: "official-api"
    },
    {
      provider: "cursor",
      status: "unsupported",
      title: "Cursor Limits",
      updatedAt: "2026-03-09T10:00:00.000Z",
      message: "Official personal-account limits API is currently unavailable.",
      source: "official-docs-status"
    }
  ]
};

describe("cli output", () => {
  it("renders a terminal table", () => {
    const table = renderTable(sampleSnapshot);
    expect(table).toContain("Provider");
    expect(table).toContain("Reset");
    expect(table).toContain("OpenAI API");
    expect(table).toContain("96.0% / 87.0%");
    expect(table).toContain("4.0% / 13.0%");
    expect(table).toContain("5h / 7d");
    expect(table).toContain(
      `${formatResetValue("2026-03-09T20:56:21.000Z", false)} / ${formatResetValue("2026-03-15T07:19:13.000Z", true)}`
    );
    expect(table).toContain("$90.00");
  });

  it("renders raw json output", () => {
    const output = formatSnapshotOutput(sampleSnapshot, true);
    const parsed = JSON.parse(output) as SnapshotResponse;
    expect(parsed.providers).toHaveLength(4);
    expect(parsed.generatedAt).toBe("2026-03-09T10:00:00.000Z");
  });
});
