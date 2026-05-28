import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { getApiBaseUrl } from '../api/apiBase';
import { httpFetch } from '../api/httpClient';
import { getAccessToken, supabase } from '../api/supabaseClient';
import './StoryWorkspace.css';

type Phase = 'idle' | 'suggesting' | 'creating' | 'streaming' | 'completed' | 'failed';
type Panel = 'chapters' | 'overview' | 'plan' | 'bible' | 'relationships';
type StoryStatus = 'queued' | 'running' | 'completed' | 'failed';

type StoryConfig = {
  niche: string;
  customNiche: string;
  title: string;
  seed: string;
  outputLanguage: string;
  intensity: number;
  dialogueRatio: number;
  hookDensity: number;
  stylePreset: string;
  storyControls?: StoryControls;
};

type StoryControls = {
  betrayalType: string;
  shameType: string;
  revengeMode: string;
  endingMode: string;
  intensity: number;
};

type StylePreset = { id: string; displayName: string; description: string };
type Chapter = { index: number; title?: string; content: string };
type RelationshipNode = { id: string; name: string; role: string; description: string };
type RelationshipEdge = { source: string; target: string; label: string; type: string; chapterNumber?: number; confidence: 'explicit' | 'inferred' };
type RelationshipGraph = { nodes: RelationshipNode[]; edges: RelationshipEdge[]; updatedAt: string };
type StoryResult = { concept: string; plan: string; bible?: unknown; relationshipGraph?: RelationshipGraph; chapters: Chapter[] };
type AppUser = { id: string; email: string; displayName: string; avatarUrl?: string; tier: 'free' | 'pro' | 'premium' };
type Quota = { usageDate: string; used: number; limit: number; remaining: number };
type SavedStory = {
  id: string;
  title: string;
  status: StoryStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  chapterCount: number;
  error?: string;
};
type StoryPayload = {
  title: string;
  concept: { logline: string; promise: string; conflictEngine: string };
  storyBible: unknown;
  chapterPlan: Array<{ chapterNumber: number; title: string; mainBeat: string; hook: string; endingBeat: string }>;
  chapters: Array<{ chapterNumber: number; title?: string; text: string }>;
  relationshipGraph?: RelationshipGraph;
};

type StreamEvent = {
  stage?: 'progress' | 'overview' | 'bible' | 'plan' | 'relationshipGraph' | 'chapter' | 'done' | 'error';
  title?: string;
  concept?: string;
  bible?: unknown;
  relationshipGraph?: RelationshipGraph;
  plan?: string;
  chapter?: Chapter;
  label?: string;
  detail?: string;
  current?: number;
  total?: number;
  error?: string;
};

const API_BASE = getApiBaseUrl();
const EMPTY_RESULT: StoryResult = { concept: '', plan: '', chapters: [] };
const DEFAULT_CONFIG: StoryConfig = {
  niche: 'billionaire_rich_poor_romance',
  customNiche: '',
  title: '',
  seed: '',
  outputLanguage: 'vietnamese',
  intensity: 0.84,
  dialogueRatio: 0.56,
  hookDensity: 0.67,
  stylePreset: 'co_man_warm_modern_blueprint',
};

const NICHES = [
  ['billionaire_rich_poor_romance', 'Tỷ phú / tình yêu vượt giai cấp'],
  ['humiliation_revenge_justice', 'Sỉ nhục / trả đũa / công lý'],
  ['secret_identity_hidden_heiress', 'Thân phận bí mật / thiên kim'],
  ['toxic_family_betrayal', 'Gia đình độc hại / phản bội'],
  ['cheating_ex_wedding_drama', 'Ngoại tình / drama cưới'],
  ['single_mom_poor_woman_comeback', 'Mẹ đơn thân / lật kèo'],
  ['social_injustice_discrimination_drama', 'Bất công xã hội'],
  ['workplace_ceo_power_struggle', 'Công sở / tổng tài / tranh quyền'],
  ['medical_hidden_doctor_life_care', 'Y tế / bác sĩ ẩn danh'],
  ['school_campus_bullying_identity', 'Học đường / bắt nạt'],
  ['werewolf_luna_alpha_soulmate', 'Người sói / thủ lĩnh định mệnh'],
  ['steamy_alien_captive_romance', 'Lãng mạn nóng bỏng / u tối'],
  ['custom', 'Nhánh tùy biến'],
] as const;

