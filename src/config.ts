import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const serverSchema = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string(),
  PORT: z.coerce.number().int().min(1).max(65535),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_ORG_ID: z.string().min(1).optional(),
  OPENAI_MONTHLY_BUDGET_USD: z.coerce.number().positive().optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  CODEX_HOME: z.string().min(1).optional(),
  APP_DATA_DIR: z.string().min(1).optional(),
  CURSOR_DASHBOARD_COOKIE: z.string().min(1).optional(),
  CURSOR_TEAM_ID: z.coerce.number().int().default(-1),
  APP_PASSWORD_HASH: z.string().min(20),
  APP_SESSION_SECRET: z.string().min(16),
  APP_TOKEN_SECRET: z.string().min(16),
  APP_SECURE_COOKIE: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  CLI_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).default(60 * 60 * 24 * 30),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(10000)
};

const envSchema = z.object(serverSchema);
type EnvShape = z.output<typeof envSchema>;

export type AppConfig = EnvShape & {
  appSecureCookie: boolean;
};

function toAppConfig(env: EnvShape): AppConfig {
  return {
    ...env,
    appSecureCookie: env.APP_SECURE_COOKIE
  };
}

let cached: AppConfig | null = null;

function getEnv(runtimeEnv: NodeJS.ProcessEnv): EnvShape {
  return createEnv({
    server: serverSchema,
    runtimeEnv,
    emptyStringAsUndefined: true
  }) as EnvShape;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env) {
    if (!cached) {
      cached = toAppConfig(getEnv(process.env));
    }
    return cached;
  }
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return toAppConfig(parsed.data);
}
