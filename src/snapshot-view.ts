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
    maximumFractionDigits: 2
  }).format(value);
}

export function formatMetric(displayValue: string | undefined, usdValue: number | undefined): string {
  if (displayValue) {
    return displayValue;
  }
  return formatMoney(usdValue);
}

const RESET_FORMATTER = new Intl.DateTimeFormat("de-AT", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const TIME_FORMATTER = new Intl.DateTimeFormat("de-AT", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function getFormattedParts(formatter: Intl.DateTimeFormat, value: string): Map<string, string> {
  return new Map(formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
}

export function formatResetValue(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const partMap = getFormattedParts(RESET_FORMATTER, value);
  const day = partMap.get("day");
  const month = partMap.get("month");
  const hour = partMap.get("hour");
  const minute = partMap.get("minute");

  if (!day || !month || !hour || !minute) {
    return "-";
  }

  return `${day}.${month}, ${hour}:${minute}`;
}

export function formatResetTimeValue(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const partMap = getFormattedParts(TIME_FORMATTER, value);
  const hour = partMap.get("hour");
  const minute = partMap.get("minute");

  if (!hour || !minute) {
    return "-";
  }

  return `${hour}:${minute}`;
}

export function formatReset(primaryResetAt: string | undefined, secondaryResetAt: string | undefined): string {
  if (primaryResetAt && secondaryResetAt) {
    return `${formatResetValue(primaryResetAt)} / ${formatResetValue(secondaryResetAt)}`;
  }

  return formatResetValue(primaryResetAt ?? secondaryResetAt);
}

export function formatProviderReset(provider: ProviderSnapshot): string {
  if (provider.provider === "openai-codex") {
    if (provider.resetAt && provider.secondaryResetAt) {
      return `${formatResetTimeValue(provider.resetAt)} / ${formatResetValue(provider.secondaryResetAt)}`;
    }

    if (provider.resetAt) {
      return formatResetTimeValue(provider.resetAt);
    }

    return formatResetValue(provider.secondaryResetAt);
  }

  return formatReset(provider.resetAt, provider.secondaryResetAt);
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

export function formatProviderStatus(provider: ProviderSnapshot): string {
  if (provider.status === "ok" && provider.source === "codex-cache") {
    return "ok (cached)";
  }

  return provider.status;
}

export function snapshotTableHeaders(): string[] {
  return [...TABLE_HEADERS];
}

export function snapshotTableRows(snapshot: SnapshotResponse): string[][] {
  return snapshot.providers.map((provider) => [
    providerLabel(provider),
    formatProviderStatus(provider),
    formatMetric(provider.remainingDisplay, provider.remainingUsd),
    formatMetric(provider.usedDisplay, provider.usedUsd),
    formatMetric(provider.limitDisplay, provider.limitUsd),
    formatProviderReset(provider),
    provider.message
  ]);
}

export function snapshotSummaryCards(snapshot: SnapshotResponse): SnapshotSummaryCard[] {
  return snapshot.providers.map((provider) => ({
    provider: providerLabel(provider),
    remaining: formatMetric(provider.remainingDisplay, provider.remainingUsd)
  }));
}

export function renderTextTable(headers: string[], rows: string[][], separatorBeforeRows: number[] = []): string {
  const widths = headers.map((header, columnIndex) => {
    return Math.max(header.length, ...rows.map((row) => row[columnIndex].length));
  });

  const pad = (value: string, width: number) => value.padEnd(width, " ");
  const divider = widths.map((width) => "-".repeat(width)).join("-+-");
  const separatorSet = new Set(separatorBeforeRows);
  const tableLines = [headers.map((header, columnIndex) => pad(header, widths[columnIndex])).join(" | "), divider];

  rows.forEach((row, rowIndex) => {
    if (separatorSet.has(rowIndex)) {
      tableLines.push(divider);
    }

    tableLines.push(row.map((cell, columnIndex) => pad(cell, widths[columnIndex])).join(" | "));
  });

  return tableLines.join("\n");
}

export function renderTable(snapshot: SnapshotResponse): string {
  const headers = snapshotTableHeaders();
  const rows = snapshotTableRows(snapshot);
  return [`Generated: ${snapshot.generatedAt}`, renderTextTable(headers, rows)].join("\n");
}
