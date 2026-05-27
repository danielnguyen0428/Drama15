/**
 * `deviceFingerprint` — Web_Client side computation of the
 * `Device_Fingerprint` value the Auth_Service binds to a session.
 *
 * Validates: Requirements 4.1
 *
 *   4.1  WHEN người dùng đăng nhập thành công qua Google, THE
 *        Auth_Service SHALL gắn phiên đăng nhập với một
 *        Device_Fingerprint cụ thể được Web_Client tính toán phía
 *        client và xác minh phía server.
 *
 * Composition (per design.md, "Web_Client" section):
 *   UA, platform, screen (width × height × colorDepth), timezone,
 *   hardwareConcurrency — joined into a stable canonical string and
 *   hashed with SHA-256. The digest is encoded as base64url (no
 *   padding) so it travels safely in JSON bodies, URL paths and
 *   header values without further escaping.
 *
 * The composition is deliberately limited to coarse, low-entropy
 * browser/OS attributes so the same physical device always produces
 * the same hash within a session, which lets the Auth_Service
 * enforce "1 device for Free_Plan, 3 devices for Paid_Plan"
 * (Requirements 4.2, 4.3) without needing a per-tab cookie or any
 * canvas/WebGL probing.
 *
 * The pure helper {@link computeDeviceFingerprintFromInputs} takes
 * inputs as data so it can be unit-tested deterministically; the
 * exported {@link computeDeviceFingerprint} reads the same inputs
 * from the live `navigator` / `screen` / `Intl` globals.
 */

/**
 * Stable, low-entropy device attributes used to derive the
 * `Device_Fingerprint`. All fields are strings or numbers so the
 * canonical composition is unambiguous; missing values are
 * normalised to empty string / 0 in {@link gatherDeviceFingerprintInputs}.
 */
export interface DeviceFingerprintInputs {
  readonly userAgent: string;
  readonly platform: string;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly colorDepth: number;
  readonly timeZone: string;
  readonly hardwareConcurrency: number;
}

/**
 * Field separator for the canonical composition. We use `|` (not in
 * any plausible UA / platform / timezone string) so two adjacent
 * fields cannot collide via concatenation, e.g. UA "AB" + platform
 * "C" must not hash equal to UA "A" + platform "BC".
 */
const FIELD_SEPARATOR = '|';

/**
 * Read the live device attributes used by {@link computeDeviceFingerprint}.
 * Defensive against environments (older jsdom, SSR pre-render) where
 * one of the globals is missing or partially populated.
 */
export function gatherDeviceFingerprintInputs(): DeviceFingerprintInputs {
  const nav: Navigator | undefined =
    typeof navigator === 'undefined' ? undefined : navigator;
  const scr: Screen | undefined =
    typeof screen === 'undefined' ? undefined : screen;

  let timeZone = 'UTC';
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof resolved === 'string' && resolved.length > 0) {
      timeZone = resolved;
    }
  } catch {
    // Some sandboxes throw when ICU data is stripped — fall back to UTC.
    timeZone = 'UTC';
  }

  return {
    userAgent: nav?.userAgent ?? '',
    platform: nav?.platform ?? '',
    screenWidth: scr?.width ?? 0,
    screenHeight: scr?.height ?? 0,
    colorDepth: scr?.colorDepth ?? 0,
    timeZone,
    hardwareConcurrency: nav?.hardwareConcurrency ?? 0,
  };
}

/**
 * Encode raw bytes as base64url (RFC 4648 §5) with `=` padding
 * stripped. Suitable for HTTP headers and URL path segments.
 */
function toBase64Url(bytes: Uint8Array): string {
  // Build the binary string explicitly to avoid `String.fromCharCode(...bytes)`
  // hitting the argument-count limit on large inputs (digest is 32 bytes
  // here, but the helper is reused below so we keep it general).
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Compose the canonical fingerprint string from typed inputs.
 * Exported (rather than inlined) so tests can assert that two
 * inputs that differ in any single field produce different strings
 * before hashing, isolating composition bugs from hashing bugs.
 */
export function composeDeviceFingerprintInput(
  inputs: DeviceFingerprintInputs,
): string {
  return [
    inputs.userAgent,
    inputs.platform,
    String(inputs.screenWidth),
    String(inputs.screenHeight),
    String(inputs.colorDepth),
    inputs.timeZone,
    String(inputs.hardwareConcurrency),
  ].join(FIELD_SEPARATOR);
}

/**
 * Pure, testable variant of {@link computeDeviceFingerprint}: hashes
 * an explicit set of inputs rather than reading from globals. Same
 * inputs always produce the same output; changing any single field
 * changes the output.
 */
export async function computeDeviceFingerprintFromInputs(
  inputs: DeviceFingerprintInputs,
): Promise<string> {
  const composed = composeDeviceFingerprintInput(inputs);
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(composed));
  return toBase64Url(new Uint8Array(digest));
}

/**
 * Compute the `Device_Fingerprint` for the current browser session.
 *
 * Returns a base64url-encoded SHA-256 digest of the canonical
 * composition of UA, platform, screen, timezone, and
 * hardwareConcurrency.
 */
export function computeDeviceFingerprint(): Promise<string> {
  return computeDeviceFingerprintFromInputs(gatherDeviceFingerprintInputs());
}
