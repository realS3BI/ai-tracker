import type { ProviderSnapshot } from "./types.js";
import type { CodexDetails, CodexRateWindowDetails } from "./providers/codex.js";
import type { CursorDetails } from "./providers/cursor.js";
import type { OpenAiApiDetails } from "./providers/openaiApi.js";
import type { OpenRouterDetails } from "./providers/openrouter.js";
import { formatMoney, formatProviderStatus, formatResetValue, providerLabel, renderTextTable } from "./snapshot-view.js";

export interface ProviderDetailEntry {
  label: string;
  value: string;
}

export interface ProviderDetailCard {
  provider: ProviderSnapshot["provider"];
  title: string;
  status: string;
  entries: ProviderDetailEntry[];
}

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

function buildSnapshotSummaryEntries(snapshot: ProviderSnapshot): ProviderDetailEntry[] {
  const entries: ProviderDetailEntry[] = [
    { label: "Status", value: formatProviderStatus(snapshot) },
    { label: "Updated", value: snapshot.updatedAt },
    { label: "Source", value: snapshot.source }
  ];

  if (typeof snapshot.usedUsd === "number") {
    entries.push({ label: "Used", value: formatMoney(snapshot.usedUsd) });
  }
  if (typeof snapshot.remainingUsd === "number") {
    entries.push({ label: "Remaining", value: formatMoney(snapshot.remainingUsd) });
  }
  if (typeof snapshot.limitUsd === "number") {
    entries.push({ label: "Limit", value: formatMoney(snapshot.limitUsd) });
  }
  if (snapshot.resetAt || snapshot.secondaryResetAt) {
    entries.push({ label: "Reset", value: formatResetValue(snapshot.resetAt ?? snapshot.secondaryResetAt) });
  }

  return entries;
}

function formatYesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function formatCodexWindowValue(window: CodexRateWindowDetails | undefined): string | null {
  if (!window) {
    return null;
  }

  const parts: string[] = [];
  if (typeof window.usedPercent === "number") {
    parts.push(`${window.usedPercent}% used`);
  }
  if (typeof window.remainingPercent === "number") {
    parts.push(`${window.remainingPercent}% remaining`);
  }
  parts.push(window.windowLabel);
  if (window.resetAt) {
    parts.push(`reset ${formatResetValue(window.resetAt)}`);
  }

  return parts.join(", ");
}

export function createCodexDetailEntries(details: CodexDetails): ProviderDetailEntry[] {
  const entries = buildSnapshotSummaryEntries(details.snapshot);
  entries.push({ label: "Codex home", value: details.codexHome });
  entries.push({ label: "Cache path", value: details.cachePath });
  if (details.sourcePath) {
    entries.push({ label: "Session file", value: details.sourcePath });
  }
  entries.push({ label: "Freshness window", value: `${details.freshnessWindowHours}h` });
  if (details.selectedLimitId) {
    entries.push({ label: "Limit id", value: details.selectedLimitId });
  }
  if (details.selectedLimitName) {
    entries.push({ label: "Limit name", value: details.selectedLimitName });
  }
  if (details.planType) {
    entries.push({ label: "Plan type", value: details.planType });
  }

  const primaryWindow = formatCodexWindowValue(details.primary);
  if (primaryWindow) {
    entries.push({ label: "Primary window", value: primaryWindow });
  }

  const secondaryWindow = formatCodexWindowValue(details.secondary);
  if (secondaryWindow) {
    entries.push({ label: "Secondary window", value: secondaryWindow });
  }

  if (
    details.snapshot.status !== "ok" ||
    (!primaryWindow && !secondaryWindow && !details.selectedLimitId && !details.sourcePath)
  ) {
    entries.push({ label: "Message", value: details.snapshot.message });
  }

  return entries;
}

export function createOpenAiDetailEntries(details: OpenAiApiDetails): ProviderDetailEntry[] {
  const entries = buildSnapshotSummaryEntries(details.snapshot);
  entries.push({
    label: "Period",
    value: `${details.periodStart} .. ${details.periodEnd} (${details.periodTimezone})`
  });
  entries.push({ label: "Budget configured", value: formatYesNo(details.budgetConfigured) });
  if (typeof details.budgetUsd === "number") {
    entries.push({ label: "Budget", value: formatMoney(details.budgetUsd) });
  }
  entries.push({ label: "Organization header", value: formatYesNo(details.organizationHeaderConfigured) });
  entries.push({ label: "Endpoint", value: details.endpoint });
  if (details.snapshot.status !== "ok" || !details.budgetConfigured) {
    entries.push({ label: "Message", value: details.snapshot.message });
  }
  return entries;
}

export function createOpenRouterDetailEntries(details: OpenRouterDetails): ProviderDetailEntry[] {
  const entries = buildSnapshotSummaryEntries(details.snapshot);
  entries.push({ label: "Endpoint", value: details.endpoint });
  if (typeof details.totalCreditsUsd === "number") {
    entries.push({ label: "Total credits", value: formatMoney(details.totalCreditsUsd) });
  }
  if (typeof details.totalUsageUsd === "number") {
    entries.push({ label: "Total usage", value: formatMoney(details.totalUsageUsd) });
  }
  if (typeof details.keyLimitUsd === "number") {
    entries.push({ label: "Key limit total", value: formatMoney(details.keyLimitUsd) });
  }
  if (typeof details.keyRemainingUsd === "number") {
    entries.push({ label: "Key limit remaining", value: formatMoney(details.keyRemainingUsd) });
  }
  entries.push({ label: "Per-key window", value: formatYesNo(details.hasKeyLimitWindow) });
  if (details.snapshot.status !== "ok" || !details.hasKeyLimitWindow) {
    entries.push({ label: "Message", value: details.snapshot.message });
  }
  return entries;
}

