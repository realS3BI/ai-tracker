import path from "node:path";
import type { AppConfig } from "../src/config.js";

export function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 3000,
    OPENAI_API_KEY: "sk-test",
    OPENAI_ORG_ID: undefined,
    OPENAI_MONTHLY_BUDGET_USD: 100,
    OPENROUTER_API_KEY: "or-test",
    CODEX_HOME: path.resolve(process.cwd(), "test", "fixtures", "codex-home"),
    APP_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy",
    APP_SESSION_SECRET: "session-secret-123456",
    APP_TOKEN_SECRET: "token-secret-123456",
    APP_SECURE_COOKIE: false,
    CLI_TOKEN_TTL_SECONDS: 3600,
    PROVIDER_TIMEOUT_MS: 1000,
    appSecureCookie: false,
    ...overrides
  };
}
