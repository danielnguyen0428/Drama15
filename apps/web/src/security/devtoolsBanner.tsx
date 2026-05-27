import type { CSSProperties } from 'react';

/**
 * Warning banner shown when the DevTools detector fires.
 *
 * Validates: Requirement 13.9 (display the warning UI alongside the
 * audit event).
 *
 * Rendering is opt-in: the component returns `null` when `visible` is
 * false, so callers can mount it unconditionally and toggle the prop
 * from React state without unmount/remount churn.
 */

export interface DevtoolsBannerProps {
  /** When `true`, the banner is rendered; otherwise `null` is returned. */
  readonly visible: boolean;
  /** Optional dismiss handler. When provided, a "close" button is rendered. */
  readonly onDismiss?: () => void;
}

const containerStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 2147483647, // top of the stacking context
  padding: '12px 16px',
  backgroundColor: '#7a1f1f',
  color: '#fff',
  fontFamily:
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  fontSize: '14px',
  lineHeight: 1.4,
  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
};

const dismissStyle: CSSProperties = {
  background: 'transparent',
  color: '#fff',
  border: '1px solid #fff',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: '13px',
  cursor: 'pointer',
};

export function DevtoolsBanner({
  visible,
  onDismiss,
}: DevtoolsBannerProps): JSX.Element | null {
  if (!visible) return null;
  return (
    <div role="alert" data-testid="devtools-banner" style={containerStyle}>
      <span>
        Phát hiện DevTools đang mở. Phiên của bạn đã được ghi nhận vì lý do an
        ninh. Vui lòng đóng DevTools để tiếp tục sử dụng dịch vụ.
      </span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          style={dismissStyle}
          aria-label="Dismiss DevTools warning"
        >
          Đóng
        </button>
      ) : null}
    </div>
  );
}
