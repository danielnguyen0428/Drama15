# @drama15/admin — Admin_Console SPA

Internal Admin_Console for the Drama15 Lite Studio commercial SaaS. This is a separate
React + Vite single-page application from the public `Web_Client` (`apps/web`).

## Separate origin (Requirement 16.1)

Per Requirement 16.1 and the design document, the `Admin_Console` is a distinct SPA
served from a different origin than the public `Web_Client`. In development this is
expressed as a different port:

| App            | Package           | Dev port |
| -------------- | ----------------- | -------- |
| Web_Client     | `@drama15/web`    | `5173`   |
| Admin_Console  | `@drama15/admin`  | `5174`   |

Production deployments must use distinct domains (or at minimum distinct subdomains)
so the browser treats them as separate origins for cookie isolation and CORS.

## TOTP enforcement

The login route at `/login` is currently a UI shell only. Real TOTP verification and
admin-role gating are wired in a later wave:

- Backend TOTP login route — task **5.11 Implement Admin TOTP login flow**.
- UI wiring of the TOTP form to the backend — task **18.1 Implement admin login UI with TOTP**.

This scaffold exists so wave-0 can stand up the SPA on its own origin without
implementing security-critical code that belongs in those later tasks.

## Scripts

```sh
npm run dev      # start Vite dev server on http://localhost:5174
npm run build    # type-check and produce a production bundle in dist/
npm run preview  # serve the built bundle on port 5174
npm test         # run vitest once (jsdom)
npm run test:watch
```
