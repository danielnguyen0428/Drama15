import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '../api/apiBase';
import './LoginPage.css';

const API_BASE = getApiBaseUrl();

interface PublishedEntry {
  id: string;
  title: string;
  chapters: number;
  author?: string;
  publishedAt: string;
  chaptersData?: Array<{ index: number; title?: string; content: string }>;
}

export function LoginPage(): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishedEntry[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${API_BASE}/published-stories`);
        if (!r.ok) return;
        const d = (await r.json()) as { stories?: PublishedEntry[] };
        if (Array.isArray(d.stories)) setPublished(d.stories);
      } catch {}
    })();
  }, []);

  // Backfill chaptersData from localStorage drafts
  useEffect(() => {
    if (published.length === 0) return;
    void (async () => {
      try {
        const raw = localStorage.getItem('drama15_drafts');
        if (!raw) return;
        const drafts = JSON.parse(raw) as Array<{ title?: string; config?: { title?: string }; phase?: string; result?: { chapters?: Array<{ index: number; title?: string; content: string }> } }>;
        const completed = drafts.filter((d) => d.result?.chapters && d.result.chapters.length >= 10);
        if (completed.length === 0) return;
        for (const serverStory of published) {
          if (serverStory.chaptersData && serverStory.chaptersData.length > 0) continue;
          const missingServerStories = published.filter((s) => !s.chaptersData || s.chaptersData.length === 0);
          const match = completed.find((d) => { const dt = (d.title || d.config?.title || '').trim().toLowerCase(); const st = serverStory.title.trim().toLowerCase(); return dt === st || dt.includes(st.slice(0, 20)) || st.includes(dt.slice(0, 20)); }) || (missingServerStories.length === 1 && completed.length === 1 ? completed[0] : undefined);
          if (!match || !match.result?.chapters) continue;
          await fetch(`${API_BASE}/published-stories/${serverStory.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chapters: match.result.chapters.length,
              chaptersData: match.result.chapters,
            }),
          });
        }
        // Refresh
        const r2 = await fetch(`${API_BASE}/published-stories`);
        if (r2.ok) {
          const d2 = (await r2.json()) as { stories?: PublishedEntry[] };
          if (Array.isArray(d2.stories)) setPublished(d2.stories);
        }
      } catch {}
    })();
  }, [published.length]);

  const handleGoogleLogin = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/oauth/start`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setError('Kiểm tra kết nối API rồi thử lại.');
        return;
      }
      const data = (await response.json()) as {
        authorizeUrl: string;
        state: string;
        nonce: string;
      };
      sessionStorage.setItem('oauth_state', data.state);
      sessionStorage.setItem('oauth_nonce', data.nonce);
      window.location.href = data.authorizeUrl;
    } catch {
      setError('Kiểm tra kết nối API rồi thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.shell}>
      <section className="login-card-grid" style={styles.card}>
        <div style={styles.copy}>
          <p style={styles.eyebrow}>Novel Operations Studio</p>
          <h1 style={styles.title}>Drama15 Lite Studio</h1>
          <p style={styles.subtitle}>
            AI viết cùng bạn — không ảo giác, không lạc đề.
            Mỗi chương được xây từ logic cốt truyện thực sự,
            giữ mạch cảm xúc liền mạch từ đầu đến cuối.
          </p>
          <ul style={styles.featureList}>
            <li style={styles.featureItem}>
              <span style={styles.featureDot}>✦</span>
              <span><strong style={styles.strong}>Sáng tác liền mạch</strong> — AI nhớ context, không lặp, không mâu thuẫn</span>
            </li>
            <li style={styles.featureItem}>
              <span style={styles.featureDot}>✦</span>
              <span><strong style={styles.strong}>Logic cốt truyện chặt chẽ</strong> — concept, nhân vật, tình tiết khớp nhau từ đầu</span>
            </li>
            <li style={styles.featureItem}>
              <span style={styles.featureDot}>✦</span>
              <span><strong style={styles.strong}>Rewrite thông minh</strong> — giữ giọng văn, đổi phong cách không mất mạch</span>
            </li>
            <li style={styles.featureItem}>
              <span style={styles.featureDot}>✦</span>
              <span><strong style={styles.strong}>Xuất bản thảo ngay</strong> — Markdown &amp; PDF sẵn sàng đăng chỉ một click</span>
            </li>
          </ul>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTop}>
            <span style={styles.dot} />
            <span>MIỄN PHÍ HOÀN TOÀN</span>
          </div>
          <div style={styles.mascotWrap}>
            <img src="/mascot.png" alt="Drama15 mascot" style={styles.mascot} />
          </div>
          <button
            type="button"
            onClick={() => void handleGoogleLogin()}
            disabled={loading}
            style={{
              ...styles.loginButton,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.72 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
            </svg>
            {loading ? 'Đang kết nối...' : 'Đăng nhập với Google'}
          </button>
          {error && (
            <p role="alert" style={styles.error}>{error}</p>
          )}
        </div>
      </section>
      {published.length > 0 && (
        <section style={styles.shelf}>
          <h2 style={styles.shelfTitle}>Truyện đã xuất bản</h2>
          <div style={styles.shelfGrid}>
            {published.slice(0, 8).map((s) => (
              <div key={s.id} style={styles.shelfCard}>
                <div style={styles.shelfThumb}>
                  <svg viewBox="0 0 40 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%"}}>
                    <rect width="40" height="60" rx="4" fill="#2a1f18"/>
                    <rect x="6" y="8" width="28" height="3" rx="1.5" fill="#f4d29e" opacity=".6"/>
                    <rect x="6" y="14" width="20" height="2" rx="1" fill="#f4d29e" opacity=".3"/>
                    <rect x="6" y="19" width="24" height="2" rx="1" fill="#f4d29e" opacity=".2"/>
                    <path d="M8 40l8-6 8 6 8-10" stroke="#f4d29e" strokeWidth="1.5" opacity=".3" fill="none"/>
                  </svg>
                </div>
                <div style={styles.shelfInfo}>
                  <strong style={styles.shelfCardTitle}>{s.title}</strong>
                  <span style={styles.shelfCardMeta}>{s.author} • {s.chapters} chương</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

const styles = {
  shell: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: '24px',
    color: '#fff7ed',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    background:
      'radial-gradient(circle at 18% 10%, rgba(207,92,45,0.28), transparent 34rem), radial-gradient(circle at 82% 18%, rgba(242,203,135,0.18), transparent 32rem), linear-gradient(135deg, #12100e, #231a14 52%, #0f0e0d)',
  },
  card: {
    width: 'min(1100px, 100%)',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 340px)',
    gap: '24px',
    alignItems: 'stretch',
  },
  copy: {
    padding: 'clamp(32px, 5vw, 64px)',
    border: '1px solid rgba(255,245,228,0.14)',
    borderRadius: '32px',
    background: 'rgba(255,255,255,0.045)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.32)',
    backdropFilter: 'blur(24px)',
  },
  eyebrow: {
    margin: '0 0 16px',
    color: '#d7aa69',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
  },
  title: {
    margin: '0 0 20px',
    fontFamily: '"Be Vietnam Pro", "Inter", sans-serif',
    fontSize: 'clamp(36px, 5vw, 56px)',
    lineHeight: 1.04,
    letterSpacing: '-0.05em',
  },
  subtitle: {
    maxWidth: '560px',
    margin: '0 0 28px',
    color: 'rgba(255,247,237,0.72)',
    fontSize: '17px',
    lineHeight: 1.75,
  },
  featureList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    color: 'rgba(255,247,237,0.8)',
    fontSize: '15px',
    lineHeight: 1.55,
  },
  featureDot: {
    color: '#f4d29e',
    fontSize: '12px',
    marginTop: '3px',
    flexShrink: 0,
  },
  strong: {
    color: '#f7efe3',
    fontWeight: 700,
  },
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    padding: '24px',
    border: '1px solid rgba(255,245,228,0.14)',
    borderRadius: '32px',
    background: 'rgba(20,17,14,0.88)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.36)',
    backdropFilter: 'blur(24px)',
  },
  panelTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'rgba(255,247,237,0.55)',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#f4d29e',
    boxShadow: '0 0 16px rgba(244,210,158,0.8)',
    flexShrink: 0,
  },
  mascotWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascot: {
    width: '100%',
    maxWidth: '292px',
    height: 'auto',
    objectFit: 'contain' as const,
    filter: 'drop-shadow(0 12px 36px rgba(207,92,45,0.32))',
  },
  loginButton: {
    minHeight: '52px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '100%',
    border: 0,
    borderRadius: '999px',
    color: '#17110d',
    background: 'linear-gradient(135deg, #f5ead8, #f0a45f)',
    fontSize: '15px',
    fontWeight: 800,
  },
  error: {
    margin: 0,
    padding: '12px 14px',
    border: '1px solid rgba(255,123,95,0.34)',
    borderRadius: '16px',
    color: '#ffd8cf',
    background: 'rgba(160,34,18,0.22)',
    fontSize: '14px',
    lineHeight: 1.45,
  },
  shelf: {
    width: 'min(1100px, 100%)',
    marginTop: '32px',
  },
  shelfTitle: {
    margin: '0 0 16px',
    fontSize: '16px',
    fontWeight: 800,
    color: '#f4d29e',
    letterSpacing: '-0.02em',
  },
  shelfGrid: {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: '12px',
    overflowX: 'auto' as const,
    paddingBottom: '8px',
    scrollSnapType: 'x mandatory' as const,
  },
  shelfCard: {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: '12px',
    alignItems: 'flex-start',
    flexShrink: 0,
    width: '220px',
    padding: '12px',
    border: '1px solid rgba(255, 245, 228, 0.12)',
    borderRadius: '16px',
    background: 'rgba(28, 24, 20, 0.6)',
    scrollSnapAlign: 'start' as const,
  },
  shelfThumb: {
    width: '36px',
    height: '54px',
    flexShrink: 0,
    borderRadius: '4px',
    overflow: 'hidden',
    background: '#1a1510',
  },
  shelfInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    minWidth: 0,
  },
  shelfCardTitle: {
    color: '#f5ead8',
    fontSize: '13px',
    fontWeight: 700,
    lineHeight: '1.4',
  },
  shelfCardMeta: {
    color: 'rgba(249, 242, 233, 0.5)',
    fontSize: '11px',
  },
};

export default LoginPage;
