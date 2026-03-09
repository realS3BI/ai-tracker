import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { verifyPassword } from "../auth/password.js";
import { clearAuthenticatedSession, setAuthenticatedSession } from "../auth/session.js";
import { issueCliToken } from "../auth/token.js";

const loginSchema = z.object({
  password: z.string().min(1),
  issueCliToken: z.boolean().optional().default(false)
});

export async function registerAuthRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "Invalid login payload."
        });
      }

      const ok = await verifyPassword(parsed.data.password, config.APP_PASSWORD_HASH);
      if (!ok) {
        return reply.code(401).send({
          error: "unauthorized",
          message: "Invalid credentials."
        });
      }

      setAuthenticatedSession(request);

      const response: { ok: true; token?: string; expiresInSeconds?: number } = {
        ok: true
      };

      if (parsed.data.issueCliToken) {
        response.token = issueCliToken(config.APP_TOKEN_SECRET, config.CLI_TOKEN_TTL_SECONDS);
        response.expiresInSeconds = config.CLI_TOKEN_TTL_SECONDS;
      }

      return reply.send(response);
    }
  );

  app.post("/api/auth/logout", async (request, reply) => {
    clearAuthenticatedSession(request);
    return reply.send({ ok: true });
  });
}
