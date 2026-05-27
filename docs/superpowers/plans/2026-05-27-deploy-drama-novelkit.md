# Drama NovelKit Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the cloned Drama15 web app online at `https://drama.novelkit.cc` with a working long-running API backend.

**Architecture:** Keep the Vite/React web app on Vercel because `drama.novelkit.cc` already resolves to Vercel and serves HTTPS. Deploy the Fastify API as a persistent Node web service, not Vercel serverless, because story generation uses long timeouts, Server-Sent Events, and in-memory job state.

**Tech Stack:** Node.js 20+, npm, Vite 5, React 18, Fastify 4, Vercel static hosting, Render Node web service for API.

---

## Current Findings

- Repo cloned at `/Users/meow/drama15` from `https://github.com/danielnguyen0428/Drama15.git`.
- Current branch is `main`; local build passes with `npm run build`.
- The repo is explicitly trimmed to local API/web core. README says old Vercel, Cloudflare, PM2, admin, auth/licensing, and deploy config were removed.
- `https://drama.novelkit.cc` currently returns `200` from Vercel.
- `http://drama.novelkit.cc` redirects to HTTPS.
- DNS A records currently resolve to Vercel IPs: `64.29.17.1`, `216.198.79.65`.
- Existing production HTML allows `connect-src https://api.vibify.work`, but `https://api.vibify.work/healthz` currently returns Cloudflare error `1033`.
- API production dependency audit currently reports 5 high vulnerabilities through Fastify's `fast-uri` dependency chain. The web production audit reports 0 vulnerabilities.
- There are no tests in the trimmed repo; the meaningful baseline check today is build/typecheck plus an API smoke test.

## Success Criteria

- `npm --prefix apps/api ci` completes.
- `npm --prefix apps/web ci` completes.
- `npm run build` passes from repo root.
- API service responds: `curl -fsS https://drama-api.novelkit.cc/healthz`.
- Web app responds: `curl -I https://drama.novelkit.cc` returns `200` or Vercel cache headers.
- Browser smoke test can create a story job with `POST /stories` and receive at least one SSE event from `/stories/:id/stream`.

## Deployment Shape

- Web: Vercel project rooted at `apps/web`.
- Web domain: `drama.novelkit.cc`.
- API: Render web service rooted at repo root, running `apps/api`.
- API domain: `drama-api.novelkit.cc`.
- Web env: `VITE_API_URL=https://drama-api.novelkit.cc`.
- API env: `HOST=0.0.0.0`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODEL_PRESET`, router timeout variables, and default story preset variables.

## Files To Create Or Modify During Execution

- Modify `apps/api/src/startDev.ts`: replace permissive CORS with an allowlist from `CORS_ORIGINS`.
- Modify `src/lib/env.ts`: add `CORS_ORIGINS` parsing.
- Create `render.yaml`: define the API service as Render infrastructure-as-code.
- Create `apps/web/vercel.json`: define SPA fallback and security headers, including `connect-src https://drama-api.novelkit.cc`.
- Create `apps/web/.env.production.example`: document `VITE_API_URL=https://drama-api.novelkit.cc`.
- Optionally modify `apps/web/index.html`: restore production title/meta if this trimmed local title should not replace the existing production SEO.
- Optionally modify `apps/api/package.json` and `apps/api/tsconfig.build.json`: switch API runtime from `tsx src/startDev.ts` to compiled JavaScript before scaling beyond a small launch.

---

### Task 1: Preserve Current Production Before Replacement

**Files:**
- Read-only: `apps/web/index.html`
- Read-only: production page at `https://drama.novelkit.cc`

- [ ] **Step 1: Capture current production headers**

Run:

```bash
curl -I https://drama.novelkit.cc
```

Expected:

```text
HTTP/2 200
server: Vercel
```

- [ ] **Step 2: Capture current production HTML**

Run:

```bash
curl -L https://drama.novelkit.cc > /tmp/drama-novelkit-production.html
```

Expected:

```text
File /tmp/drama-novelkit-production.html exists and includes title "Drama15 Lite Studio".
```

- [ ] **Step 3: Compare with repo HTML**

Run:

```bash
sed -n '1,80p' apps/web/index.html
```

Expected:

```text
Repo title is "Drama15 Local Studio", so deploying this branch as-is changes production SEO and wording.
```

### Task 2: Add API CORS Allowlist

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `apps/api/src/startDev.ts`

- [ ] **Step 1: Add parsed CORS origins to env**

In `src/lib/env.ts`, extend the schema and exported env object with:

```ts
CORS_ORIGINS: z.string().default("https://drama.novelkit.cc"),
```

and:

```ts
corsOrigins: parsedEnv.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
```

- [ ] **Step 2: Replace permissive CORS hook**