const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Sẵn sàng',
  suggesting: 'Đang gợi ý',
  creating: 'Đang khởi tạo',
  streaming: 'Đang viết',
  completed: 'Hoàn tất',
  failed: 'Có lỗi',
};

const STATUS_LABELS: Record<StoryStatus, string> = {
  queued: 'Đang chờ',
  running: 'Đang viết',
  completed: 'Hoàn tất',
  failed: 'Có lỗi',
};

const TIER_LABELS: Record<AppUser['tier'], string> = {
  free: 'Miễn phí',
  pro: 'Pro',
  premium: 'Premium',
};

const LANGUAGE_OPTIONS = [
  ['vietnamese', 'Tiếng Việt'],
  ['english', 'Tiếng Anh'],
  ['japanese', 'Tiếng Nhật'],
  ['korean', 'Tiếng Hàn'],
  ['spanish', 'Tiếng Tây Ban Nha'],
  ['portuguese', 'Tiếng Bồ Đào Nha'],
] as const;

const REWRITE_MODES = [
  ['full_chapter', 'Viết lại toàn chương'],
  ['opening_hook', 'Móc mở đầu'],
  ['closing_beat', 'Nhịp kết chương'],
  ['dialogue_tone', 'Giọng thoại'],
  ['class_humiliation', 'Cảm giác bị hạ thấp'],
  ['retaliation_sharpness', 'Độ sắc của phản đòn'],
] as const;

const FALLBACK_STYLE: StylePreset = {
  id: DEFAULT_CONFIG.stylePreset,
  displayName: 'Cố Mạn - ấm áp hiện đại',
  description: '',
};

