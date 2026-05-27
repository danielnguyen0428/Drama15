/**
 * Unit tests for {@link startDevtoolsDetection}.
 *
 * Validates: Requirement 13.9 — heuristic detection emits exactly one
 * `devtools_detected` event when the window-size delta crosses the
 * threshold, and the returned stop fn cancels future polling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DETECTOR_INTERVAL_MS,
  DEFAULT_DETECTOR_THRESHOLD_PX,
  startDevtoolsDetection,
} from '../devtoolsDetector';

/**
 * Override `window.outerWidth` / `outerHeight` / `innerWidth` /
 * `innerHeight`. jsdom's defaults are 1024 x 768 for inner and 0 for
 * outer, so we have to seed both sides explicitly.
 */
function setViewport(opts: {
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
}): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: opts.innerWidth,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: opts.innerHeight,
  });
  Object.defineProperty(window, 'outerWidth', {
    configurable: true,
    value: opts.outerWidth,
  });
  Object.defineProperty(window, 'outerHeight', {
    configurable: true,
    value: opts.outerHeight,
  });
}

describe('startDevtoolsDetection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default to "DevTools closed": tiny chrome delta well under threshold.
    setViewport({
      innerWidth: 1024,
      innerHeight: 768,
      outerWidth: 1024,
      outerHeight: 800, // 32px of vertical chrome — typical browser
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call onDetected when the window-size delta stays below threshold', () => {
    const onDetected = vi.fn();
    const stop = startDevtoolsDetection({ onDetected });

    // Advance several intervals; deltas remain under threshold.
    vi.advanceTimersByTime(DEFAULT_DETECTOR_INTERVAL_MS * 5);

    expect(onDetected).not.toHaveBeenCalled();
    stop();
  });

  it('fires onDetected when the width delta exceeds the threshold (DevTools docked right)', () => {
    const onDetected = vi.fn();

    // DevTools docked to the right: outerWidth >> innerWidth.
    setViewport({
      innerWidth: 800,
      innerHeight: 768,
      outerWidth: 800 + DEFAULT_DETECTOR_THRESHOLD_PX + 50,
      outerHeight: 800,
    });

    const stop = startDevtoolsDetection({ onDetected });

    expect(onDetected).toHaveBeenCalledTimes(1);
    stop();
  });

  it('fires onDetected when the height delta exceeds the threshold (DevTools docked bottom)', () => {
    const onDetected = vi.fn();

    setViewport({
      innerWidth: 1024,
      innerHeight: 500,
      outerWidth: 1024,
      outerHeight: 500 + DEFAULT_DETECTOR_THRESHOLD_PX + 50,
    });

    const stop = startDevtoolsDetection({ onDetected });

    expect(onDetected).toHaveBeenCalledTimes(1);
    stop();
  });

  it('polls but never spams more than one event for the same detection', () => {
    const onDetected = vi.fn();

    // Detection happens immediately on first poll.
    setViewport({
      innerWidth: 800,
      innerHeight: 768,
      outerWidth: 800 + DEFAULT_DETECTOR_THRESHOLD_PX + 50,
      outerHeight: 800,
    });

    const stop = startDevtoolsDetection({
      onDetected,
      intervalMs: 50,
    });

    // Advance many intervals while the heuristic remains satisfied.
    vi.advanceTimersByTime(50 * 20);

    expect(onDetected).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stop() cancels polling: onDetected is not called after stop, even if the heuristic later triggers', () => {
    const onDetected = vi.fn();

    // Start with DevTools closed.
    setViewport({
      innerWidth: 1024,
      innerHeight: 768,
      outerWidth: 1024,
      outerHeight: 800,
    });

    const stop = startDevtoolsDetection({
      onDetected,
      intervalMs: 25,
    });

    // Advance a little — still no detection.
    vi.advanceTimersByTime(100);
    expect(onDetected).not.toHaveBeenCalled();

    // Stop the detector.
    stop();

    // Now simulate DevTools opening *after* stop.
    setViewport({
      innerWidth: 800,
      innerHeight: 768,
      outerWidth: 800 + DEFAULT_DETECTOR_THRESHOLD_PX + 50,
      outerHeight: 800,
    });

    // Drive the clock forward; the now-cleared interval must not fire.
    vi.advanceTimersByTime(25 * 50);

    expect(onDetected).not.toHaveBeenCalled();
  });

  it('stop() is idempotent', () => {
    const onDetected = vi.fn();
    const stop = startDevtoolsDetection({ onDetected });

    expect(() => {
      stop();
      stop();
      stop();
    }).not.toThrow();
  });

  it('self-stops after first detection: subsequent stop() is a no-op', () => {
    const onDetected = vi.fn();

    setViewport({
      innerWidth: 800,
      innerHeight: 768,
      outerWidth: 800 + DEFAULT_DETECTOR_THRESHOLD_PX + 50,
      outerHeight: 800,
    });

    const stop = startDevtoolsDetection({
      onDetected,
      intervalMs: 25,
    });

    expect(onDetected).toHaveBeenCalledTimes(1);

    // Drive clock forward — detector should be self-stopped already.
    vi.advanceTimersByTime(25 * 50);
    expect(onDetected).toHaveBeenCalledTimes(1);

    // Calling stop after self-stop must not throw.
    expect(() => stop()).not.toThrow();
  });

  it('treats outerWidth=0/outerHeight=0 as "no signal" and does not falsely trigger', () => {
    const onDetected = vi.fn();

    // jsdom's default behaviour: outer dims report 0 when no real
    // browser chrome exists. The detector must not interpret a huge
    // negative delta as "DevTools open".
    setViewport({
      innerWidth: 1024,
      innerHeight: 768,
      outerWidth: 0,
      outerHeight: 0,
    });

    const stop = startDevtoolsDetection({ onDetected, intervalMs: 25 });
    vi.advanceTimersByTime(25 * 10);

    expect(onDetected).not.toHaveBeenCalled();
    stop();
  });
});
