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
