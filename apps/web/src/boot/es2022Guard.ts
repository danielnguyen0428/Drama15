/**
 * ES2022 capability guard (Requirement 18.2).
 *
 * Drama15 Lite Studio's bundle is shipped at `target: 'es2022'` (see
 * `vite.config.ts`). If a user lands on the SPA from a browser that does
 * not implement core ES2022 features the JavaScript engine will hit
 * unknown identifiers (`Object.hasOwn`, `Array.prototype.at`, etc.) and
 * fail to parse / execute, leaving the page blank with no actionable
 * message.
 *
 * To satisfy Requirement 18.2 ("THE Web_Client SHALL chặn truy cập từ
 * trình duyệt không hỗ trợ ECMAScript 2022 và phải hiển thị thông báo
 * nâng cấp trình duyệt") we run a defensive feature-detect on boot,
 * before `createRoot` is called. When at least one detectable is missing
 * we replace `#root`'s content with a localized upgrade notice (vi/en)
 * and abort SPA initialization.
 *
 * The guard intentionally avoids any React / framework dependency: we
 * cannot trust that the React runtime itself parses on a missing-ES2022
 * engine, so we render with raw DOM APIs.
 */

import type { Locale } from '../i18n/types';

/**
 * Result of {@link detectEs2022}.
 *
 * `supported` is `true` only when every probed ES2022 capability is
 * present. `missing` lists the human-readable names of the capabilities
 * that failed detection (empty when supported).
 */
export interface Es2022DetectionResult {
  readonly supported: boolean;
  readonly missing: readonly string[];
}

/**
 * Feature-detect the subset of ES2022 capabilities Drama15 Lite Studio
 * relies on at runtime. We pick stable, broadly polyfill-resistant
 * surface area so the detector is meaningful:
 *
 * - `Object.hasOwn` — ES2022 (replaces `Object.prototype.hasOwnProperty.call`).
 * - `Array.prototype.at` — ES2022 (used for negative-index access).
 * - `Array.prototype.findLast` — ES2023, but every engine that ships
 *   ES2022-class output also ships this; combined with the others it
 *   gives high confidence the engine is current.
 * - `String.prototype.replaceAll` — ES2021 / ES2022 (broadly used by
 *   render helpers).
 * - `Error.cause` — ES2022 (`new Error(msg, { cause })`).
 *
 * The function never throws: a missing global or a runtime error in the
 * probe is treated as "missing" and recorded in the result.
 */
export function detectEs2022(): Es2022DetectionResult {
  const missing: string[] = [];

  if (typeof Object.hasOwn !== 'function') {
    missing.push('Object.hasOwn');
  }

  if (typeof Array.prototype.at !== 'function') {
    missing.push('Array.prototype.at');
  }

  // `findLast` lives on Array.prototype in ES2023. We probe via the
  // prototype directly so a polyfill or environment lacking the
  // method is detected uniformly.
  if (
    typeof (Array.prototype as { findLast?: unknown }).findLast !== 'function'
  ) {
    missing.push('Array.prototype.findLast');
  }

  if (typeof String.prototype.replaceAll !== 'function') {
    missing.push('String.prototype.replaceAll');
  }

  // `Error.cause` is observable via `new Error(msg, { cause })`. Older
  // engines silently ignore the `options` argument, so probe by
  // round-tripping a sentinel and checking equality.
  try {
    const sentinel = { __probe: true };
    const probed = new Error('es2022-probe', { cause: sentinel });
    if ((probed as { cause?: unknown }).cause !== sentinel) {
      missing.push('Error.cause');
    }
  } catch {
    missing.push('Error.cause');
  }

  return {
    supported: missing.length === 0,
    missing,
  };
}

/**
 * Localized labels for the upgrade notice. Kept inline (rather than in
 * the i18n catalog) so the notice still renders correctly on engines
 * where the catalog modules themselves fail to evaluate.
 */
const UPGRADE_NOTICE_LABELS = {
  vi: {
    title: 'Trình duyệt của bạn đã quá cũ',
    body: 'Drama15 Lite Studio yêu cầu trình duyệt hỗ trợ ECMAScript 2022. Vui lòng cập nhật Chrome, Edge, Firefox hoặc Safari lên phiên bản phát hành trong 12 tháng gần nhất rồi tải lại trang.',
    missingLabel: 'Tính năng còn thiếu',
  },
  en: {
    title: 'Your browser is too old',
    body: 'Drama15 Lite Studio requires a browser that supports ECMAScript 2022. Please update Chrome, Edge, Firefox or Safari to a version released in the last 12 months and reload the page.',
    missingLabel: 'Missing capabilities',
  },
} as const satisfies Record<Locale, { title: string; body: string; missingLabel: string }>;

/**
 * Replace `rootEl`'s contents with the localized upgrade notice.
 *
 * Uses `textContent` (never `innerHTML`) so we cannot inject markup
 * even if the locale label or capability names ever sourced from
 * untrusted input.
 */
function renderUpgradeNotice(
  rootEl: Element,
  locale: Locale,
  missing: readonly string[],
): void {
  const labels = UPGRADE_NOTICE_LABELS[locale];

  // Reset the container.
  while (rootEl.firstChild) {
    rootEl.removeChild(rootEl.firstChild);
  }

  const doc = rootEl.ownerDocument ?? document;

  const wrapper = doc.createElement('section');
  wrapper.setAttribute('role', 'alert');
  wrapper.setAttribute('lang', locale);
  wrapper.setAttribute('data-testid', 'es2022-upgrade-notice');

  const heading = doc.createElement('h1');
  heading.textContent = labels.title;
  wrapper.appendChild(heading);

  const paragraph = doc.createElement('p');
  paragraph.textContent = labels.body;
  wrapper.appendChild(paragraph);

  if (missing.length > 0) {
    const detail = doc.createElement('p');
    detail.textContent = `${labels.missingLabel}: ${missing.join(', ')}`;
    detail.setAttribute('data-testid', 'es2022-missing-list');
    wrapper.appendChild(detail);
  }

  rootEl.appendChild(wrapper);
}

/**
 * Run on SPA boot. When the runtime supports ES2022 returns `true` and
 * leaves `rootEl` untouched so `createRoot` can mount the app. When the
 * runtime does NOT support ES2022, replaces `rootEl`'s content with a
 * localized upgrade notice and returns `false` so the caller can abort
 * SPA initialization.
 */
export function requireEs2022OrAbort(
  rootEl: Element,
  locale: Locale,
): boolean {
  const result = detectEs2022();
  if (result.supported) {
    return true;
  }
  renderUpgradeNotice(rootEl, locale, result.missing);
  return false;
}