In `apps/api/src/startDev.ts`, replace the current `onRequest` hook with:

```ts
app.addHook('onRequest', (request, reply, done) => {
  const origin = request.headers.origin;
  const allowedOrigin =
    typeof origin === 'string' && env.corsOrigins.includes(origin)
      ? origin
      : env.corsOrigins[0] ?? 'https://drama.novelkit.cc';

  reply.header('Access-Control-Allow-Origin', allowedOrigin);
  reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'content-type');
  reply.header('Vary', 'Origin');

  if (request.method === 'OPTIONS') {
    void reply.code(204).send();
    return;
  }

  done();
});
```

- [ ] **Step 3: Verify typecheck**

Run:

```bash
npm --prefix apps/api run typecheck
```

Expected:

```text
No TypeScript errors.
```

### Task 3: Add Render API Blueprint

**Files:**
- Create: `render.yaml`

- [ ] **Step 1: Create `render.yaml`**

Create this file at repo root:

```yaml
services:
  - type: web
    name: drama15-api
    runtime: node
    plan: starter
    region: singapore
    branch: main
    autoDeploy: true
    buildCommand: npm --prefix apps/api ci && npm --prefix apps/api run typecheck
    startCommand: npm --prefix apps/api start
    healthCheckPath: /healthz
    envVars:
      - key: NODE_ENV
        value: production
      - key: HOST
        value: 0.0.0.0
      - key: CORS_ORIGINS
        value: https://drama.novelkit.cc
      - key: OPENAI_BASE_URL
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: MODEL_PRESET
        value: default
      - key: ROUTER_DEFAULT_TIMEOUT_MS
        value: "300000"
      - key: ROUTER_PLANNING_TIMEOUT_MS
        value: "240000"
      - key: ROUTER_CHAPTER_TIMEOUT_MS
        value: "600000"
      - key: ROUTER_MAX_RETRIES
        value: "2"
      - key: ROUTER_FALLBACK_ENABLED
        value: "true"
      - key: DEFAULT_LINE_PRESET
        value: billionaire_rich_poor_romance
      - key: DEFAULT_STYLE_PRESET
        value: wharton_class_shame_elegance
      - key: DEFAULT_CHAPTER_COUNT
        value: "10"
      - key: WRITE_EXPORT_FILES
        value: "false"
```

- [ ] **Step 2: Commit and push the blueprint**

Run:

```bash
git add src/lib/env.ts apps/api/src/startDev.ts render.yaml
git commit -m "chore: add production api deploy config"
git push origin main
```

Expected:

```text
Push succeeds to origin/main.
```

- [ ] **Step 3: Create Render service from blueprint**

Use Render Dashboard Blueprint flow against `danielnguyen0428/Drama15`, branch `main`.

Expected:

```text
Render creates a web service named drama15-api.
```

- [ ] **Step 4: Set secret env vars in Render**

Set:

```text
OPENAI_BASE_URL: production OpenAI-compatible router base URL, ending in /v1, stored as a Render secret.
OPENAI_API_KEY: production router API key, stored as a Render secret.
```

Expected:

```text
Render deploy starts after env vars are saved.
```

- [ ] **Step 5: Verify default Render URL**

Run after deploy:

```bash
curl -fsS https://drama15-api.onrender.com/healthz
```

Expected:

```text
JSON response has ok=true, service="drama15-local-api", and routerBaseUrl equal to the Render OPENAI_BASE_URL secret.
```

### Task 4: Attach API Domain

**Files:**
- External DNS only

- [ ] **Step 1: Add custom domain in Render**

Add:

```text
drama-api.novelkit.cc
```

Expected:

```text
Render shows the DNS target for the custom domain.
```

- [ ] **Step 2: Add DNS record**

In the DNS provider for `novelkit.cc`, add the CNAME that Render shows for `drama-api.novelkit.cc`.

Expected:

```text
DNS resolves to Render's target.
```

- [ ] **Step 3: Verify API domain**

Run:

```bash
curl -fsS https://drama-api.novelkit.cc/healthz
```

Expected:

```text
JSON response has ok=true, service="drama15-local-api", and routerBaseUrl equal to the Render OPENAI_BASE_URL secret.
```

### Task 5: Add Vercel Web Config

**Files:**
- Create: `apps/web/vercel.json`
- Create: `apps/web/.env.production.example`

- [ ] **Step 1: Create Vercel config**

Create `apps/web/vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://drama-api.novelkit.cc; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/((?!assets/|favicon.png|favicon.svg|logo.png|mascot.png).*)",
      "destination": "/index.html"
    }
  ]
}
```

- [ ] **Step 2: Create production env example**

Create `apps/web/.env.production.example`:

