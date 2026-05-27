/**
 * `AccountPage` — Web_Client account-management view (Task 17.10).
 *
 * Validates: Requirements 4.6, 4.7, 19.2
 *
 *   4.6  THE Auth_Service SHALL ghi nhận lần sử dụng cuối của mỗi
 *        Device_Fingerprint và phải hiển thị danh sách thiết bị đang
 *        đăng nhập trong trang quản lý tài khoản.
 *   4.7  WHEN người dùng yêu cầu đăng xuất một thiết bị từ trang quản
 *        lý, THE Auth_Service SHALL thu hồi Refresh_Token gắn với
 *        Device_Fingerprint đó trong vòng 60 giây.
 *   19.2 WHEN người dùng chọn ngôn ngữ giao diện trong cài đặt tài
 *        khoản, THE Web_Client SHALL lưu lựa chọn và hiển thị toàn bộ
 *        nhãn theo ngôn ngữ đó từ lần tải tiếp theo.
 *
 * The component exposes three concerns side by side, matching the
 * design.md "account/" module description:
 *   1. A device list rendered from `GET /account/devices`. Each row
 *      shows the `device_id` plus the ISO `last_seen` timestamp so the
 *      user can decide which device to log out.
 *   2. A "Gỡ thiết bị" button per row firing
 *      `DELETE /account/devices/:id`. On a 2xx response the row is
 *      removed from local state immediately so the user sees the
 *      effect without a manual reload.
 *   3. The shared {@link LocaleSwitcher} so the user can change the UI
 *      language. The switcher already persists the choice to
 *      localStorage and `POST /account/locale` (Requirement 19.2);
 *      AccountPage simply mounts it inside the settings group.
 *
 * All API calls go through {@link httpFetch} so the
 * `X-Client-Integrity` and `X-Device-Fingerprint` headers are attached
 * automatically. The component owns no plan / quota state — those
 * concerns are gateway-side per Requirement 3.4.
 */

import { useCallback, useEffect, useState } from 'react';

import { httpFetch } from '../api/httpClient';
import { LocaleSwitcher } from '../i18n/LocaleSwitcher';

/** Endpoint used by `GET` and as the prefix for the per-device DELETE. */
export const ACCOUNT_DEVICES_ENDPOINT = '/account/devices';

/**
 * Per-row shape rendered by {@link AccountPage}.
 *
 * Naming intentionally mirrors the task brief (`device_id`,
 * `last_seen`) rather than the internal `DeviceRecord` contract — the
 * task's external surface is the `/account/devices` HTTP DTO, which
 * the gateway shapes specifically for account-management consumers.
 */
export interface AccountDeviceDto {
  device_id: string;
  last_seen: string;
}

/** Response body shape for `GET /account/devices`. */
export interface AccountDevicesResponseBody {
  devices?: AccountDeviceDto[];
}

/** Loading / data / error tri-state for the device list section. */
type DevicesState =
  | { kind: 'loading' }
  | { kind: 'ready'; devices: AccountDeviceDto[] }
  | { kind: 'error'; message: string };

/**
 * Test-only shim: when set, the loader uses the supplied list instead
 * of issuing a network call. Production code never sets this. The
 * regular network path is still covered by the `fetch`-mocked tests;
 * this exists only for tests that want a synchronous, error-free seed.
 */
export interface AccountPageProps {
  initialDevices?: AccountDeviceDto[];
}

/**
 * Best-effort parser for the `/account/devices` response. We accept
 * both the canonical `{ devices: [...] }` envelope and a bare array,
 * since older fixtures and proxies sometimes flatten the body.
 */
function parseDevices(body: unknown): AccountDeviceDto[] {
  if (Array.isArray(body)) {
    return body.filter(isAccountDeviceDto);
  }
  if (body && typeof body === 'object') {
    const inner = (body as { devices?: unknown }).devices;
    if (Array.isArray(inner)) {
      return inner.filter(isAccountDeviceDto);
    }
  }
  return [];
}

