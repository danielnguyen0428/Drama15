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

The API service must set `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `HOST=0.0.0.0`, `CORS_ORIGINS=https://drama.novelkit.cc`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_API_KEY`.

Run the Supabase migration in `supabase/migrations/202605280001_auth_quota_stories.sql` before enabling production login. The migration creates profile, story, quota tables, RLS policies, and the atomic `consume_story_quota` RPC.

## Requirements

- Node.js 20.10 or newer
- An OpenAI-compatible router at `OPENAI_BASE_URL`

## Setup

```bash
npm --prefix apps/api install
npm --prefix apps/web install
cp .env.example .env
```

Edit `.env` for your router URL, API key, model preset, and allowed CORS origins.

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
