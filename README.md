# AI Cost Tracker

Hosted backend + CLI + simple web UI to track:

- OpenAI Codex limits (currently `unsupported` for personal accounts)
- OpenAI API budget remaining (monthly budget minus official costs endpoint)
- OpenRouter balance (official credits endpoint)
- Cursor limits (currently `unsupported` for personal accounts)

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

## Server hosting

Two production paths are prepared in this repo:

- `compose.yaml` for Docker Compose
- `deploy/ai-cost.service` for a plain Node.js + systemd deployment

### Option 1: Docker Compose

1. Copy environment file and generate secrets:

```bash
cp .env.example .env
pnpm hash-password "your-password"
```

2. Fill `.env` with real secrets and API keys.

3. Start the service:

```bash
docker compose up -d --build
```

4. Verify health:

```bash
curl http://127.0.0.1:3000/api/health
```

The container exposes port `3000` internally. Change the public bind port with `APP_BIND_PORT`, for example:

```bash
APP_BIND_PORT=8080
```

If you want Codex usage from inside the container, mount the host Codex directory and set `CODEX_HOME` to the mounted path.

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
node dist/src/cli.js login --url http://localhost:3000
node dist/src/cli.js
node dist/src/cli.js --json
node dist/src/cli.js logout
```

After global install (`pnpm link --global`), use `ai-cost` directly.

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
ai-cost login --url https://your-backend.example.com
ai-cost
```

## Publish to npm

1. Login:

```bash
npm login
```

2. Verify package content:

```bash
npm pack --dry-run
```

3. Publish public scoped package:

```bash
npm publish --access public
```

4. Publish update:

```bash
npm version patch
npm publish --access public
```

## Environment variables

See [.env.example](./.env.example). Required core values:

- `APP_PASSWORD_HASH`
- `APP_SESSION_SECRET`
- `APP_TOKEN_SECRET`

Provider values:

- `OPENAI_API_KEY`
- `OPENAI_MONTHLY_BUDGET_USD`
- `OPENROUTER_API_KEY`
- `CODEX_HOME` (optional, defaults to `~/.codex` on the backend host)

`CODEX_HOME` only works when the backend can read the Codex session files for the account whose limits you want to display.

## Security notes

- Provider API keys stay on the backend only.
- Web auth uses secure session cookie.
- CLI auth uses signed backend token.
- CLI token storage prefers OS keychain via `keytar`; encrypted local fallback is used if keychain is unavailable.
