# Web_Client SPA (`@drama15/web`)

React + Vite + TypeScript single-page application for the commercial SaaS
version of Drama15 Lite Studio. Lives at `apps/web/` in the monorepo.

## Scripts

| Script           | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `npm run dev`    | Local dev server on http://localhost:5173 (unobfuscated).  |
| `npm run build`  | Production build: type-check + Vite build (see below).     |
| `npm run preview`| Preview the production build locally.                      |
| `npm test`       | Run the Vitest unit/property suite once.                   |
| `npm run test:watch` | Watch-mode tests.                                       |

## Production build: minified AND obfuscated (Requirement 13.1)

Per requirement **13.1** of `commercial-web-saas`:

> THE Web_Client SHALL be built minified and obfuscated before deployment.

The Vite config (`vite.config.ts`) implements this in two layers:

1. **Minification** — `build.minify: 'esbuild'` runs on every `vite build`.
2. **Obfuscation** — `vite-plugin-javascript-obfuscator` is added to the
   plugin pipeline **only** when `command === 'build' && mode === 'production'`.
   It applies to all emitted `*.js` / `*.mjs` chunks under the build output and
   uses conservative settings (`controlFlowFlattening: 0.5`,
   `stringArray: true`, `stringArrayThreshold: 0.5`, `simplify: true`,
   `deadCodeInjection: false`) to avoid pathological bundle bloat while still
   raising the cost of reverse-engineering.

Dev (`vite dev`) and tests (`vitest`) deliberately skip the obfuscator so
debugging and stack traces stay readable.

To produce the deployable artifact:

```bash
npm run build           # equivalent to vite build --mode production
```

The resulting `dist/` directory contains the minified + obfuscated bundle
ready to be served from the production CDN.

## Notes

- This package is part of the monorepo defined in
  `.kiro/specs/commercial-web-saas/`. It must not modify or depend on the
  legacy `desktop/` Electron renderer — that codebase remains untouched.
- Token storage rules (Requirement 13.6 – 13.8) are enforced by later tasks
  (16.6, 16.7); the scaffold here only provides the build pipeline and a
  placeholder root component.
