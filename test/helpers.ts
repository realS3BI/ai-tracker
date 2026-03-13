import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
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
    APP_DATA_DIR: path.join(tmpdir(), "ai-cost-tests", randomUUID()),
    CURSOR_DASHBOARD_COOKIE: "WorkosCursorSessionToken=test-cookie",
    CURSOR_TEAM_ID: -1,
    APP_PASSWORD_HASH: "taLJYlBhI2bqJy/6xtl0Sq9LRarNlqp8/Lkx7jtVglk=",
    APP_SESSION_SECRET: "session-secret-123456",
    APP_TOKEN_SECRET: "token-secret-123456",
    APP_SECURE_COOKIE: false,
    CLI_TOKEN_TTL_SECONDS: 3600,
    PROVIDER_TIMEOUT_MS: 1000,
    appSecureCookie: false,
    ...overrides
  };
}
