# AI Cost Tracker

Hosted backend + CLI + simple web UI to track:

- OpenAI Codex limits from local session logs, with a server-side fallback cache
- OpenAI API spend from the official organization costs endpoint, with optional monthly budget math
- OpenRouter balance (official credits endpoint)
- Cursor billing usage from the Cursor dashboard API (session cookie required)

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Create secrets and config:

```bash
pnpm hash-password "your-password"
cp .env.example .env
```

3. Fill `.env` values and start the server:

```bash
pnpm dev
```

4. Open web UI:

`http://localhost:3000/login`

5. Initialize the CLI on the machine where you want to use it:

```bash
pnpm build
node dist/src/cli.js init --url http://localhost:3000
```

`ai-cost init` writes the machine-local CLI config to `~/.ai-cost/config.env` by default. That is where local Codex/Cursor settings live for the current PC.

## Server hosting

Two production paths are prepared in this repo:

- `compose.yaml` for Docker Compose
- `deploy/ai-cost.service` for a plain Node.js + systemd deployment

### Option 1: Docker Compose

1. Create the production env file and generate secrets:

```bash
cp .env.prod.example .env.prod
pnpm hash-password "your-password"
```

2. Fill `.env.prod` with the real values.

3. Start the service:

```bash
docker compose --env-file .env.prod up -d --build
```

4. Verify health:

```bash
curl http://127.0.0.1:3000/api/health
```

The Compose stack persists fallback cache data in the named volume `ai-cost-data`, mounted at `/data` inside the container. The Compose file also sets `APP_DATA_DIR=/data` for the service.

Exact envs for `.env.prod` / Coolify:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=3000`
- `APP_BIND_PORT=3000`
- `APP_PASSWORD_HASH=...`
- `APP_SESSION_SECRET=...`
- `APP_TOKEN_SECRET=...`
- `APP_SECURE_COOKIE=true`
- `CLI_TOKEN_TTL_SECONDS=2592000`
- `PROVIDER_TIMEOUT_MS=10000`
- `OPENAI_API_KEY=...`
- `OPENAI_ORG_ID=...`
- `OPENAI_MONTHLY_BUDGET_USD=100` (optional)
- `OPENROUTER_API_KEY=...`
- `CURSOR_DASHBOARD_COOKIE=...`
- `CURSOR_TEAM_ID=-1`
- `CODEX_HOME=...` only if the backend container itself should read Codex logs

Optional for a backend-side Codex bind mount:

```bash
CODEX_HOST_PATH=/absolute/path/to/.codex
```

Coolify note: use the same keys from `.env.prod` in the Coolify environment UI. For the prepared Compose stack, keep the service data path fixed at `/data`; the persistent storage is provided by the `ai-cost-data` volume mapping in `compose.yaml`.

If you want Codex usage from inside the backend container, add a bind mount from `CODEX_HOST_PATH` to a container path like `/codex` and set `CODEX_HOME=/codex`. In the common hosted setup you usually leave `CODEX_HOME` empty and let each CLI read Codex locally on its own machine.

### Option 2: Node.js + systemd

1. Install Node.js 22+ and `pnpm` on the server.

2. Build the app:

```bash
pnpm install --frozen-lockfile
pnpm build
```

3. Copy `deploy/ai-cost.service` to `/etc/systemd/system/ai-cost.service` and adjust paths/user if needed.

4. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ai-cost
sudo systemctl status ai-cost
```

### Reverse proxy

Run the app behind HTTPS via Nginx, Caddy, or Traefik and proxy requests to `127.0.0.1:3000`.

Recommended production setup:

- Keep `APP_SECURE_COOKIE=true`
- Leave `HOST=0.0.0.0`
- Expose only the reverse proxy publicly
- Use `/api/health` for uptime checks

## CLI usage

Build once, then run:

```bash
pnpm build
node dist/src/cli.js init --url http://localhost:3000
node dist/src/cli.js
node dist/src/cli.js --json
node dist/src/cli.js cursor
node dist/src/cli.js codex
node dist/src/cli.js openai
node dist/src/cli.js openrouter
node dist/src/cli.js cursor-cookie --value "WorkosCursorSessionToken=..."
Get-Clipboard | node dist/src/cli.js cursor-cookie
node dist/src/cli.js login --url http://localhost:3000
node dist/src/cli.js logout
```

