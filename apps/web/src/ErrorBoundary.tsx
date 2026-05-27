import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main style={styles.shell}>
        <section style={styles.panel}>
          <p style={styles.eyebrow}>Drama15 Lite Studio</p>
          <h1 style={styles.title}>App crashed</h1>
          <p style={styles.copy}>Reload the page to restart this writing session.</p>
          {this.state.error && <pre style={styles.pre}>{this.state.error.message}</pre>}
          <button type="button" onClick={() => window.location.reload()} style={styles.button}>Reload</button>
        </section>
      </main>
    );
  }
}

const styles = {
  shell: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: '24px',
    background: '#101113',
    color: '#f6f0e8',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  panel: {
    width: 'min(520px, 100%)',
    border: '1px solid rgba(246,240,232,0.14)',
    borderRadius: '8px',
    background: 'rgba(22,24,27,0.9)',
    padding: '28px',
  },
  eyebrow: { margin: '0 0 8px', color: '#f0b56a', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' as const },
  title: { margin: 0, fontSize: '28px' },
  copy: { color: '#b8b0a6', lineHeight: 1.6 },
  pre: { whiteSpace: 'pre-wrap' as const, color: '#ffd5cc', background: 'rgba(0,0,0,0.26)', padding: '12px', borderRadius: '8px' },
  button: { minHeight: '42px', border: 0, borderRadius: '8px', padding: '0 16px', fontWeight: 800, background: '#f0b56a', color: '#17110b' },
};

export default ErrorBoundary;
