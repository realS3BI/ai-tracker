import type { AppConfig } from "../config.js";

export type ProviderRuntimeConfig = Pick<
  AppConfig,
  | "OPENAI_API_KEY"
  | "OPENAI_ORG_ID"
  | "OPENAI_MONTHLY_BUDGET_USD"
  | "OPENROUTER_API_KEY"
  | "CODEX_HOME"
  | "APP_DATA_DIR"
  | "CURSOR_DASHBOARD_COOKIE"
  | "CURSOR_TEAM_ID"
  | "PROVIDER_TIMEOUT_MS"
>;
