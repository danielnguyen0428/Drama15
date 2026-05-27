# Drama15 Local Studio

Drama15 is trimmed to the local writing core only:

- `apps/api` - Fastify API for style presets, seed suggestions, full story generation over SSE, and chapter rewrite.
- `apps/web` - Vite/React web client for local writing.
- `src` - shared generation pipeline, presets, router client, validators, and markdown helpers.
- `presets` - model, line, style, and prompt presets used by the generator.

Removed from this branch: Kiro specs, docs, tests, admin console, auth/licensing, voice, automation, desktop shell, migrations, online deploy config, PM2/Cloudflare/Vercel files, and old examples/outputs.

## Requirements

- Node.js 20.10 or newer
- An OpenAI-compatible local router at `OPENAI_BASE_URL` (default `http://localhost:20128/v1`)

## Setup

```powershell
npm --prefix apps/api install
npm --prefix apps/web install
Copy-Item .env.example .env
```

Edit `.env` if your router URL, API key, or model preset is different.

## Run Locally

Terminal 1:

```powershell
npm run dev:api
```

Terminal 2:

```powershell
npm run dev:web
```

Open the Vite URL, usually `http://localhost:5174`.

## Build

```powershell
npm run build
```

The build compiles the local API and the web client only.