After global install (`pnpm link --global`), use `ai-cost` directly.

`ai-cost init` stores the backend URL plus a machine-local env file path and writes provider values such as `CODEX_HOME`, `CURSOR_DASHBOARD_COOKIE`, `OPENAI_API_KEY`, and `OPENROUTER_API_KEY` into `~/.ai-cost/config.env` by default.

When you run `ai-cost`, local provider values override the hosted backend for that machine. This matters especially for Codex: the CLI reads `CODEX_HOME` on the current PC, so Codex limits still work correctly after installing the CLI on another computer.

`ai-cost cursor` reads the local `CURSOR_DASHBOARD_COOKIE` config directly and prints detailed Cursor billing data, including the current usage mix and top models.
`ai-cost codex` reads the local Codex session files and fallback cache and prints the detailed rate-limit windows plus technical source metadata.
`ai-cost openai` reads the local OpenAI API settings and prints detailed current-month billing data for the `openai-api` provider.
`ai-cost openrouter` reads the local OpenRouter API key and prints detailed credits data, including per-key limit metadata when the endpoint returns it.
The web dashboard mirrors these provider-specific details in dedicated detail cards below the overview table.

`cursor-cookie` extracts `WorkosCursorSessionToken` from a pasted cookie header, a copied `curl` command, or a raw token value and writes `CURSOR_DASHBOARD_COOKIE` into the local CLI env file. Use `--stdout` if you only want the extracted token printed.

## Install from npm

After publish, install globally:

```bash
npm install -g @reals3bi/ai-cost
```

Update later:

```bash
npm update -g @reals3bi/ai-cost
```

Then use:

```bash
ai-cost init --url https://your-backend.example.com
ai-cost
ai-cost codex
ai-cost openai
ai-cost openrouter
```

## Publish to npm

1. Login once:

```bash
npm login
```

2. Deploy the current CLI build:

```bash
pnpm deploy
```

`pnpm deploy` runs:

- `pnpm test`
- `pnpm build`
- `npm whoami`
- `npm pack --dry-run`
- `npm publish --access public`

If the version already exists on npm, bump it first with `npm version patch|minor|major`.

## Environment variables

See [.env.example](./.env.example). Required core values:

- `APP_PASSWORD_HASH`
- `APP_SESSION_SECRET`
- `APP_TOKEN_SECRET`

Provider values:

- `OPENAI_API_KEY`
- `OPENAI_MONTHLY_BUDGET_USD` (optional, only needed to derive `remaining = budget - current month costs`)
- `OPENROUTER_API_KEY`
- `CODEX_HOME` (optional on the backend; the CLI reads `~/.codex` locally by default)
- `APP_DATA_DIR` (optional, defaults to `~/.ai-cost` on the current machine for Codex fallback cache files)
- `CURSOR_DASHBOARD_COOKIE` (full `Cookie` header value or just `WorkosCursorSessionToken`)
- `CURSOR_TEAM_ID` (defaults to `-1` for personal usage)

For production hosting, use [.env.prod.example](./.env.prod.example) as the basis for `.env.prod`.

`CODEX_HOME` only works on the machine that can actually read the Codex session files for the account whose limits you want to display.

For OpenAI API, the documented endpoint used here reports organization costs for the current month. If `OPENAI_MONTHLY_BUDGET_USD` is set, the tracker also derives a remaining value and monthly reset; if it is empty, the tracker still shows spend but leaves limit/remaining/reset blank.

If no fresh local Codex session is found, the app falls back to the last snapshot stored in `APP_DATA_DIR/codex-cache.json`. Fresh local Codex snapshots replace that cache only when the value actually changes.

`CURSOR_DASHBOARD_COOKIE` is taken from an authenticated browser session on `https://cursor.com/dashboard?tab=billing`. The local Cursor app's cached `accessToken` and `refreshToken` are not enough for the dashboard endpoints by themselves; the tracker uses the web session cookie instead.

## Security notes

- Provider API keys stay on the backend only.
- `CURSOR_DASHBOARD_COOKIE` is a sensitive web session and should be treated like a secret.
- Web auth uses secure session cookie.
- CLI auth uses signed backend token.
- CLI token storage prefers OS keychain via `keytar`; encrypted local fallback is used if keychain is unavailable.
