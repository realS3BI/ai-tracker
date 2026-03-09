import type { ProviderSnapshot, SnapshotResponse } from "./types.js";

const TABLE_HEADERS = ["Provider", "Status", "Remaining", "Used", "Limit", "Reset", "Note"] as const;

export interface SnapshotSummaryCard {
  provider: string;
  remaining: string;
}

export function formatMoney(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(value);
}

export function formatMetric(displayValue: string | undefined, usdValue: number | undefined): string {
  if (displayValue) {
    return displayValue;
  }
  return formatMoney(usdValue);
}

function formatResetValue(value: string | undefined, includeDate: boolean): string {
  if (!value) {
    return "-";
  }

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

export function formatReset(primaryResetAt: string | undefined, secondaryResetAt: string | undefined): string {
  if (primaryResetAt && secondaryResetAt) {
    return `${formatResetValue(primaryResetAt, false)} / ${formatResetValue(secondaryResetAt, true)}`;
  }

  return formatResetValue(primaryResetAt ?? secondaryResetAt, true);
}

export function providerLabel(provider: ProviderSnapshot): string {
  switch (provider.provider) {
    case "openai-codex":
      return "OpenAI Codex";
    case "openai-api":
      return "OpenAI API";
    case "openrouter":
      return "OpenRouter";
    case "cursor":
      return "Cursor";
    default:
      return provider.provider;
  }
}

export function snapshotTableHeaders(): string[] {
  return [...TABLE_HEADERS];
}

export function snapshotTableRows(snapshot: SnapshotResponse): string[][] {
  return snapshot.providers.map((provider) => [
    providerLabel(provider),
    provider.status,
    formatMetric(provider.remainingDisplay, provider.remainingUsd),
    formatMetric(provider.usedDisplay, provider.usedUsd),
    formatMetric(provider.limitDisplay, provider.limitUsd),
    formatReset(provider.resetAt, provider.secondaryResetAt),
    provider.message
  ]);
}

export function snapshotSummaryCards(snapshot: SnapshotResponse): SnapshotSummaryCard[] {
  return snapshot.providers.map((provider) => ({
    provider: providerLabel(provider),
    remaining: formatMetric(provider.remainingDisplay, provider.remainingUsd)
  }));
}

export function renderTable(snapshot: SnapshotResponse): string {
  const headers = snapshotTableHeaders();
  const rows = snapshotTableRows(snapshot);

  const widths = headers.map((header, columnIndex) => {
    return Math.max(header.length, ...rows.map((row) => row[columnIndex].length));
  });

  const pad = (value: string, width: number) => value.padEnd(width, " ");
  const divider = widths.map((width) => "-".repeat(width)).join("-+-");

  const tableLines = [
    headers.map((header, columnIndex) => pad(header, widths[columnIndex])).join(" | "),
    divider,
    ...rows.map((row) => row.map((cell, columnIndex) => pad(cell, widths[columnIndex])).join(" | "))
  ];

  return [`Generated: ${snapshot.generatedAt}`, ...tableLines].join("\n");
}
