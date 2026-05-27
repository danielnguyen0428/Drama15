import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  concurrencyStoryKey,
  formatUtcDate,
  quotaFreeChapterKey,
  quotaPaidStoryKey,
  quotaPaidVoiceKey,
  quotaRewriteKey,
  rateRpmKey
} from '../../src/redis/keys.js';

describe('redis key builders', () => {
  it('quotaFreeChapterKey matches the documented format', () => {
    expect(quotaFreeChapterKey('user-1', '2025-03-09')).toBe(
      'quota:free:chapter:user-1:2025-03-09'
    );
  });

  it('quotaPaidStoryKey matches the documented format', () => {
    expect(quotaPaidStoryKey('user-1', 'cycle-7')).toBe('quota:paid:story:user-1:cycle-7');
  });

  it('quotaPaidVoiceKey matches the documented format', () => {
    expect(quotaPaidVoiceKey('user-1', 'cycle-7')).toBe('quota:paid:voice:user-1:cycle-7');
  });

  it('quotaRewriteKey matches the documented format', () => {
    expect(quotaRewriteKey('user-1', '2025-03-09')).toBe('quota:rewrite:user-1:2025-03-09');
  });

  it('rateRpmKey matches the documented format', () => {
    expect(rateRpmKey('user-1')).toBe('rate:rpm:user-1');
  });

  it('concurrencyStoryKey matches the documented format', () => {
    expect(concurrencyStoryKey('user-1')).toBe('concurrency:story:user-1');
  });

  it('rejects empty or non-string user ids', () => {
    expect(() => quotaFreeChapterKey('', '2025-03-09')).toThrow(TypeError);
    expect(() => quotaPaidStoryKey('user-1', '')).toThrow(TypeError);
    expect(() => rateRpmKey('')).toThrow(TypeError);
    // @ts-expect-error - exercising runtime guard against non-string input
    expect(() => quotaPaidVoiceKey(undefined, 'c')).toThrow(TypeError);
  });
});

describe('formatUtcDate', () => {
  // The host machine running this test could be in any time zone. We pin
  // process.env.TZ to a non-UTC zone so a buggy implementation that
  // relied on `getDate()`/local components would produce a wrong result.
  const originalTZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  });

  it('returns the UTC calendar date even when the host is in a behind-UTC zone', () => {
    // 2025-03-09T23:30:00Z is 2025-03-09 in UTC but 2025-03-09 16:30
    // local in Los Angeles — both happen to fall on the same day, so we
    // also cover the rollover case below.
    expect(formatUtcDate(new Date('2025-03-09T23:30:00Z'))).toBe('2025-03-09');
  });

  it('does not roll the day backward in a behind-UTC zone', () => {
    // 2025-03-10T01:00:00Z is 2025-03-09 18:00 in Los Angeles. A naive
    // implementation using local-time getters would produce '2025-03-09';
    // the UTC-correct result is '2025-03-10'.
    expect(formatUtcDate(new Date('2025-03-10T01:00:00Z'))).toBe('2025-03-10');
  });

  it('handles UTC midnight exactly', () => {
    expect(formatUtcDate(new Date('2025-03-10T00:00:00Z'))).toBe('2025-03-10');
  });

  it('throws on invalid Dates', () => {
    expect(() => formatUtcDate(new Date('not-a-date'))).toThrow(TypeError);
    // @ts-expect-error - exercising runtime guard against non-Date input
    expect(() => formatUtcDate('2025-03-09')).toThrow(TypeError);
  });
});
