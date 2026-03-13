export type ProviderId = "openai-api" | "openai-codex" | "openrouter" | "cursor";
export type ProviderStatus = "ok" | "unsupported" | "error" | "unauthorized";
export type ProviderUnit = "usd" | "messages" | "requests";
export type SnapshotSource =
  | "official-api"
  | "official-dashboard-api"
  | "official-docs-status"
  | "local-codex-session"
  | "codex-cache"
  | "cli-upload-cache";

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

export interface CliSnapshotUploadRequest {
  generatedAt: string;
  command: string;
  providers: ProviderSnapshot[];
  providerDetails: ProviderDetailCard[];
}

export interface CliSnapshotUploadResponse {
  ok: true;
  storedAt: string;
  providersStored: number;
}

export interface CliEnvSyncRequest {
  env: Record<string, string>;
}

export interface CliEnvSyncResponse {
  ok: true;
  env: Record<string, string>;
  envFilePath: string;
  updatedKeys?: number;
}

export interface CliJsonOutput extends SnapshotResponse {
  notices?: string[];
}
