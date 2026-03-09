import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import "@fastify/secure-session";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { verifyCliToken } from "./token.js";

const require = createRequire(import.meta.url);
const secureSession = require("@fastify/secure-session");

export async function registerSession(app: FastifyInstance, config: AppConfig): Promise<void> {
  const sessionKey = createHash("sha256").update(config.APP_SESSION_SECRET).digest();
  await app.register(secureSession, {
    key: sessionKey,
    cookieName: "aicost_session",
    cookie: {
      path: "/",
      httpOnly: true,
      secure: config.appSecureCookie,
      sameSite: "lax"
    }
  });
}

export function setAuthenticatedSession(request: FastifyRequest): void {
  (request.session as { authenticated?: boolean }).authenticated = true;
}

export function clearAuthenticatedSession(request: FastifyRequest): void {
  request.session.delete();
}

export function hasAuthenticatedSession(request: FastifyRequest): boolean {
  return (request.session as { authenticated?: boolean }).authenticated === true;
}

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

export function isAuthorizedRequest(request: FastifyRequest, config: AppConfig): boolean {
  if (hasAuthenticatedSession(request)) {
    return true;
  }
  const token = parseBearerToken(request);
  if (!token) {
    return false;
  }
  return verifyCliToken(token, config.APP_TOKEN_SECRET);
}

export function sendUnauthorized(reply: FastifyReply): void {
  reply.code(401).send({
    error: "unauthorized",
    message: "Authentication required."
  });
}
