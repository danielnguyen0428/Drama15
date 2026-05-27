import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global Error Boundary — catches unhandled render errors and displays
 * a recovery UI instead of a white screen.
 *
 * Wraps the entire app tree so any component crash is contained.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console in dev; production could send to a monitoring service
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main style={styles.shell}>
          <section style={styles.card}>
            <div style={styles.icon} aria-hidden="true">⚠️</div>
            <h1 style={styles.title}>Đã xảy ra lỗi</h1>
            <p style={styles.message}>
              Ứng dụng gặp sự cố không mong muốn. Dữ liệu bản thảo của bạn
              vẫn được lưu trong trình duyệt.
            </p>
            {this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>Chi tiết lỗi (dành cho kỹ thuật)</summary>
                <pre style={styles.pre}>{this.state.error.message}</pre>
              </details>
            )}
            <div style={styles.actions}>
              <button type="button" onClick={this.handleReload} style={styles.primaryBtn}>
                Tải lại trang
              </button>
              <button type="button" onClick={this.handleReset} style={styles.secondaryBtn}>
                Thử tiếp tục
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

const styles = {
  shell: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: '24px',
    color: '#fff7ed',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    background: '#11100e',
  },
  card: {
    width: 'min(520px, 100%)',
    padding: 'clamp(32px, 5vw, 48px)',
    border: '1px solid rgba(255,245,228,0.14)',
    borderRadius: '32px',
    background: 'rgba(28,24,20,0.9)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
    textAlign: 'center' as const,
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  title: {
    margin: '0 0 12px',
    fontFamily: '"Be Vietnam Pro", "Inter", sans-serif',
    fontSize: '24px',
    letterSpacing: '-0.03em',
  },
  message: {
    margin: '0 0 24px',
    color: 'rgba(255,247,237,0.72)',
    fontSize: '15px',
    lineHeight: 1.6,
  },
  details: {
    marginBottom: '24px',
    textAlign: 'left' as const,
  },
  summary: {
    cursor: 'pointer',
    color: 'rgba(255,247,237,0.5)',
    fontSize: '12px',
    marginBottom: '8px',
  },
  pre: {
    margin: 0,
    padding: '12px',
    borderRadius: '12px',
    background: 'rgba(0,0,0,0.3)',
    color: '#ffd8cf',
    fontSize: '12px',
    overflow: 'auto',
    maxHeight: '120px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  primaryBtn: {
    minHeight: '44px',
    padding: '12px 24px',
    border: 0,
    borderRadius: '999px',
    color: '#160f0b',
    background: 'linear-gradient(135deg, #f5d9a9, #f06a3a)',
    fontSize: '14px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryBtn: {
    minHeight: '44px',
    padding: '12px 24px',
    border: '1px solid rgba(255,245,228,0.16)',
    borderRadius: '999px',
    color: '#f7efe3',
    background: 'rgba(255,255,255,0.07)',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

export default ErrorBoundary;
