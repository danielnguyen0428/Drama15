import { describe, it, expect } from 'vitest';
import { secondsUntilCycleEnd, secondsUntilEndOfUtcDay } from '../../src/redis/ttl.js';

describe('secondsUntilEndOfUtcDay', () => {
  it('returns 60 when one minute remains in the UTC day', () => {
    expect(secondsUntilEndOfUtcDay(new Date('2025-03-09T23:59:00Z'))).toBe(60);
  });

  it('returns 86400 at exact UTC midnight (full day ahead)', () => {
    expect(secondsUntilEndOfUtcDay(new Date('2025-03-09T00:00:00Z'))).toBe(86400);
  });

  it('clamps to 1 second when only sub-second remains', () => {
    // 23:59:59.500Z → 500ms left, floor would be 0; helper must clamp ≥ 1.
    expect(secondsUntilEndOfUtcDay(new Date('2025-03-09T23:59:59.500Z'))).toBe(1);
  });

  it('rejects invalid Dates', () => {
    expect(() => secondsUntilEndOfUtcDay(new Date('not-a-date'))).toThrow(TypeError);
  });
});

describe('secondsUntilCycleEnd', () => {
  it('returns the integer number of seconds between now and cycle end', () => {
    // 2025-03-09 00:00:00Z → 2025-04-01 00:00:00Z is exactly 23 days.
    const now = new Date('2025-03-09T00:00:00Z');
    const cycleEnd = new Date('2025-04-01T00:00:00Z');
    expect(secondsUntilCycleEnd(cycleEnd, now)).toBe(23 * 86400);
  });

  it('returns 0 when the cycle end is already in the past', () => {
    const now = new Date('2025-04-02T00:00:00Z');
    const cycleEnd = new Date('2025-04-01T00:00:00Z');
    expect(secondsUntilCycleEnd(cycleEnd, now)).toBe(0);
  });

  it('returns 0 when now equals cycle end', () => {
    const t = new Date('2025-04-01T00:00:00Z');
    expect(secondsUntilCycleEnd(t, t)).toBe(0);
  });

  it('rejects invalid Dates', () => {
    expect(() => secondsUntilCycleEnd(new Date('NaN'), new Date())).toThrow(TypeError);
    expect(() => secondsUntilCycleEnd(new Date(), new Date('NaN'))).toThrow(TypeError);
  });
});
