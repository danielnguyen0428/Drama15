/**
 * DevTools detection heuristic.
 *
 * Validates: Requirement 13.9
 *   "WHERE trình duyệt mở DevTools và phát hiện được, THE Web_Client SHALL
 *    hiển thị cảnh báo và phải ghi sự kiện qua Audit_Logger."
 *
 * Heuristic choice:
 * -----------------
 * Browser DevTools openness cannot be queried directly. The two most
 * commonly cited tricks are:
 *
 *   1. Window-size delta. When DevTools is docked to the right or to the
 *      bottom of the browser viewport, the gap between `window.outerWidth`
 *      and `window.innerWidth` (or `outerHeight` vs `innerHeight`) widens
 *      well past the chrome's normal scrollbar/border budget (~16px).
 *      A threshold of ~160px reliably separates "DevTools docked" from
 *      "regular browser chrome" across Chromium, Firefox and WebKit on
 *      desktop.
 *
 *   2. `console.log` toString-getter trick (Firebug-era). Logging an
 *      object whose `.toString` (or `.id`) is an accessor causes the
 *      DevTools console to invoke the getter when the user expands the
 *      entry. This catches *floating* (undocked) DevTools that the
 *      window-size heuristic misses, but only fires when the user
 *      interacts with the console panel, and modern Chromium versions
 *      have made it less reliable.
 *
 * We pick **the window-size delta heuristic** because:
 *   - it is deterministic, testable in jsdom (`window.outerWidth` /
 *     `innerWidth` are mockable), and does not depend on user
 *     interaction with the DevTools UI.
 *   - it covers the common case (docked DevTools) which is what the
 *     spec's "phát hiện được" ("when detected") clause targets.
 *
 * False negatives (floating DevTools, mobile DevTools over USB, browser
 * extensions that proxy console output) are accepted: Requirement 13.9
 * uses WHERE rather than WHEN, so we are only obligated to emit the
 * audit event *when* detection succeeds, not to detect every possible
 * configuration.
 *
 * False positives (very narrow viewports, multi-monitor scaling
 * artefacts) are mitigated by the 160px threshold and by firing the
 * audit event at most once per detection lifecycle (see `triggered`).
 */

/** Default polling cadence. 1s feels responsive without being noisy. */
export const DEFAULT_DETECTOR_INTERVAL_MS = 1000;

/**
 * Default outer/inner pixel delta above which we consider DevTools
 * docked. Browser chrome (scrollbars, window borders) is well under
 * this on every desktop browser we support.
 */
export const DEFAULT_DETECTOR_THRESHOLD_PX = 160;

export interface StartDevtoolsDetectionOptions {
  /**
   * Callback fired exactly once when DevTools is first detected.
   * After invocation the polling loop self-stops; callers do not
   * need to call the returned stop fn in that case.
   */
  readonly onDetected: () => void;
  /** Polling interval in milliseconds. Defaults to {@link DEFAULT_DETECTOR_INTERVAL_MS}. */
  readonly intervalMs?: number;
  /** Outer-vs-inner pixel delta threshold. Defaults to {@link DEFAULT_DETECTOR_THRESHOLD_PX}. */
  readonly thresholdPx?: number;
}

/**
 * Start the DevTools detection polling loop.
 *
 * @returns A stop function. Calling it cancels the polling loop. Safe
 *   to call multiple times; subsequent calls are no-ops. Already
 *   self-stopped after a successful detection.
 *
 * Behavioural guarantees (covered by `__tests__/devtoolsDetector.test.ts`):
 *   - `onDetected` is called at most once per `startDevtoolsDetection`
 *     invocation, even if the heuristic remains satisfied for many
 *     subsequent polls.
 *   - The returned stop function cancels future polls; `onDetected`
 *     will not fire after `stop()` returns.
 *   - In non-browser environments (no `window`) the detector becomes a
 *     no-op and `onDetected` is never called.
 */
export function startDevtoolsDetection(
  options: StartDevtoolsDetectionOptions,
): () => void {
  const {
    onDetected,
    intervalMs = DEFAULT_DETECTOR_INTERVAL_MS,
    thresholdPx = DEFAULT_DETECTOR_THRESHOLD_PX,
  } = options;

  // No-op outside a browser environment (SSR, unit tests without jsdom).
  if (typeof window === 'undefined') {
    return () => {
      /* noop */
    };
  }

  let stopped = false;
  let triggered = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const isDevtoolsOpen = (): boolean => {
    // jsdom and some embedded browsers report 0 for outer dimensions;
    // treat them as "no signal" rather than "huge negative delta".
    const outerW = window.outerWidth;
    const outerH = window.outerHeight;
    if (outerW <= 0 && outerH <= 0) {
      return false;
    }
    const widthDelta = outerW - window.innerWidth;
    const heightDelta = outerH - window.innerHeight;
    return widthDelta > thresholdPx || heightDelta > thresholdPx;
  };

  const check = (): void => {
    if (stopped || triggered) return;
    if (!isDevtoolsOpen()) return;
    triggered = true;
    try {
      onDetected();
    } finally {
      // Self-stop: once detected, there's nothing more to learn from
      // further polls. The user must reload to "un-detect".
      stop();
    }
  };

  intervalId = setInterval(check, intervalMs);
  // Run an immediate check so we don't wait one full interval before
  // reacting to DevTools that was already open at startup.
  check();

  return stop;
}
