import { useState } from 'react';
import { DevtoolsBanner } from './security/devtoolsBanner';
import { LoginPage } from './auth/LoginPage';
import { OAuthCallback } from './auth/OAuthCallback';
import { getAccessToken, clearAccessToken } from './auth/tokenStore';
import { AppShell } from './layout/AppShell';
import { StoryWorkspace } from './story/StoryWorkspace';
import { HistoryList } from './history/HistoryList';
import { AccountPage } from './account/AccountPage';
import { AutomationPanel } from './automation/AutomationPanel';

type AppTab = 'create' | 'history' | 'voice' | 'export' | 'account' | 'automation';

/**
 * Root component for the Web_Client SPA.
 *
 * Routes:
 *   - `/auth/google/callback` â†’ OAuth callback handler
 *   - `/` â†’ Login page (if not authenticated) or main app
 */
export default function App(): JSX.Element {
  const [devtoolsDetected] = useState(false);
  const [authToken, setAuthToken] = useState(() => getAccessToken());
  const [activeTab, setActiveTab] = useState<AppTab>('create');
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);

  // Simple client-side routing
  const path = currentPath;

  // OAuth callback route
  if (path === '/auth/google/callback') {
    return (
      <>
        <DevtoolsBanner visible={devtoolsDetected} />
        <OAuthCallback onAuthenticated={() => {
          setAuthToken(getAccessToken());
          window.history.replaceState(null, '', '/');
          setCurrentPath('/');
        }} />
      </>
    );
  }

  // Check if user is authenticated
  if (!authToken) {
    return (
      <>
        <DevtoolsBanner visible={devtoolsDetected} />
        <LoginPage />
      </>
    );
  }

  // Authenticated main app — "Tạo Truyện" tab renders full-page workspace
  if (activeTab === 'create') {
    return (
      <>
        <DevtoolsBanner visible={devtoolsDetected} />
        <StoryWorkspace />
      </>
    );
  }

  // Other tabs use standard layout
  return (
    <>
      <DevtoolsBanner visible={devtoolsDetected} />
      <AppShell>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,245,228,0.12)', background: 'linear-gradient(135deg, #17130f, #261b15)', fontFamily: '"Inter", "Segoe UI", sans-serif' }}>
          <h1 style={{ margin: 0, fontFamily: '"Be Vietnam Pro", "Inter", "Segoe UI", sans-serif', fontSize: '1.15rem', letterSpacing: '-0.03em', color: '#fff7ed' }}>Drama15 Lite Studio</h1>
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
            <button type="button" onClick={() => setActiveTab('create')} style={{ background: 'linear-gradient(135deg, #f5d9a9, #f06a3a)', color: '#160f0b', border: 'none', borderRadius: '999px', padding: '0.55rem 1rem', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}>Vào bàn viết</button>
            <button type="button" onClick={() => { clearAccessToken(); setAuthToken(undefined); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,245,228,0.18)', borderRadius: '999px', padding: '0.55rem 1rem', cursor: 'pointer', color: '#f7efe3', fontSize: '12px', fontWeight: 700 }}>Đăng xuất</button>
          </div>
        </header>
        <nav style={{ display: 'flex', gap: '0.35rem', padding: '0.45rem 0.75rem', borderBottom: '1px solid rgba(255,245,228,0.12)', background: '#14110f', fontFamily: '"Inter", "Segoe UI", sans-serif', overflowX: 'auto' }}>
          {([
            ['history', 'Lịch Sử'],
            ['automation', 'Automation'],
            ['voice', 'Voice'],
            ['export', 'Xuất File'],
            ['account', 'Tài Khoản'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              style={{
                padding: '0.7rem 1rem',
                border: 'none',
                borderRadius: '999px',
                background: activeTab === key ? '#f4d29e' : 'transparent',
                color: activeTab === key ? '#17110d' : 'rgba(247,239,227,0.66)',
                fontWeight: activeTab === key ? 850 : 650,
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <section style={{ padding: '1.25rem', background: 'radial-gradient(circle at 20% 0%, rgba(207,92,45,0.18), transparent 28rem), #11100e', color: '#fff7ed', minHeight: '80vh', fontFamily: '"Inter", "Segoe UI", sans-serif' }}>
          {activeTab === 'history' && <HistoryList />}
          {activeTab === 'automation' && <AutomationPanel />}
          {activeTab === 'voice' && <p style={{ color: '#888', lineHeight: 1.6 }}>Chọn một truyện từ tab <strong style={{ color: '#f4d29e' }}>Lịch Sử</strong>, bấm <strong style={{ color: '#f4d29e' }}>Xem</strong>, rồi sử dụng Voice panel trong trang chi tiết truyện.</p>}
          {activeTab === 'export' && <p style={{ color: '#888', lineHeight: 1.6 }}>Chọn một truyện từ tab <strong style={{ color: '#f4d29e' }}>Lịch Sử</strong>, bấm <strong style={{ color: '#f4d29e' }}>Xem</strong>, rồi sử dụng nút xuất file trong trang chi tiết truyện. Hoặc vào <strong style={{ color: '#f4d29e' }}>Bàn viết</strong> để xuất Markdown/PDF trực tiếp.</p>}
          {activeTab === 'account' && <AccountPage />}
        </section>
        <footer style={{ padding: '24px', borderTop: '1px solid rgba(255,245,228,0.08)', background: 'rgba(14,12,10,0.6)', textAlign: 'center', fontSize: '12px', color: 'rgba(249,242,233,0.4)', fontFamily: '"Inter", "Segoe UI", sans-serif' }}>
          <span style={{ fontWeight: 800, color: 'rgba(249,242,233,0.55)' }}>Drama15 Lite Studio</span>
          {' · '}
          <span>© {new Date().getFullYear()} NovelKit. All rights reserved.</span>
        </footer>
      </AppShell>
    </>
  );
}
