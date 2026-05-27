/**
 * OAuth callback page — handles the redirect from Google after consent.
 *
 * Google redirects to: /auth/google/callback?code=...&state=...
 * This page sends the code+state to the API for token exchange.
 */

import { useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from '../api/apiBase';
import { setAccessToken } from './tokenStore';

const API_BASE = getApiBaseUrl();

type CallbackState =
  | { kind: 'loading' }
  | { kind: 'success'; profile: { email: string; name?: string; picture?: string } }
  | { kind: 'error'; message: string };

export interface OAuthCallbackProps {
  readonly onAuthenticated?: () => void;
}

export function OAuthCallback({ onAuthenticated }: OAuthCallbackProps): JSX.Element {
  const [state, setState] = useState<CallbackState>({ kind: 'loading' });
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (exchangedRef.current) return;
    exchangedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const oauthState = params.get('state');
    const error = params.get('error');

    if (error) {
      setState({ kind: 'error', message: `Google trả về lá»—i: ${error}` });
      return;
    }

    if (!code || !oauthState) {
      setState({ kind: 'error', message: 'Thiếu tham số code hoặc state từ Google.' });
      return;
    }

    // Verify state matches what we stored
    const savedState = sessionStorage.getItem('oauth_state');
    if (savedState && savedState !== oauthState) {
      setState({ kind: 'error', message: 'OAuth state không khớp. Có thể bị tấn công CSRF.' });
      return;
    }

    // Exchange code with our API
    const exchangeCode = async (): Promise<void> => {
      try {
        const response = await fetch(
          `${API_BASE}/auth/oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(oauthState)}`,
          { credentials: 'include' }
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
          setState({
            kind: 'error',
            message: body.error?.message ?? `Đăng nhập thất bại (HTTP ${response.status})`
          });
          return;
        }

        const data = (await response.json()) as {
          accessToken?: string;
          profile?: { email: string; name?: string; picture?: string };
        };

        const accessToken = data.accessToken ?? (import.meta.env.DEV ? `dev:${data.profile?.email ?? 'unknown'}` : undefined);
        if (accessToken) {
          setAccessToken(accessToken);
        }

        setState({
          kind: 'success',
          profile: data.profile ?? { email: 'unknown' }
        });

        try {
          sessionStorage.setItem('oauth_profile', JSON.stringify(data.profile ?? { email: 'unknown' }));
        } catch {
          // Ignore restricted storage; account UI falls back to generic label.
        }

        // Clean up sessionStorage
        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('oauth_nonce');
        onAuthenticated?.();
      } catch {
        setState({ kind: 'error', message: 'Không thể kết nối tới máy chủ.' });
      }
    };

    void exchangeCode();
  }, [onAuthenticated]);

  if (state.kind === 'loading') {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>Đang xử lý đăng nhập...</p>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
        <h1 style={{ color: '#d32f2f' }}>Đăng nhập thất bại</h1>
        <p>{state.message}</p>
        <a href="/" style={{ marginTop: '1rem', color: '#1976d2' }}>← Quay lại trang đăng nhập</a>
      </main>
    );
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
      <h1 style={{ color: '#2e7d32' }}>✓ Đăng nhập thành công!</h1>
      <p>Xin chào, <strong>{state.profile.name ?? state.profile.email}</strong></p>
      <p style={{ color: '#666' }}>{state.profile.email}</p>
      <button
        type="button"
        onClick={() => {
          onAuthenticated?.();
        }}
        style={{ marginTop: '1rem', color: '#1976d2', background: 'none', border: 0, cursor: 'pointer' }}
      >
        Vào ứng dụng
      </button>
    </main>
  );
}

export default OAuthCallback;
