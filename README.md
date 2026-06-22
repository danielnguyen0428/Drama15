# Drama15 Lite Studio

Drama15 is a web writing studio for short-drama generation.

- `apps/api` - Fastify API for style presets, seed suggestions, full story generation over SSE, and chapter rewrite.
- `apps/web` - Vite/React web client for `drama.novelkit.cc`.
- `src` - shared generation pipeline, presets, router client, validators, and markdown helpers.
- `presets` - model, line, style, and prompt presets used by the generator.

## Production

- Public web domain: `https://drama.novelkit.cc`
- API domain: `https://drama-api.novelkit.cc`
- Web host: Vercel, root directory `apps/web`
- API host: Render web service from `render.yaml`

The web build must set:

```bash
VITE_API_URL=https://drama-api.novelkit.cc
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The API service must set `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `HOST=0.0.0.0`, `CORS_ORIGINS=https://drama.novelkit.cc`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_API_KEY`, and `LLM_SETTINGS_ENCRYPTION_KEY`.

Run the Supabase migrations in `supabase/migrations/` before enabling production login. They create profile, story, quota tables, RLS policies, and the atomic quota RPCs.

## Requirements

- Node.js 20.10 or newer
- An OpenAI-compatible router at `OPENAI_BASE_URL`

## Setup

```bash
npm --prefix apps/api install
npm --prefix apps/web install
cp .env.example .env
```

Edit `.env` for your router URL, API key, model preset, allowed CORS origins, and per-user LLM settings encryption key.

Per-user LLM settings are stored in Supabase and encrypted server-side with `LLM_SETTINGS_ENCRYPTION_KEY`. Keep this key stable; rotate it only with a decrypt/re-encrypt migration.

## Run Locally

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:web
```

Open the Vite URL, usually `http://localhost:5174`.

## Build

```bash
npm run build
```

## Telegram Status Bot

The API can push system status and new-user alerts to Telegram (bot `@meowzerobot`).

Configure these env vars on the API service:

```bash
TELEGRAM_BOT_TOKEN=8317007470:...        # from @BotFather
TELEGRAM_CHAT_ID=                         # target chat/group id
TELEGRAM_ENABLE_POLLING=true              # answer /status, /ping, /chatid commands
TELEGRAM_STATUS_INTERVAL_MS=0             # >0 to broadcast status on a schedule (ms)
WEB_PUBLIC_URL=https://drama.novelkit.cc  # URL pinged for the "Web" check
```

First-time setup: leave `TELEGRAM_CHAT_ID` empty, start the API, then send any
message to the bot. It replies with your chat ID — paste that into
`TELEGRAM_CHAT_ID` and restart to enable notifications.

What it reports:

- Connection status for API, Web, 9Router, and Supabase (`/status` command, or
  admin-guarded `GET /status` endpoint).
- A `🎉` alert whenever a new user registers (hooked into profile creation).
- A status message on API startup.

Admin endpoints (require the `x-admin-api-key` header):

- `GET /status` — returns the status report as JSON.
- `POST /admin/telegram/status` — pushes the status report to Telegram now.

Bot commands (only answered in the configured chat): `/status`, `/ping`,
`/chatid`, `/help`.
