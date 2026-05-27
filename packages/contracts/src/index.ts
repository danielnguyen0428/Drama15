/**
 * `@drama15/contracts` — shared TypeScript contracts for the Drama15 commercial
 * web SaaS. Consumed by:
 *
 * - `apps/api` (API_Gateway / Auth_Service / License_Service)
 * - `apps/web` (Web_Client SPA)
 * - `apps/admin` (Admin_Console)
 *
 * The package contains only types and `const` enum-like unions — no runtime
 * helpers — so it can be safely imported on either side of the trust boundary.
 *
 * Validates: Requirements 3.4, 3.5, 5.9, 6.12, 19.3.
 */

export * from './auth.js';
export * from './plan.js';
export * from './quota.js';
export * from './errors.js';
export * from './devices.js';
export * from './stories.js';
export * from './rewrite.js';
export * from './automation.js';
export * from './voice.js';
export * from './export.js';
export * from './admin.js';
export * from './locale.js';
