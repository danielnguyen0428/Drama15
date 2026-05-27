import { describe, expect, it } from 'vitest';
import {
  paidPreExpiryTemplate,
  piiBreachTemplate,
  NotificationError,
  type EmailMessage
} from '../../src/notifications/index.js';

/**
 * Patterns that must NOT appear in any rendered notification body
 * (defence in depth — Requirement 15.4 forbids logging tokens; the same
 * rule applies to outgoing email bodies). The list is deliberately
 * conservative: we look for the literal substrings of token shapes that
 * the rest of the system uses internally.
 */
const FORBIDDEN_FRAGMENTS: readonly string[] = [
  'Bearer ',
  'access_token',
  'access-token',
  'refresh_token',
  'refresh-token',
  'authorization=',
  'Authorization:',
  'eyJhbGciOi' // canonical base64-url prefix of a HS256/RS256 JWT header
];

function assertNoTokens(msg: EmailMessage): void {
  for (const fragment of FORBIDDEN_FRAGMENTS) {
    expect(msg.html).not.toContain(fragment);
    expect(msg.text).not.toContain(fragment);
    expect(msg.subject).not.toContain(fragment);
  }
}

describe('paidPreExpiryTemplate', () => {
  const baseInput = {
    userId: 'user-abc',
    paidCycleId: 'cycle-123',
    email: 'jane@example.com',
    displayName: 'Jane Doe',
    paidExpireAt: new Date('2025-04-15T12:00:00Z')
  } as const;

  it('renders the pinned vi subject and includes the formatted expiry timestamp', () => {
    const msg = paidPreExpiryTemplate({ ...baseInput, locale: 'vi' });
    expect(msg.subject).toBe('Gói Paid_Plan của bạn sắp hết hạn');
    // vi formatting tags the local timezone label so the recipient is
    // never confused about which clock they are reading.
    expect(msg.text).toContain('giờ Việt Nam');
    expect(msg.html).toContain('giờ Việt Nam');
  });

  it('renders the pinned en subject and stamps the UTC label', () => {
    const msg = paidPreExpiryTemplate({ ...baseInput, locale: 'en' });
    expect(msg.subject).toBe('Your Paid_Plan is about to expire');
    expect(msg.text).toContain('UTC');
    expect(msg.html).toContain('UTC');
  });

  it('builds idempotencyKey as pre_expiry:{userId}:{paidCycleId}', () => {
    const vi = paidPreExpiryTemplate({ ...baseInput, locale: 'vi' });
    const en = paidPreExpiryTemplate({ ...baseInput, locale: 'en' });
    expect(vi.idempotencyKey).toBe('pre_expiry:user-abc:cycle-123');
    expect(en.idempotencyKey).toBe('pre_expiry:user-abc:cycle-123');
  });

  it('includes the recipient display name and email destination', () => {
    const msg = paidPreExpiryTemplate({ ...baseInput, locale: 'en' });
    expect(msg.to).toBe('jane@example.com');
    expect(msg.text).toContain('Jane Doe');
    expect(msg.html).toContain('Jane Doe');
  });

  it('does not leak access tokens or refresh tokens into the body', () => {
    assertNoTokens(paidPreExpiryTemplate({ ...baseInput, locale: 'vi' }));
    assertNoTokens(paidPreExpiryTemplate({ ...baseInput, locale: 'en' }));
  });

  it('rejects an unsupported locale with NotificationError(unsupported_locale)', () => {
    expect(() =>
      paidPreExpiryTemplate({
        ...baseInput,
        // @ts-expect-error — exercising the runtime guard
        locale: 'fr'
      })
    ).toThrow(NotificationError);
  });

  it('escapes HTML in the display name to prevent injection', () => {
    const msg = paidPreExpiryTemplate({
      ...baseInput,
      displayName: '<script>alert(1)</script>',
      locale: 'en'
    });
    expect(msg.html).not.toContain('<script>alert(1)</script>');
    expect(msg.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('piiBreachTemplate', () => {
  const baseInput = {
    userId: 'user-xyz',
    breachId: 'incident-2025-04-08-001',
    email: 'bob@example.com',
    displayName: 'Bob Smith'
  } as const;

  it('renders the pinned vi subject', () => {
    const msg = piiBreachTemplate({ ...baseInput, locale: 'vi' });
    expect(msg.subject).toBe(
      'Thông báo sự cố bảo mật ảnh hưởng đến dữ liệu cá nhân của bạn'
    );
  });

  it('renders the pinned en subject', () => {
    const msg = piiBreachTemplate({ ...baseInput, locale: 'en' });
    expect(msg.subject).toBe('Security incident notice affecting your personal data');
  });

  it('includes the breach id verbatim so recipients can correlate', () => {
    const vi = piiBreachTemplate({ ...baseInput, locale: 'vi' });
    const en = piiBreachTemplate({ ...baseInput, locale: 'en' });
    expect(vi.text).toContain('incident-2025-04-08-001');
    expect(vi.html).toContain('incident-2025-04-08-001');
    expect(en.text).toContain('incident-2025-04-08-001');
    expect(en.html).toContain('incident-2025-04-08-001');
  });

  it('builds idempotencyKey as breach:{userId}:{breachId}', () => {
    const msg = piiBreachTemplate({ ...baseInput, locale: 'en' });
    expect(msg.idempotencyKey).toBe('breach:user-xyz:incident-2025-04-08-001');
  });

  it('mentions the categories of PII potentially affected (per glossary)', () => {
    const vi = piiBreachTemplate({ ...baseInput, locale: 'vi' });
    expect(vi.text).toMatch(/email/i);
    expect(vi.text).toMatch(/IP/);

    const en = piiBreachTemplate({ ...baseInput, locale: 'en' });
    expect(en.text).toMatch(/email/i);
    expect(en.text).toMatch(/IP/);
  });

  it('does not leak access tokens or refresh tokens into the body', () => {
    assertNoTokens(piiBreachTemplate({ ...baseInput, locale: 'vi' }));
    assertNoTokens(piiBreachTemplate({ ...baseInput, locale: 'en' }));
  });

  it('rejects unsupported locales with NotificationError(unsupported_locale)', () => {
    let captured: NotificationError | undefined;
    try {
      piiBreachTemplate({
        ...baseInput,
        // @ts-expect-error — exercising runtime guard
        locale: 'es'
      });
    } catch (err) {
      captured = err as NotificationError;
    }
    expect(captured).toBeInstanceOf(NotificationError);
    expect(captured?.code).toBe('unsupported_locale');
  });
});
