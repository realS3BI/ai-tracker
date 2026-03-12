export type ProviderId = "openai-api" | "openai-codex" | "openrouter" | "cursor";
export type ProviderStatus = "ok" | "unsupported" | "error" | "unauthorized";
export type ProviderUnit = "usd" | "messages" | "requests";
export type SnapshotSource =
  | "official-api"
  | "official-dashboard-api"
  | "official-docs-status"
  | "local-codex-session"
  | "codex-cache";

export interface ProviderSnapshot {
  provider: ProviderId;
  status: ProviderStatus;
  title: string;
  remainingUsd?: number;
  usedUsd?: number;
  limitUsd?: number;
  remainingDisplay?: string;
  usedDisplay?: string;
  limitDisplay?: string;
  unit?: ProviderUnit;
  resetAt?: string;
  secondaryResetAt?: string;
  updatedAt: string;
  message: string;
  source: SnapshotSource;
}

export interface SnapshotResponse {
  generatedAt: string;
  providers: ProviderSnapshot[];
}
