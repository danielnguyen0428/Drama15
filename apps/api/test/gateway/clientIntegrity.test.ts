import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClientIntegrityMiddleware,
  IntegrityError
} from '../../src/gateway/clientIntegrity.js';
import type {
  IntegrityFailureEvent,
  IntegrityFlagger as IIntegrityFlagger,
  RecordIntegrityFailureResult
} from '../../src/integrity/types.js';

/**
 * Tests for `ClientIntegrityMiddleware` (Task 7.7).
 *
 * Validates: Requirements 13.3, 13.4
 *
 * Each test sets up a fresh middleware + spy flagger so assertions
 * about `recordIntegrityFailure` calls remain hermetic.
 */

class SpyFlagger implements IIntegrityFlagger {
  public calls: IntegrityFailureEvent[] = [];
  public stub: RecordIntegrityFailureResult = { flagged: false, count24h: 1 };

  async recordIntegrityFailure(
    event: IntegrityFailureEvent
  ): Promise<RecordIntegrityFailureResult> {
    this.calls.push(event);
    return this.stub;
  }
}

const ALLOWED_HASH = 'abc123def456';
const ANOTHER_HASH = '0123456789abcdef';

const TS = new Date('2025-03-09T00:00:00Z');
const CTX = {
  userId: 'u-1',
  fingerprint: 'fp-abc',
  ip: '203.0.113.7',
  ts: TS
} as const;

describe('ClientIntegrityMiddleware (Requirements 13.3, 13.4)', () => {
  let flagger: SpyFlagger;
  let middleware: ClientIntegrityMiddleware;

  beforeEach(() => {
    flagger = new SpyFlagger();
    middleware = new ClientIntegrityMiddleware({
      allowedBuildHashes: [ALLOWED_HASH, ANOTHER_HASH],
      flagger
    });
  });

  it('accepts a header that matches an allowed build hash', async () => {
    await expect(
      middleware.validate({ ...CTX, headerValue: ALLOWED_HASH })
    ).resolves.toBeUndefined();
    expect(flagger.calls).toHaveLength(0);
  });

  it('matches case-insensitively (build hash hex is canonicalised)', async () => {
    await expect(
      middleware.validate({ ...CTX, headerValue: ALLOWED_HASH.toUpperCase() })
    ).resolves.toBeUndefined();

    // Mixed case allowlist entries are normalised at construction time too.
    const mw = new ClientIntegrityMiddleware({
      allowedBuildHashes: ['ABC123DEF456'],
      flagger
    });
    await expect(
      mw.validate({ ...CTX, headerValue: 'abc123def456' })
    ).resolves.toBeUndefined();
    await expect(
      mw.validate({ ...CTX, headerValue: '  AbC123DeF456  ' })
    ).resolves.toBeUndefined();
    expect(flagger.calls).toHaveLength(0);
  });

  it('rejects a mismatched header with IntegrityError(client_integrity_failed) AND records exactly one flagger failure with the request context', async () => {
    await expect(
      middleware.validate({ ...CTX, headerValue: 'deadbeef' })
    ).rejects.toMatchObject({
      name: 'IntegrityError',
      code: 'client_integrity_failed'
    });

    // The thrown error must be an IntegrityError instance — gateway
    // glue uses `instanceof` to map onto the canonical 4xx envelope.
    await expect(
      middleware.validate({ ...CTX, headerValue: 'deadbeef' })
    ).rejects.toBeInstanceOf(IntegrityError);

    expect(flagger.calls).toHaveLength(2);
    expect(flagger.calls[0]).toEqual({
      userId: CTX.userId,
      fingerprint: CTX.fingerprint,
      ip: CTX.ip,
      ts: CTX.ts
    });
  });

  it('rejects a missing header WITHOUT recording with the flagger', async () => {
    await expect(
      middleware.validate({ ...CTX, headerValue: undefined })
    ).rejects.toBeInstanceOf(IntegrityError);
    await expect(
      middleware.validate({ ...CTX, headerValue: null })
    ).rejects.toBeInstanceOf(IntegrityError);
    expect(flagger.calls).toHaveLength(0);
  });

  it('rejects an empty / whitespace-only header WITHOUT recording with the flagger', async () => {
    await expect(
      middleware.validate({ ...CTX, headerValue: '' })
    ).rejects.toBeInstanceOf(IntegrityError);
    await expect(
      middleware.validate({ ...CTX, headerValue: '   ' })
    ).rejects.toBeInstanceOf(IntegrityError);
    expect(flagger.calls).toHaveLength(0);
  });

  it('still rejects mismatches when no flagger is configured', async () => {
    const mw = new ClientIntegrityMiddleware({
      allowedBuildHashes: [ALLOWED_HASH]
      // no flagger — gateway must still reject the request
    });
    await expect(
      mw.validate({ ...CTX, headerValue: 'wrong-hash' })
    ).rejects.toBeInstanceOf(IntegrityError);
  });

  it('throws on construction when allowedBuildHashes is empty', () => {
    expect(
      () =>
        new ClientIntegrityMiddleware({
          allowedBuildHashes: [],
          flagger
        })
    ).toThrow(RangeError);
  });

  it('throws on construction when allowedBuildHashes normalises to empty (only whitespace entries)', () => {
    expect(
      () =>
        new ClientIntegrityMiddleware({
          allowedBuildHashes: ['   ', ''],
          flagger
        })
    ).toThrow(RangeError);
  });

  it('propagates flagger errors instead of swallowing them', async () => {
    const failing: IIntegrityFlagger = {
      recordIntegrityFailure: async () => {
        throw new Error('redis down');
      }
    };
    const mw = new ClientIntegrityMiddleware({
      allowedBuildHashes: [ALLOWED_HASH],
      flagger: failing
    });
    await expect(
      mw.validate({ ...CTX, headerValue: 'no-good' })
    ).rejects.toMatchObject({ message: 'redis down' });
  });
});
