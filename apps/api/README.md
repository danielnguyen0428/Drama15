# @drama15/api

Fastify + TypeScript backend for the Drama15 Lite SaaS web product. This
package will host `API_Gateway`, `Auth_Service`, `License_Service`,
`Rate_Limiter`, `Audit_Logger`, and `Export_Service` (see
`.kiro/specs/commercial-web-saas/design.md`).

This commit lands wave 0 / task 1.1 only:

- HTTPS-only Fastify boot (plain HTTP is never bound).
- `x-request-id` propagation (UUID v4 in / UUID v4 out).
- Structured JSON logger via `pino` with redaction defaults.

Routes and feature middleware land in later tasks.

## Scripts

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | `tsx watch src/start.ts` — auto-reload server |
| `npm run build`    | `tsc -p tsconfig.json` → `dist/`              |
| `npm start`        | Run the compiled `dist/start.js`              |
| `npm test`         | `vitest run`                                  |
| `npm run typecheck`| Type-only build                               |
| `npm run benchmark`| Run quality benchmark (10 stories, 4 metrics) |

## Benchmark

The benchmark script generates 10 stories with random seeds across 3 niches
(billionaire, humiliation_revenge, secret_identity) and measures 4 quality
metrics:

| Metric         | Computation                                                        |
| -------------- | ------------------------------------------------------------------ |
| Consistency    | % chapters with 0 critical drift violations                        |
| Diversity      | 1 − mean Jaccard trigram similarity between stories of same niche  |
| Human voice    | 1 − mean aiScoreEstimate across all chapters (where non-null)      |
| Architecture   | % chapters that pass schema validation on first try (no fallback)  |

### Running

```bash
npm run benchmark
```

### Prerequisites

The dev server must be running (`npm run dev`) before executing the benchmark.

### Pass/fail threshold

All 4 metrics must score **≥ 0.85**. The script exits with code 1 if any
metric falls below this threshold, making it suitable as a CI regression guard.

## Boot environment

The server refuses to start without TLS material — there is no plain-HTTP
mode. Set the following before running `npm run dev`, `npm start`, or
`tsx src/start.ts`:

| Variable        | Required | Description                              |
| --------------- | -------- | ---------------------------------------- |
| `TLS_KEY_PATH`  | yes      | PEM-encoded private key file.            |
| `TLS_CERT_PATH` | yes      | PEM-encoded certificate (or chain).      |
| `TLS_CA_PATH`   | no       | Optional PEM CA bundle.                  |
| `PORT`          | no       | Listen port. Defaults to `8443`.         |
| `HOST`          | no       | Bind host. Defaults to `0.0.0.0`.        |
| `NODE_ENV`      | no       | `production` \| `development` \| `test`. |
| `LOG_LEVEL`     | no       | Override pino level.                     |

For local development, generate a self-signed cert (any approach works);
for staging and production, mount real cert material from the platform
secret store.

## Request id

Every request is assigned a UUID v4 request id. If the client sends
`x-request-id` and the value is a well-formed UUID v4, that value is
honoured; otherwise a fresh UUID v4 is generated. The resolved id is
mirrored back to the caller via the same header and bound to every log
line through pino's `reqId` field.

## HTTPS-only enforcement

Two layers:

1. **Listener-level (primary).** `start.ts` only ever binds an
   `https.Server` (`fastify({ https: { ... } })`). Without TLS material
   the boot script throws and exits.
2. **Request-level (defence in depth).** A Fastify hook rejects any
   request whose `request.protocol === 'http'` with
   `400 https_required` and `Cache-Control: no-store`. Active by default
   in `production` and `development`; disabled under `NODE_ENV=test` so
   `app.inject()` based tests can exercise the rest of the stack.

Together these satisfy Requirement 12.7 ("HTTPS only, TLS ≥ 1.2; reject
plain HTTP").