```bash
VITE_API_URL=https://drama-api.novelkit.cc
```

- [ ] **Step 3: Verify web build**

Run:

```bash
npm --prefix apps/web run build
```

Expected:

```text
vite build completes and writes apps/web/dist.
```

### Task 6: Deploy Web To Vercel

**Files:**
- External Vercel project settings

- [ ] **Step 1: Link Vercel project to GitHub repo**

Use Vercel Dashboard to link:

```text
Repository: danielnguyen0428/Drama15
Root Directory: apps/web
Framework Preset: Vite
Build Command: npm ci && npm run build
Output Directory: dist
Install Command: npm ci
Production Branch: main
```

Expected:

```text
Vercel imports the project and detects Vite.
```

- [ ] **Step 2: Set Vercel production env**

Set:

```text
VITE_API_URL=https://drama-api.novelkit.cc
```

Expected:

```text
New production deployments bake the API URL into the client bundle.
```

- [ ] **Step 3: Attach web domain**

Attach:

```text
drama.novelkit.cc
```

Expected:

```text
Vercel shows the domain as valid. Existing DNS already points at Vercel, so no DNS change should be needed if the project is in the same Vercel account.
```

- [ ] **Step 4: Deploy production**

Run from repo root if CLI auth is configured:

```bash
vercel deploy apps/web --prod -y
```

Or trigger a production deployment from the Vercel Dashboard.

Expected:

```text
Production URL is assigned to https://drama.novelkit.cc.
```

### Task 7: Smoke Test Online Flow

**Files:**
- Read-only verification

- [ ] **Step 1: Verify API health**

Run:

```bash
curl -fsS https://drama-api.novelkit.cc/healthz
```

Expected:

```text
JSON response has ok=true, service="drama15-local-api", and routerBaseUrl equal to the Render OPENAI_BASE_URL secret.
```

- [ ] **Step 2: Verify web headers**

Run:

```bash
curl -I https://drama.novelkit.cc
```

Expected:

```text
HTTP/2 200
server: Vercel
content-security-policy: ... connect-src 'self' https://drama-api.novelkit.cc ...
```

- [ ] **Step 3: Verify API job creation**

Run:

```bash
curl -fsS https://drama-api.novelkit.cc/stories \
  -H 'content-type: application/json' \
  -H 'origin: https://drama.novelkit.cc' \
  --data '{"niche":"billionaire_rich_poor_romance","customNiche":"","title":"Smoke Test","seed":"A short smoke-test seed.","outputLanguage":"vietnamese","intensity":0.84,"dialogueRatio":0.56,"hookDensity":0.67,"stylePreset":"wharton_class_shame_elegance"}'
```

Expected:

```text
JSON response has a non-empty storyId and status="queued".
```

- [ ] **Step 4: Verify browser workflow**

Open:

```text
https://drama.novelkit.cc
```

Expected:

```text
The app loads, setup suggestion can call the API, story generation opens an SSE stream, and the first progress message appears.
```

### Task 8: Production Hardening Before Traffic

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/tsconfig.build.json`
- Modify: `render.yaml`

- [ ] **Step 1: Decide whether to upgrade Fastify before launch**

Run:

```bash
npm --prefix apps/api audit --omit=dev --audit-level=high
```

Expected:

```text
If the Fastify advisory still appears, schedule a focused Fastify 5 upgrade and regression smoke test before public traffic.
```

- [ ] **Step 2: Keep API on one instance unless job state is externalized**

In Render service settings:

```text
Instances: 1
```

Expected:

```text
SSE clients reconnect to the same in-memory job store during the initial launch.
```

- [ ] **Step 3: Add persistent job storage before horizontal scaling**

Do not scale beyond one API instance until story jobs are moved out of the in-memory `jobs` map in `apps/api/src/startDev.ts`.

Expected:

```text
Scaling decision is blocked until Redis/Postgres-backed job state is implemented.
```

## Rollback Plan

- Keep the existing Vercel production deployment available until the new deployment passes smoke tests.
- If the new web deployment breaks, use Vercel Dashboard to promote the previous production deployment.
- If the new API breaks, point Vercel env `VITE_API_URL` back to the previous working API endpoint and redeploy web.
- If DNS for `drama-api.novelkit.cc` is wrong, use the default Render service URL temporarily in `VITE_API_URL` and redeploy web.

## Execution Order

1. Task 1: preserve current production state.
2. Task 2: add CORS allowlist.
3. Task 3: create and deploy Render API.
4. Task 4: attach `drama-api.novelkit.cc`.
5. Task 5: add Vercel config.
6. Task 6: deploy web to `drama.novelkit.cc`.
7. Task 7: smoke test online flow.
8. Task 8: harden before traffic and before scaling.
