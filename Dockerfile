# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
ARG NODE_ENV=production
ARG HOST=
ARG PORT=
ARG OPENAI_API_KEY
ARG OPENAI_ORG_ID
ARG OPENAI_MONTHLY_BUDGET_USD
ARG OPENROUTER_API_KEY
ARG CODEX_HOME
ARG CURSOR_DASHBOARD_COOKIE
ARG CURSOR_TEAM_ID=-1
ARG APP_PASSWORD_HASH
ARG APP_SESSION_SECRET
ARG APP_TOKEN_SECRET
ARG APP_SECURE_COOKIE=true
ARG CLI_TOKEN_TTL_SECONDS=2592000
ARG PROVIDER_TIMEOUT_MS=10000
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3000
CMD ["node", "dist/src/server.js"]