export function StoryWorkspace(): JSX.Element {
  const [config, setConfig] = useState<StoryConfig>(DEFAULT_CONFIG);
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [storyId, setStoryId] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState('Drama chưa đặt tên');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Sẵn sàng bắt đầu');
  const [result, setResult] = useState<StoryResult>(EMPTY_RESULT);
  const [activeChapter, setActiveChapter] = useState(1);
  const [panel, setPanel] = useState<Panel>('chapters');
  const [rewriteMode, setRewriteMode] = useState('full_chapter');
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [storyListBusy, setStoryListBusy] = useState(false);
  const streamRef = useRef<EventSource | null>(null);

  const activeChapterData = useMemo(
    () => result.chapters.find((chapter) => chapter.index === activeChapter) ?? result.chapters[0],
    [activeChapter, result.chapters],
  );
  const markdown = useMemo(() => buildMarkdown(storyTitle, result), [result, storyTitle]);
  const busy = phase === 'suggesting' || phase === 'creating' || phase === 'streaming';
  const isSignedIn = Boolean(session && user);
  const outOfQuota = Boolean(quota && quota.remaining <= 0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await httpFetch('/story/style-presets');
        if (!response.ok) return;
        const data = (await response.json()) as { presets?: StylePreset[] };
        if (!cancelled && Array.isArray(data.presets)) setStyles(data.presets);
      } catch {
        // API có thể khởi động sau web client.
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) {
        void refreshAccount();
        void loadSavedStories();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void refreshAccount();
        void loadSavedStories();
      } else {
        setUser(null);
        setQuota(null);
        setSavedStories([]);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  function updateConfig<K extends keyof StoryConfig>(key: K, value: StoryConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function signInWithGoogle() {
    if (!supabase) {
      setError('Chưa cấu hình Supabase cho đăng nhập Google.');
      return;
    }

    await supabase.auth.signInWithOAuth({ provider: 'google' });
  }

  async function signOut() {
    streamRef.current?.close();
    await supabase?.auth.signOut();
  }

  async function refreshAccount() {
    try {
      const response = await httpFetch('/auth/me');
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { user: AppUser; quota: Quota };
      setUser(data.user);
      setQuota(data.quota);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể nạp tài khoản.');
    }
  }

  async function loadSavedStories() {
    const token = await getAccessToken();
    if (!token) return;
    setStoryListBusy(true);
    try {
      const response = await httpFetch('/stories');
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { stories?: SavedStory[] };
      setSavedStories(data.stories ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể nạp danh sách truyện.');
    } finally {
      setStoryListBusy(false);
    }
  }

  function requireLogin() {
    if (isSignedIn) return true;
    setError('Vui lòng đăng nhập bằng Google để dùng tính năng này.');
    return false;
  }

  async function suggestSetup() {
    if (!requireLogin()) return;
    setPhase('suggesting');
    setError(null);
    setProgressLabel('Đang gợi ý mầm truyện...');
    try {
      const response = await httpFetch('/story/setup-suggest', postJson(config));
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { title?: string; seed?: string; storyControls?: StoryControls };
      setConfig((current) => ({
        ...current,
        title: data.title || current.title,
        seed: data.seed || current.seed,
        storyControls: data.storyControls ?? current.storyControls,
      }));
      setStoryTitle(data.title || config.title || 'Drama chưa đặt tên');
      setProgressLabel('Đã có mầm truyện');
      setPhase('idle');
    } catch (err) {
      fail(err, 'Không thể gợi ý thiết lập truyện.');
    }
  }

  async function createStory() {
    if (!requireLogin()) return;
    if (outOfQuota) {
      setError('Bạn đã hết lượt viết truyện hôm nay. Nâng cấp Pro hoặc Premium để viết thêm.');
      return;
    }

    streamRef.current?.close();
    setPhase('creating');
    setError(null);
    setProgress(0);
    setProgressLabel('Đang tạo phiên sáng tác...');
    setResult(EMPTY_RESULT);
    setActiveChapter(1);
    setStoryTitle(config.title || 'Drama chưa đặt tên');
    try {
      const response = await httpFetch('/stories', postJson(config));
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { storyId: string; quota?: Quota };
      if (data.quota) setQuota(data.quota);
      setStoryId(data.storyId);
      await loadSavedStories();
      await connectStream(data.storyId);
    } catch (err) {
      fail(err, 'Không thể bắt đầu viết truyện.');
    }
  }

  async function connectStream(id: string) {
    const token = await getAccessToken();
    const tokenQuery = token ? `?access_token=${encodeURIComponent(token)}` : '';
    const source = new EventSource(`${API_BASE}/stories/${encodeURIComponent(id)}/stream${tokenQuery}`);
    streamRef.current = source;
    setPhase('streaming');
    source.onmessage = (event) => handleStreamEvent(JSON.parse(event.data) as StreamEvent);
    source.onerror = () => {
      source.close();
      setError('Luồng dữ liệu bị ngắt. Kiểm tra API rồi thử viết lại.');
      setPhase('failed');
    };
  }

  function handleStreamEvent(payload: StreamEvent) {
    if (payload.stage === 'progress') {
      const total = Math.max(payload.total ?? 1, 1);
      setProgress(Math.round(((payload.current ?? 0) / total) * 100));
      setProgressLabel(payload.detail || payload.label || 'Đang xử lý...');
      return;
    }
    if (payload.stage === 'overview') {
      if (payload.title) setStoryTitle(payload.title);
      setResult((current) => ({ ...current, concept: payload.concept ?? current.concept }));
      return;
    }
    if (payload.stage === 'bible') {
      setResult((current) => ({ ...current, bible: payload.bible ?? current.bible }));
      return;
    }
    if (payload.stage === 'relationshipGraph') {
      setResult((current) => ({ ...current, relationshipGraph: payload.relationshipGraph ?? current.relationshipGraph }));
      return;
    }
    if (payload.stage === 'plan') {
      setResult((current) => ({ ...current, plan: payload.plan ?? current.plan }));
      return;
    }
    if (payload.stage === 'chapter' && payload.chapter) {
      setResult((current) => ({ ...current, chapters: upsertChapter(current.chapters, payload.chapter!) }));
      setActiveChapter(payload.chapter.index);
      return;
    }
    if (payload.stage === 'done') {
      streamRef.current?.close();
      setProgress(100);
      setProgressLabel('Truyện đã hoàn tất');
      setPhase('completed');
      void loadSavedStories();
      void refreshAccount();
      return;
    }
    if (payload.stage === 'error') {
      fail(payload.error, 'Quá trình viết truyện thất bại.');
      streamRef.current?.close();
      void loadSavedStories();
    }
  }

  async function openStory(id: string) {
    if (!requireLogin()) return;
    try {
      const response = await httpFetch(`/stories/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { story: { id: string; title: string; storyPayload?: StoryPayload; relationshipGraph?: RelationshipGraph } };
      setStoryId(data.story.id);
      setStoryTitle(data.story.storyPayload?.title || data.story.title);
      setResult(data.story.storyPayload ? resultFromPayload(data.story.storyPayload) : { ...EMPTY_RESULT, relationshipGraph: data.story.relationshipGraph });
      setActiveChapter(1);
      setPanel('chapters');
      setPhase(data.story.storyPayload ? 'completed' : 'idle');
      setProgress(data.story.storyPayload ? 100 : 0);
      setProgressLabel(data.story.storyPayload ? 'Đã mở bản thảo đã lưu' : 'Truyện chưa có bản thảo hoàn tất');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể mở truyện.');
    }
  }

  async function renameStory(id: string, currentTitle: string) {
    const title = window.prompt('Nhập tiêu đề mới', currentTitle)?.trim();
    if (!title) return;
    try {
      const response = await httpFetch(`/stories/${encodeURIComponent(id)}`, jsonRequest('PATCH', { title }));
      if (!response.ok) throw new Error(await readError(response));
      await loadSavedStories();
      if (storyId === id) setStoryTitle(title);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đổi tên truyện.');
    }
  }

  async function deleteStory(id: string) {
    if (!window.confirm('Xóa truyện này khỏi danh sách?')) return;
    try {
      const response = await httpFetch(`/stories/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response));
      await loadSavedStories();
      if (storyId === id) {
        setStoryId(null);
        setStoryTitle('Drama chưa đặt tên');
        setResult(EMPTY_RESULT);
        setPhase('idle');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa truyện.');
    }
  }

  async function rewriteChapter() {
    if (!storyId || !activeChapterData || !rewriteInstruction.trim()) return;
    if (!requireLogin()) return;
    setRewriteBusy(true);
    setError(null);
    try {
      const response = await httpFetch(`/stories/${encodeURIComponent(storyId)}/rewrite`, postJson({
        chapterIndex: activeChapterData.index,
        mode: rewriteMode,
        instruction: rewriteInstruction,
      }));
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { chapter: Chapter; storyPayload?: StoryPayload; relationshipGraph?: RelationshipGraph };
      setResult((current) => ({
        ...current,
        chapters: upsertChapter(current.chapters, data.chapter),
        relationshipGraph: data.relationshipGraph ?? data.storyPayload?.relationshipGraph ?? current.relationshipGraph,
      }));
      setRewriteInstruction('');
      await loadSavedStories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể viết lại chương.');
    } finally {
      setRewriteBusy(false);
    }
  }

  function exportMarkdown() {
    if (!requireLogin()) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(storyTitle)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function fail(err: unknown, fallback: string) {
    setError(err instanceof Error ? err.message : String(err || fallback));
    setPhase('failed');
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Drama15 Lite Studio</p>
          <h1>Không gian sáng tác drama ngắn</h1>
          <p>Dựng ý tưởng, nhân vật, dàn ý, chương truyện và bản viết lại trong một không gian sáng tác tập trung.</p>
        </div>
        <aside className="status-card">
          <span>{PHASE_LABELS[phase]}</span>
          <strong>{progress}%</strong>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
          <small>{progressLabel}</small>
        </aside>
      </header>

      <section className="account-bar">
        {user ? (
          <div className="account-summary">
            {user.avatarUrl && <img src={user.avatarUrl} alt="Ảnh đại diện" />}
            <div>
              <strong>{user.displayName || user.email}</strong>
              <span>{TIER_LABELS[user.tier]} · Hôm nay còn {quota?.remaining ?? 0}/{quota?.limit ?? 1} lượt viết truyện</span>
            </div>
          </div>
        ) : <p>Đăng nhập Google để gợi ý mầm truyện, viết bản thảo và quản lý danh sách truyện.</p>}
        <div className="account-actions">
          {user ? <button type="button" className="secondary-button" onClick={() => void signOut()}>Đăng xuất</button> : <button type="button" className="primary-button" onClick={() => void signInWithGoogle()}>Đăng nhập bằng Google</button>}
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace-grid">
        <aside className="setup-panel">
          <PanelHeading label="Thiết lập" value="Sáng tác" />
          {quota && <div className={outOfQuota ? 'quota-card blocked' : 'quota-card'}><strong>Hôm nay còn {quota.remaining}/{quota.limit} lượt viết truyện</strong><span>{outOfQuota ? 'Nâng cấp Pro hoặc Premium để viết thêm.' : 'Quota được reset theo giờ Việt Nam.'}</span></div>}
          <label>Chủ đề<select value={config.niche} onChange={(event) => updateConfig('niche', event.target.value)}>{NICHES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {config.niche === 'custom' && <label>Nhánh tùy biến<input value={config.customNiche} onChange={(event) => updateConfig('customNiche', event.target.value)} placeholder="VD: mẹ đơn thân bị coi thường" /></label>}
          <label>Gợi ý nhan đề<input value={config.title} onChange={(event) => updateConfig('title', event.target.value)} placeholder="Có thể để trống" /></label>
          <label>Mầm truyện<textarea value={config.seed} onChange={(event) => updateConfig('seed', event.target.value)} placeholder="Cảnh mở đầu, bí mật, vật chứng, mối quan hệ..." rows={6} /></label>
          <label>Phong cách<select value={config.stylePreset} onChange={(event) => updateConfig('stylePreset', event.target.value)}>{(styles.length ? styles : [FALLBACK_STYLE]).map((style) => <option key={style.id} value={style.id}>{style.displayName}</option>)}</select></label>
          <label>Ngôn ngữ đầu ra<select value={config.outputLanguage} onChange={(event) => updateConfig('outputLanguage', event.target.value)}>{LANGUAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <Range label="Cường độ" value={config.intensity} onChange={(value) => updateConfig('intensity', value)} />
          <Range label="Đối thoại" value={config.dialogueRatio} onChange={(value) => updateConfig('dialogueRatio', value)} />
          <Range label="Móc câu" value={config.hookDensity} onChange={(value) => updateConfig('hookDensity', value)} />
          <div className="setup-actions"><button type="button" className="secondary-button" disabled={busy || !isSignedIn} onClick={() => void suggestSetup()}>Gợi ý mầm truyện</button><button type="button" className="primary-button" disabled={busy || !isSignedIn || outOfQuota} onClick={() => void createStory()}>Viết truyện</button></div>

          <StoryList stories={savedStories} busy={storyListBusy} signedIn={isSignedIn} onRefresh={loadSavedStories} onOpen={openStory} onRename={renameStory} onDelete={deleteStory} />
        </aside>

        <section className="story-panel">
          <div className="story-toolbar"><div><p className="eyebrow">Bản thảo</p><h2>{storyTitle}</h2></div><button type="button" disabled={!isSignedIn || result.chapters.length === 0} onClick={exportMarkdown}>Tải Markdown</button></div>
          <nav className="panel-tabs"><button type="button" className={panel === 'chapters' ? 'active' : ''} onClick={() => setPanel('chapters')}>Chương truyện</button><button type="button" className={panel === 'overview' ? 'active' : ''} onClick={() => setPanel('overview')}>Tổng quan</button><button type="button" className={panel === 'plan' ? 'active' : ''} onClick={() => setPanel('plan')}>Dàn ý</button><button type="button" className={panel === 'bible' ? 'active' : ''} onClick={() => setPanel('bible')}>Hồ sơ truyện</button><button type="button" className={panel === 'relationships' ? 'active' : ''} onClick={() => setPanel('relationships')}>Quan hệ nhân vật</button></nav>

          {panel === 'chapters' && <ChapterPanel chapters={result.chapters} activeChapter={activeChapter} activeChapterData={activeChapterData} onSelect={setActiveChapter} />}
          {panel === 'overview' && <TextPanel title="Ý tưởng truyện" content={result.concept} />}
          {panel === 'plan' && <TextPanel title="Dàn ý chương" content={result.plan} />}
          {panel === 'bible' && <TextPanel title="Hồ sơ truyện" content={result.bible ? JSON.stringify(result.bible, null, 2) : ''} />}
          {panel === 'relationships' && <RelationshipGraphPanel graph={result.relationshipGraph} />}

          {phase === 'completed' && activeChapterData && <section className="rewrite-panel"><PanelHeading label="Viết lại" value={`Chương ${activeChapterData.index}`} /><select value={rewriteMode} onChange={(event) => setRewriteMode(event.target.value)}>{REWRITE_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><textarea value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} placeholder="VD: giữ cốt truyện, tăng cảm giác bị coi thường." rows={3} /><button type="button" className="primary-button" disabled={rewriteBusy || !rewriteInstruction.trim() || !isSignedIn} onClick={() => void rewriteChapter()}>{rewriteBusy ? 'Đang viết lại...' : 'Viết lại chương'}</button></section>}
        </section>
      </section>
    </main>
  );
}

function StoryList({ stories, busy, signedIn, onRefresh, onOpen, onRename, onDelete }: { stories: SavedStory[]; busy: boolean; signedIn: boolean; onRefresh: () => Promise<void>; onOpen: (id: string) => Promise<void>; onRename: (id: string, title: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  return <section className="saved-stories"><PanelHeading label="Truyện của tôi" value={busy ? 'Đang nạp' : `${stories.length} truyện`} /><button type="button" className="secondary-button" disabled={!signedIn || busy} onClick={() => void onRefresh()}>Làm mới danh sách</button>{!signedIn ? <div className="empty-state compact">Đăng nhập để xem danh sách truyện đã tạo.</div> : stories.length === 0 ? <div className="empty-state compact">Chưa có truyện nào trong tài khoản này.</div> : <div className="story-list">{stories.map((story) => <article key={story.id} className="story-list-item"><button type="button" onClick={() => void onOpen(story.id)}><strong>{story.title}</strong><span>{STATUS_LABELS[story.status]} · {story.chapterCount}/10 chương</span></button><div><button type="button" onClick={() => void onRename(story.id, story.title)}>Đổi tên</button><button type="button" onClick={() => void onDelete(story.id)}>Xóa</button></div></article>)}</div>}</section>;
}

function ChapterPanel({ chapters, activeChapter, activeChapterData, onSelect }: { chapters: Chapter[]; activeChapter: number; activeChapterData?: Chapter; onSelect: (chapter: number) => void }) {
  return <div className="chapter-layout"><nav className="chapter-list">{Array.from({ length: 10 }, (_, index) => index + 1).map((number) => { const chapter = chapters.find((item) => item.index === number); return <button key={number} type="button" className={activeChapter === number ? 'active' : ''} disabled={!chapter} onClick={() => onSelect(number)}><span>{number.toString().padStart(2, '0')}</span><strong>{chapter?.title || 'Đang chờ'}</strong></button>; })}</nav><article className="chapter-reader">{activeChapterData ? <><h3>{activeChapterData.title || `Chương ${activeChapterData.index}`}</h3><div className="prose">{activeChapterData.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></> : <div className="empty-state">Chưa có chương nào. Bấm “Viết truyện” để bản thảo hiện ở đây.</div>}</article></div>;
}

function TextPanel({ title, content }: { title: string; content: string }) {
  return <article className="text-panel"><h3>{title}</h3>{content ? <pre>{content}</pre> : <div className="empty-state">Đang chờ dữ liệu từ phiên viết truyện.</div>}</article>;
}

function RelationshipGraphPanel({ graph }: { graph?: RelationshipGraph }) {
  if (!graph || graph.nodes.length === 0) {
    return <article className="text-panel"><h3>Quan hệ nhân vật</h3><div className="empty-state">Chưa có dữ liệu quan hệ nhân vật.</div></article>;
  }

  const positions = graph.nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(graph.nodes.length, 1) - Math.PI / 2;
    return { node, x: 260 + Math.cos(angle) * 190, y: 210 + Math.sin(angle) * 145 };
  });
  const byId = new Map(positions.map((item) => [item.node.id, item]));

  return <article className="relationship-panel"><h3>Quan hệ nhân vật</h3><div className="relationship-canvas"><svg viewBox="0 0 520 420" role="img" aria-label="Sơ đồ quan hệ nhân vật">{graph.edges.map((edge, index) => { const source = byId.get(edge.source); const target = byId.get(edge.target); if (!source || !target) return null; const midX = (source.x + target.x) / 2; const midY = (source.y + target.y) / 2; return <g key={`${edge.source}-${edge.target}-${index}`}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} /><text x={midX} y={midY}>{edge.chapterNumber ? `Ch.${edge.chapterNumber}` : edge.type}</text></g>; })}{positions.map(({ node, x, y }) => <g key={node.id} className="relationship-node"><circle cx={x} cy={y} r="46" /><text x={x} y={y - 4}>{node.name}</text><text x={x} y={y + 14}>{node.role}</text></g>)}</svg></div><div className="relationship-list">{graph.edges.map((edge, index) => { const source = byId.get(edge.source)?.node.name ?? edge.source; const target = byId.get(edge.target)?.node.name ?? edge.target; return <p key={index}><strong>{source} → {target}</strong><span>{edge.label}</span></p>; })}</div></article>;
}

function PanelHeading({ label, value }: { label: string; value: string }) {
  return <div className="panel-heading"><span>{label}</span><strong>{value}</strong></div>;
}

function Range({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="range-row"><span>{label}</span><input type="range" min="0" max="1" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} /><strong>{Math.round(value * 100)}</strong></label>;
}

function postJson(value: unknown): RequestInit {
  return jsonRequest('POST', value);
}

function jsonRequest(method: string, value: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
}

function upsertChapter(chapters: Chapter[], next: Chapter) {
  return [...chapters.filter((chapter) => chapter.index !== next.index), next].sort((a, b) => a.index - b.index);
}

function resultFromPayload(payload: StoryPayload): StoryResult {
  return {
    concept: [`Nhan đề: ${payload.title}`, `Tóm tắt một câu: ${payload.concept.logline}`, `Lời hứa thể loại: ${payload.concept.promise}`, `Xung đột: ${payload.concept.conflictEngine}`].join('\n'),
    plan: payload.chapterPlan.map((chapter) => [`${chapter.chapterNumber}. ${chapter.title}`, `Nhịp chính: ${chapter.mainBeat}`, `Móc câu: ${chapter.hook}`, `Kết chương: ${chapter.endingBeat}`].join('\n')).join('\n\n'),
    bible: payload.storyBible,
    relationshipGraph: payload.relationshipGraph,
    chapters: payload.chapters.map((chapter) => ({ index: chapter.chapterNumber, title: chapter.title, content: chapter.text })),
  };
}

function buildMarkdown(title: string, result: StoryResult) {
  const parts = [`# ${title || 'Truyện Drama15'}`];
  if (result.concept) parts.push('## Ý tưởng', result.concept);
  if (result.plan) parts.push('## Dàn ý', result.plan);
  for (const chapter of result.chapters) parts.push(`## Chương ${chapter.index}: ${chapter.title || ''}`.trim(), chapter.content.trim());
  return `${parts.join('\n\n')}\n`;
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'drama15-story';
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

export default StoryWorkspace;
