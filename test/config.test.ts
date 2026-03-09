import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: "3000",
  OPENAI_API_KEY: "sk-test",
  OPENROUTER_API_KEY: "or-test",
  APP_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy",
  APP_SESSION_SECRET: "session-secret-123456",
  APP_TOKEN_SECRET: "token-secret-123456",
  APP_SECURE_COOKIE: "false",
  CLI_TOKEN_TTL_SECONDS: "900",
  PROVIDER_TIMEOUT_MS: "5000"
};

describe("loadConfig", () => {
  it("parses a valid env map", () => {
    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(3000);
    expect(config.CLI_TOKEN_TTL_SECONDS).toBe(900);
    expect(config.appSecureCookie).toBe(false);
  });

  it("throws when required secrets are missing", () => {
    expect(() => loadConfig({ ...validEnv, APP_PASSWORD_HASH: undefined })).toThrow(
      /Invalid environment configuration/
    );
  });
});
