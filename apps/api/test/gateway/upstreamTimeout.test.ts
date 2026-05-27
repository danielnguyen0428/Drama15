/**
 * Unit tests for `withUpstreamTimeout`.
 *
 * Validates: Requirements 17.5.
 *
 * Drives the 60-second deadline via Vitest fake timers so the test
 * suite stays fast. The fakes intentionally avoid mocking
 * `AbortController` / `AbortSignal` — those are exercised against
 * the real Node.js implementations.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  UPSTREAM_TIMEOUT_MS,
  UpstreamTimeoutError,
  withUpstreamTimeout
} from '../../src/gateway/upstreamTimeout.js';

describe('withUpstreamTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the work result when work settles before the deadline', async () => {
    const pending = withUpstreamTimeout(async () => 'ok');

    // Work resolves synchronously on the next microtask; flush
    // pending microtasks without advancing the clock so the timer
    // never fires.
    await expect(pending).resolves.toBe('ok');
  });

  it('rejects with UpstreamTimeoutError when work does not settle within 60s', async () => {
    let observedSignal: AbortSignal | undefined;
    const pending = withUpstreamTimeout((signal) => {
      observedSignal = signal;
      // Never-resolving promise — the deadline is what should win.
      return new Promise<never>(() => {});
    });

    // Attach a catch handler before advancing timers so the
    // upcoming rejection is observed and Node doesn't flag it as
    // an unhandledRejection between `advanceTimersByTimeAsync` and
    // the `expect` below.
    const settled = pending.catch((err) => err);

    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS);
    const result = await settled;

    expect(result).toBeInstanceOf(UpstreamTimeoutError);
    expect((result as UpstreamTimeoutError).code).toBe('upstream_timeout');
    // Cooperative-cancellation contract: the signal handed to
    // `work` is aborted by the time the deadline fires.
    expect(observedSignal?.aborted).toBe(true);
  });

  it('does not fire the deadline before timeoutMs has elapsed', async () => {
    const pending = withUpstreamTimeout((_signal) =>
      new Promise<never>(() => {})
    );
    const settled = pending.catch((err) => err);

    // One millisecond shy of the deadline: nothing should have
    // settled yet.
    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS - 1);

    let resolved = false;
    void settled.then(() => {
      resolved = true;
    });
    // Flush microtasks without moving the clock.
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Cross the deadline.
    await vi.advanceTimersByTimeAsync(1);
    const result = await settled;
    expect(result).toBeInstanceOf(UpstreamTimeoutError);
  });

  it('honours a custom timeoutMs', async () => {
    let observedSignal: AbortSignal | undefined;
    const pending = withUpstreamTimeout(
      (signal) => {
        observedSignal = signal;
        return new Promise<never>(() => {});
      },
      { timeoutMs: 100 }
    );
    const settled = pending.catch((err) => err);

    await vi.advanceTimersByTimeAsync(100);
    const result = await settled;

    expect(result).toBeInstanceOf(UpstreamTimeoutError);
    expect((result as UpstreamTimeoutError).code).toBe('upstream_timeout');
    expect(observedSignal?.aborted).toBe(true);
  });

  it('exposes the public error code on UpstreamTimeoutError', () => {
    const err = new UpstreamTimeoutError();
    expect(err.code).toBe('upstream_timeout');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UpstreamTimeoutError);
  });

  it('exports the 60_000 ms default constant', () => {
    // Sentinel guard: changing this constant changes the SLA the
    // gateway promises clients (Requirement 17.5).
    expect(UPSTREAM_TIMEOUT_MS).toBe(60_000);
  });

  it('propagates errors thrown by work without wrapping them', async () => {
    const boom = new Error('upstream connection refused');
    await expect(
      withUpstreamTimeout(async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
  });
});