export function createCursorDetailEntries(details: CursorDetails): ProviderDetailEntry[] {
  const entries = buildSnapshotSummaryEntries(details.snapshot);
  if (details.billingCycleStart || details.billingCycleEnd) {
    entries.push({
      label: "Billing cycle",
      value: `${details.billingCycleStart ?? "-"} .. ${details.billingCycleEnd ?? "-"}`
    });
  }
  entries.push({ label: "Team ID", value: String(details.teamId) });
  entries.push({ label: "Dashboard", value: details.sourceDashboard });

  const usageMixParts = [
    typeof details.usageMix?.autoPercentUsed === "number" ? `auto ${details.usageMix.autoPercentUsed.toFixed(2)}%` : null,
    typeof details.usageMix?.apiPercentUsed === "number" ? `api ${details.usageMix.apiPercentUsed.toFixed(2)}%` : null
  ].filter((value): value is string => value !== null);

  if (usageMixParts.length > 0) {
    entries.push({ label: "Usage mix", value: usageMixParts.join(", ") });
  }
  if (details.topModels.length > 0) {
    entries.push({
      label: "Top models",
      value: details.topModels.map((entry) => `${entry.modelIntent} ${formatMoney(entry.totalUsd)}`).join(", ")
    });
  }
  if (details.snapshot.status !== "ok") {
    entries.push({ label: "Message", value: details.snapshot.message });
  }
  return entries;
}

function createProviderDetailCard(
  snapshot: ProviderSnapshot,
  entries: ProviderDetailEntry[]
): ProviderDetailCard {
  return {
    provider: snapshot.provider,
    title: providerLabel(snapshot),
    status: formatProviderStatus(snapshot),
    entries
  };
}

export function createCodexDetailCard(details: CodexDetails): ProviderDetailCard {
  return createProviderDetailCard(details.snapshot, createCodexDetailEntries(details));
}

export function createOpenAiDetailCard(details: OpenAiApiDetails): ProviderDetailCard {
  return createProviderDetailCard(details.snapshot, createOpenAiDetailEntries(details));
}

export function createOpenRouterDetailCard(details: OpenRouterDetails): ProviderDetailCard {
  return createProviderDetailCard(details.snapshot, createOpenRouterDetailEntries(details));
}

export function createCursorDetailCard(details: CursorDetails): ProviderDetailCard {
  return createProviderDetailCard(details.snapshot, createCursorDetailEntries(details));
}

function formatInteger(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }

  return INTEGER_FORMATTER.format(value);
}

function formatCursorModelTable(details: CursorDetails): string | null {
  if (!details.modelUsage || details.modelUsage.aggregations.length === 0) {
    return null;
  }

  const rows = details.modelUsage.aggregations.map((aggregation) => [
    aggregation.modelIntent,
    formatInteger(aggregation.inputTokens),
    formatInteger(aggregation.outputTokens),
    formatInteger(aggregation.cacheReadTokens),
    formatMoney(aggregation.totalUsd),
    typeof aggregation.tier === "number" ? String(aggregation.tier) : "-"
  ]);

  rows.push([
    "Total",
    formatInteger(details.modelUsage.totals.inputTokens),
    formatInteger(details.modelUsage.totals.outputTokens),
    formatInteger(details.modelUsage.totals.cacheReadTokens),
    formatMoney(details.modelUsage.totals.totalUsd),
    "-"
  ]);

  return renderTextTable(["Model", "Input tokens", "Output tokens", "Cache read", "Cost", "Tier"], rows, [rows.length - 1]);
}

function formatDetailOutput(provider: string, entries: ProviderDetailEntry[], jsonValue: unknown, jsonOutput: boolean): string {
  if (jsonOutput) {
    return JSON.stringify(jsonValue, null, 2);
  }

  return [`Provider: ${provider}`, ...entries.map((entry) => `${entry.label}: ${entry.value}`)].join("\n");
}

export function formatCodexDetailsOutput(details: CodexDetails, jsonOutput: boolean): string {
  return formatDetailOutput(providerLabel(details.snapshot), createCodexDetailEntries(details), { provider: details.snapshot.provider, ...details }, jsonOutput);
}

export function formatOpenAiDetailsOutput(details: OpenAiApiDetails, jsonOutput: boolean): string {
  return formatDetailOutput(providerLabel(details.snapshot), createOpenAiDetailEntries(details), { provider: details.snapshot.provider, ...details }, jsonOutput);
}

export function formatOpenRouterDetailsOutput(details: OpenRouterDetails, jsonOutput: boolean): string {
  return formatDetailOutput(providerLabel(details.snapshot), createOpenRouterDetailEntries(details), { provider: details.snapshot.provider, ...details }, jsonOutput);
}

export function formatCursorDetailsOutput(details: CursorDetails, jsonOutput: boolean, showModels = false): string {
  if (jsonOutput) {
    return JSON.stringify({ provider: details.snapshot.provider, ...details }, null, 2);
  }

  if (showModels) {
    return formatCursorModelTable(details) ?? "Model usage unavailable";
  }

  return formatDetailOutput(providerLabel(details.snapshot), createCursorDetailEntries(details), { provider: details.snapshot.provider, ...details }, false);
}