function isAccountDeviceDto(value: unknown): value is AccountDeviceDto {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['device_id'] === 'string' &&
    typeof candidate['last_seen'] === 'string'
  );
}

export function AccountPage({
  initialDevices,
}: AccountPageProps = {}): JSX.Element {
  const [state, setState] = useState<DevicesState>(() =>
    initialDevices !== undefined
      ? { kind: 'ready', devices: initialDevices }
      : { kind: 'loading' },
  );
  const [removeError, setRemoveError] = useState<string | null>(null);
  /** `device_id` of the row currently being removed (disables its button). */
  const [removingId, setRemovingId] = useState<string | null>(null);

  // ----- Load devices on mount --------------------------------------------
  useEffect(() => {
    if (initialDevices !== undefined) {
      // Test seed already supplied; no fetch needed.
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await httpFetch(ACCOUNT_DEVICES_ENDPOINT, {
          method: 'GET',
        });
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        if (cancelled) return;
        if (!res.ok) {
          setState({
            kind: 'error',
            message: 'Không thể tải danh sách thiết bị.',
          });
          return;
        }
        setState({ kind: 'ready', devices: parseDevices(body) });
      } catch {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: 'Không thể tải danh sách thiết bị.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDevices]);

  // ----- Remove a device --------------------------------------------------
  const handleRemove = useCallback(async (deviceId: string) => {
    setRemoveError(null);
    setRemovingId(deviceId);
    try {
      const res = await httpFetch(
        `${ACCOUNT_DEVICES_ENDPOINT}/${encodeURIComponent(deviceId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        setRemoveError('Không thể gỡ thiết bị này. Vui lòng thử lại.');
        return;
      }
      setState((prev) =>
        prev.kind === 'ready'
          ? {
              kind: 'ready',
              devices: prev.devices.filter((d) => d.device_id !== deviceId),
            }
          : prev,
      );
    } catch {
      setRemoveError('Không thể kết nối tới máy chủ. Vui lòng thử lại.');
    } finally {
      setRemovingId(null);
    }
  }, []);

  // ----- Render -----------------------------------------------------------
  return (
    <section
      data-testid="account-page"
      aria-labelledby="account-page-title"
    >
      <h1 id="account-page-title">Tài khoản</h1>

      <section
        data-testid="account-language-section"
        aria-labelledby="account-language-title"
      >
        <h2 id="account-language-title">Ngôn ngữ giao diện</h2>
        <LocaleSwitcher />
      </section>

      <section
        data-testid="account-devices-section"
        aria-labelledby="account-devices-title"
      >
        <h2 id="account-devices-title">Thiết bị đang đăng nhập</h2>

        {state.kind === 'loading' ? (
          <p data-testid="account-devices-loading">Đang tải...</p>
        ) : null}

        {state.kind === 'error' ? (
          <p role="alert" data-testid="account-devices-error">
            {state.message}
          </p>
        ) : null}

        {state.kind === 'ready' && state.devices.length === 0 ? (
          <p data-testid="account-devices-empty">
            Không có thiết bị nào đang đăng nhập.
          </p>
        ) : null}

        {state.kind === 'ready' && state.devices.length > 0 ? (
          <ul data-testid="account-devices-list">
            {state.devices.map((device) => (
              <li
                key={device.device_id}
                data-testid={`account-device-${device.device_id}`}
              >
                <span
                  data-testid={`account-device-id-${device.device_id}`}
                >
                  {device.device_id}
                </span>
                <time
                  data-testid={`account-device-last-seen-${device.device_id}`}
                  dateTime={device.last_seen}
                >
                  {device.last_seen}
                </time>
                <button
                  type="button"
                  data-testid={`account-device-remove-${device.device_id}`}
                  onClick={() => handleRemove(device.device_id)}
                  disabled={removingId === device.device_id}
                  aria-busy={
                    removingId === device.device_id ? true : undefined
                  }
                >
                  Gỡ thiết bị
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {removeError !== null ? (
          <p role="alert" data-testid="account-device-remove-error">
            {removeError}
          </p>
        ) : null}
      </section>
    </section>
  );
}

export default AccountPage;
