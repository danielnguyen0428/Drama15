import { describe, it, expect } from 'vitest';
import {
  composeDeviceFingerprintInput,
  computeDeviceFingerprint,
  computeDeviceFingerprintFromInputs,
  type DeviceFingerprintInputs,
} from '../deviceFingerprint';

const baseInputs: DeviceFingerprintInputs = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  platform: 'Linux x86_64',
  screenWidth: 1920,
  screenHeight: 1080,
  colorDepth: 24,
  timeZone: 'Asia/Ho_Chi_Minh',
  hardwareConcurrency: 8,
};

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

describe('deviceFingerprint', () => {
  it('produces a stable hash for the same inputs across calls', async () => {
    const a = await computeDeviceFingerprintFromInputs(baseInputs);
    const b = await computeDeviceFingerprintFromInputs({ ...baseInputs });
    expect(a).toBe(b);
  });

  it('produces base64url-charset output (no +, /, or = padding)', async () => {
    const hash = await computeDeviceFingerprintFromInputs(baseInputs);
    expect(hash).toMatch(BASE64URL_RE);
    // SHA-256 → 32 bytes → 43 base64url chars (no padding).
    expect(hash).toHaveLength(43);
  });

  it('changes when any single input field changes', async () => {
    const baseline = await computeDeviceFingerprintFromInputs(baseInputs);

    const variants: Array<Partial<DeviceFingerprintInputs>> = [
      { userAgent: baseInputs.userAgent + ' Edg/120.0' },
      { platform: 'Win32' },
      { screenWidth: baseInputs.screenWidth + 1 },
      { screenHeight: baseInputs.screenHeight + 1 },
      { colorDepth: 30 },
      { timeZone: 'UTC' },
      { hardwareConcurrency: baseInputs.hardwareConcurrency + 1 },
    ];

    for (const override of variants) {
      const variant = await computeDeviceFingerprintFromInputs({
        ...baseInputs,
        ...override,
      });
      expect(variant).not.toBe(baseline);
      expect(variant).toMatch(BASE64URL_RE);
    }
  });

  it('uses a non-trivial canonical composition (separator prevents collisions)', () => {
    // Verifies adjacent fields cannot silently merge: "AB|C" must not
    // equal "A|BC" so two distinct inputs cannot hash to the same value
    // through string concatenation alone.
    const left = composeDeviceFingerprintInput({
      ...baseInputs,
      userAgent: 'AB',
      platform: 'C',
    });
    const right = composeDeviceFingerprintInput({
      ...baseInputs,
      userAgent: 'A',
      platform: 'BC',
    });
    expect(left).not.toBe(right);
  });

  it('computeDeviceFingerprint() (live globals) returns a base64url string', async () => {
    // jsdom populates navigator/screen/Intl with sensible defaults.
    const hash = await computeDeviceFingerprint();
    expect(hash).toMatch(BASE64URL_RE);
    expect(hash).toHaveLength(43);
  });
});
