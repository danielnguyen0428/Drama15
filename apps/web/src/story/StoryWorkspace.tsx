import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { getApiBaseUrl } from '../api/apiBase';
import { httpFetch } from '../api/httpClient';
import { getAccessToken, supabase } from '../api/supabaseClient';
import { canResumeStory, createRelationshipGraphPreview, normalizeRelationshipGraph, TOTAL_CHAPTERS, type RelationshipGraphView } from './storyViewModel';
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
type StoryResult = { concept: string; plan: string; bible?: unknown; relationshipGraph?: RelationshipGraphView; chapters: Chapter[] };
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
  canResume?: boolean;
  error?: string;
};
type StoryDetail = SavedStory & {
  storyPayload?: StoryPayload;
  relationshipGraph?: unknown;
};
type StoryPayload = {
  title: string;
  concept: { logline: string; promise: string; conflictEngine: string };
  storyBible: unknown;
  chapterPlan: Array<{ chapterNumber: number; title: string; mainBeat: string; hook: string; endingBeat: string }>;
  chapters: Array<{ chapterNumber: number; title?: string; text: string }>;
  relationshipGraph?: unknown;
};

type StreamEvent = {
  stage?: 'progress' | 'overview' | 'bible' | 'plan' | 'relationshipGraph' | 'chapter' | 'done' | 'error';
  title?: string;
  concept?: string;
  bible?: unknown;
  relationshipGraph?: unknown;
  plan?: string;
  chapter?: Chapter;
  label?: string;
  detail?: string;
  current?: number;
  total?: number;
  error?: string;
};

const API_BASE = getApiBaseUrl();
const FREE_SETUP_SUGGESTION_QUOTA_COPY = 'Free: 10 lượt gợi ý kịch bản/ngày.';
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
  ['cheating_ex_wedding_drama', 'Ngoại tình / cưới hỏi rạn vỡ / Dark romance'],
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
  idle: 'Sẵn sàng gợi ý kịch bản',
  suggesting: 'Đang ươm ý',
  creating: 'Đang mở phiên',
  streaming: 'Đang viết chương',
  completed: 'Hoàn tất',
  failed: 'Cần thử lại',
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
  const [storyTitle, setStoryTitle] = useState('Truyện chưa đặt tên');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [stageStartedAt, setStageStartedAt] = useState<number | null>(null);
  const [stageElapsed, setStageElapsed] = useState(0);
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
  const [setupSuggestionQuota, setSetupSuggestionQuota] = useState<Quota | null>(null);
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [storyListBusy, setStoryListBusy] = useState(false);
  const streamRef = useRef<EventSource | null>(null);
  const storyPanelRef = useRef<HTMLElement | null>(null);
  const [storyPanelFocused, setStoryPanelFocused] = useState(false);

  const focusStoryPanel = useCallback(() => {
    setStoryPanelFocused(true);
    storyPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => setStoryPanelFocused(false), 1600);
  }, []);

  const typewriter = useTypewriterQueue({
    onSectionStart: useCallback((job: RevealJob) => {
      // Auto-switch to overview when concept starts (first content to arrive).
      // For chapters, switch to the chapters panel so user sees writing happen.
      // For bible/plan, do NOT force a panel switch — they type in the background
      // and user can navigate there at will while concept is still animating.
      if (job.panel === 'overview' || job.panel === 'chapters') {
        setPanel(job.panel);
      }
      if (job.chapterIndex !== undefined) setActiveChapter(job.chapterIndex);
    }, []),
  });

  const activeChapterData = useMemo(
    () => result.chapters.find((chapter) => chapter.index === activeChapter) ?? result.chapters[0],
    [activeChapter, result.chapters],
  );
  const currentSavedStory = useMemo(
    () => storyId ? savedStories.find((story) => story.id === storyId) : undefined,
    [savedStories, storyId],
  );
  const resumableStory = useMemo(() => savedStories.find(canResumeStory), [savedStories]);
  const markdown = useMemo(() => buildMarkdown(storyTitle, result), [result, storyTitle]);
  const busy = phase === 'suggesting' || phase === 'creating' || phase === 'streaming';
  const streaming = phase === 'creating' || phase === 'streaming';
  const writing = streaming || typewriter.active;
  const isSignedIn = Boolean(session && user);
  const outOfQuota = Boolean(quota && quota.remaining <= 0);
  const outOfSetupSuggestionQuota = Boolean(setupSuggestionQuota && setupSuggestionQuota.remaining <= 0);
  const canResumeCurrentStory = Boolean(
    storyId && phase !== 'completed' && (currentSavedStory ? canResumeStory(currentSavedStory) : result.chapters.length > 0 && result.chapters.length < TOTAL_CHAPTERS),
  );
  const setupSuggestionQuotaCopy = setupSuggestionQuota
    ? outOfSetupSuggestionQuota
      ? `Đã dùng hết ${setupSuggestionQuota.limit} lượt gợi ý kịch bản hôm nay.`
      : `Còn ${setupSuggestionQuota.remaining}/${setupSuggestionQuota.limit} lượt gợi ý kịch bản hôm nay.`
    : FREE_SETUP_SUGGESTION_QUOTA_COPY;

  useEffect(() => {
    if (!busy) {
      setStageElapsed(0);
      return;
    }
    const startedAt = stageStartedAt ?? Date.now();
    const tick = () => setStageElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [busy, stageStartedAt]);

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
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session);
        if (!data.session) return;
        void refreshAccount();
        void loadSavedStories();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không thể hoàn tất đăng nhập Google.');
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void refreshAccount();
        void loadSavedStories();
      } else {
        setUser(null);
        setQuota(null);
        setSetupSuggestionQuota(null);
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

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  async function signOut() {
    streamRef.current?.close();
    await supabase?.auth.signOut();
  }

  async function refreshAccount() {
    try {
      const response = await httpFetch('/auth/me');
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { user: AppUser; quota: Quota; setupSuggestionQuota?: Quota | null };
      setUser(data.user);
      setQuota(data.quota);
      setSetupSuggestionQuota(data.setupSuggestionQuota ?? null);
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
    setProgressLabel('Đang tìm kịch bản phù hợp...');
    try {
      const response = await httpFetch('/story/setup-suggest', postJson(config));
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { title?: string; seed?: string; storyControls?: StoryControls; setupSuggestionQuota?: Quota };
      if (data.setupSuggestionQuota) setSetupSuggestionQuota(data.setupSuggestionQuota);
      setConfig((current) => ({
        ...current,
        title: data.title || current.title,
        seed: data.seed || current.seed,
        storyControls: data.storyControls ?? current.storyControls,
      }));
      setStoryTitle(data.title || config.title || 'Truyện chưa đặt tên');
      setProgressLabel('Kịch bản đã sẵn sàng');
      setPhase('idle');
    } catch (err) {
      fail(err, 'Không thể gợi ý thiết lập truyện.');
    }
  }

  async function createStory() {
    if (!requireLogin()) return;
    if (outOfQuota) {
      setError('Bạn đã hết số bản thảo truyện có thể viết hôm nay. Nâng cấp Pro hoặc Premium để viết thêm bản thảo.');
      return;
    }

    focusStoryPanel();
    streamRef.current?.close();
    typewriter.reset();
    setPhase('creating');
    setError(null);
    setProgress(0);
    setStageStartedAt(Date.now());
    setProgressLabel('Đang mở phiên viết...');
    setResult(EMPTY_RESULT);
    setActiveChapter(1);
    setPanel('overview');
    setStoryTitle(config.title || 'Truyện chưa đặt tên');
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
      setError('Phiên viết bị ngắt kết nối. Bấm “Viết tiếp truyện” để nối lại các chương còn thiếu.');
      setPhase('failed');
      void loadSavedStories();
    };
  }

  async function fetchStory(id: string) {
    const response = await httpFetch(`/stories/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { story: StoryDetail };
    return data.story;
  }

  function applyStoryDetail(story: StoryDetail, label?: string) {
    const chapterCount = story.storyPayload?.chapters.length ?? story.chapterCount;
    const completed = story.status === 'completed' || chapterCount >= TOTAL_CHAPTERS;

    setStoryId(story.id);
    setStoryTitle(story.storyPayload?.title || story.title);
    setResult(story.storyPayload ? resultFromPayload(story.storyPayload) : { ...EMPTY_RESULT, relationshipGraph: normalizeRelationshipGraph(story.relationshipGraph) });
    setActiveChapter(story.storyPayload?.chapters[0]?.chapterNumber ?? 1);
    setPanel('chapters');
    setPhase(completed ? 'completed' : story.status === 'failed' ? 'failed' : 'idle');
    setProgress(completed ? 100 : Math.round((chapterCount / TOTAL_CHAPTERS) * 100));
    setProgressLabel(label ?? (completed ? 'Đã mở bản thảo đã lưu' : chapterCount > 0 ? `Đã mở bản thảo ${chapterCount}/${TOTAL_CHAPTERS} chương` : 'Truyện này chưa có chương hoàn chỉnh'));
  }

  function handleStreamEvent(payload: StreamEvent) {
    if (payload.stage === 'progress') {
      const total = Math.max(payload.total ?? 1, 1);
      setProgress(Math.round(((payload.current ?? 0) / total) * 100));
      const nextLabel = payload.detail || payload.label || 'Đang xử lý...';
      setProgressLabel((current) => {
        if (current !== nextLabel) setStageStartedAt(Date.now());
        return nextLabel;
      });
      return;
    }
    if (payload.stage === 'overview') {
      if (payload.title) setStoryTitle(payload.title);
      const concept = payload.concept ?? '';
      setResult((current) => ({ ...current, concept: concept || current.concept }));
      if (concept) typewriter.enqueue({ key: 'concept', panel: 'overview', length: concept.length });
      return;
    }
    if (payload.stage === 'bible') {
      setResult((current) => ({ ...current, bible: payload.bible ?? current.bible }));
      if (payload.bible !== undefined) typewriter.enqueue({ key: 'bible', panel: 'bible', length: stringifyBible(payload.bible).length });
      return;
    }
    if (payload.stage === 'relationshipGraph') {
      setResult((current) => ({ ...current, relationshipGraph: normalizeRelationshipGraph(payload.relationshipGraph) ?? current.relationshipGraph }));
      return;
    }
    if (payload.stage === 'plan') {
      const plan = payload.plan ?? '';
      setResult((current) => ({ ...current, plan: plan || current.plan }));
      if (plan) typewriter.enqueue({ key: 'plan', panel: 'plan', length: plan.length });
      return;
    }
    if (payload.stage === 'chapter' && payload.chapter) {
      const chapter = payload.chapter;
      setResult((current) => ({ ...current, chapters: upsertChapter(current.chapters, chapter) }));
      typewriter.enqueue({ key: `chapter-${chapter.index}`, panel: 'chapters', chapterIndex: chapter.index, length: chapter.content.length });
      return;
    }
    if (payload.stage === 'done') {
      streamRef.current?.close();
      setProgress(100);
      setProgressLabel('Bản thảo đã hoàn tất');
      setPhase('completed');
      void loadSavedStories();
      void refreshAccount();
      return;
    }
    if (payload.stage === 'error') {
      fail(payload.error, 'Phiên viết bị gián đoạn. Bạn có thể thử viết tiếp từ bản thảo đã có.');
      typewriter.complete();
      streamRef.current?.close();
      void loadSavedStories();
    }
  }

  async function openStory(id: string) {
    if (!requireLogin()) return;
    try {
      applyStoryDetail(await fetchStory(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể mở truyện.');
    }
  }

  async function resumeStory(id: string) {
    if (!requireLogin()) return;
    streamRef.current?.close();
    focusStoryPanel();
    setError(null);
    setPhase('creating');
    setProgressLabel('Đang chuẩn bị viết tiếp...');
    try {
      const story = await fetchStory(id);
      applyStoryDetail(story, 'Đã nạp bản thảo dang dở');
      typewriter.prime(existingRevealKeys(story));
      const response = await httpFetch(`/stories/${encodeURIComponent(id)}/resume`, { method: 'POST' });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { storyId?: string };
      const nextStoryId = data.storyId || id;
      setStoryId(nextStoryId);
      await loadSavedStories();
      await connectStream(nextStoryId);
    } catch (err) {
      fail(err, 'Không thể viết tiếp truyện.');
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
        setStoryTitle('Truyện chưa đặt tên');
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
      const data = (await response.json()) as { chapter: Chapter; storyPayload?: StoryPayload; relationshipGraph?: unknown };
      setResult((current) => ({
        ...current,
        chapters: upsertChapter(current.chapters, data.chapter),
        relationshipGraph: normalizeRelationshipGraph(data.relationshipGraph ?? data.storyPayload?.relationshipGraph) ?? current.relationshipGraph,
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
        <div className="studio-title-block">
          <div className="studio-kicker"><span>NovelKit Studio</span><i>Bản thảo 15 chương</i></div>
          <h1>Drama 15: Xưởng viết tiểu thuyết ngắn</h1>
          <p>Ươm ý tưởng, dựng nhân vật, lập dàn ý và viết từng chương trong một không gian gọn gàng cho người viết truyện.</p>
          <div className="studio-meta" aria-label="Quy trình sáng tác">
            <span>Ý tưởng</span>
            <span>Nhân vật</span>
            <span>Dàn ý</span>
            <span>Bản thảo chương</span>
          </div>
        </div>
        <aside className="announcement-card" role="note">
          <span className="announcement-kicker">Thông báo từ Admin</span>
          <p>Hệ thống thử nghiệm nên đôi khi chưa ổn định, ace gặp lỗi vui lòng nhắn admin qua <a href="https://t.me/chatnovelkit" target="_blank" rel="noreferrer noopener">t.me/chatnovelkit</a></p>
        </aside>
      </header>

      <section className="account-bar">
        {user ? (
          <div className="account-summary">
            {user.avatarUrl && <img src={user.avatarUrl} alt="Ảnh đại diện" />}
            <div>
              <strong>{user.displayName || user.email}</strong>
              <span>{TIER_LABELS[user.tier]}</span>
            </div>
          </div>
        ) : <p>Đăng nhập Google để gợi ý kịch bản, viết bản thảo và giữ lại tủ truyện của bạn.</p>}
        <div className="account-usage">
          {quota && <div className={outOfQuota ? 'account-quota blocked' : 'account-quota'}><strong>Hôm nay còn {quota.remaining}/{quota.limit} bản thảo truyện có thể viết</strong><span>{outOfQuota ? 'Nâng cấp Pro hoặc Premium để viết thêm bản thảo.' : 'Mỗi bản thảo gồm ý tưởng, nhân vật, dàn ý, quan hệ và toàn bộ chương.'}</span></div>}
          <div className={outOfSetupSuggestionQuota ? 'account-quota blocked' : 'account-quota'}><strong>{setupSuggestionQuotaCopy}</strong></div>
        </div>
        <div className="account-actions">
          {user ? <>{resumableStory && <button type="button" className="primary-button" disabled={busy} onClick={() => void resumeStory(resumableStory.id)}>Viết tiếp truyện</button>}<button type="button" className="secondary-button" onClick={() => void signOut()}>Đăng xuất</button></> : <button type="button" className="primary-button" onClick={() => void signInWithGoogle()}>Đăng nhập bằng Google</button>}
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace-grid">
        <aside className="setup-panel">
          <PanelHeading label="Khởi tạo" value="Cốt truyện" />
          <label>Dòng truyện<select value={config.niche} onChange={(event) => updateConfig('niche', event.target.value)}>{NICHES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {config.niche === 'custom' && <label>Nhánh riêng<input value={config.customNiche} onChange={(event) => updateConfig('customNiche', event.target.value)} placeholder="VD: mẹ đơn thân bị xem thường" /></label>}
          <label>Nhan đề dự kiến<input value={config.title} onChange={(event) => updateConfig('title', event.target.value)} placeholder="Có thể để trống" /></label>
          <label>Kịch bản / cốt truyện<textarea value={config.seed} onChange={(event) => updateConfig('seed', event.target.value)} placeholder="Một cảnh mở đầu, bí mật, vật chứng, mối quan hệ hoặc cảm xúc bạn muốn giữ..." rows={6} /></label>
          <label>Giọng kể<select value={config.stylePreset} onChange={(event) => updateConfig('stylePreset', event.target.value)}>{(styles.length ? styles : [FALLBACK_STYLE]).map((style) => <option key={style.id} value={style.id}>{style.displayName}</option>)}</select></label>
          <label>Ngôn ngữ bản thảo<select value={config.outputLanguage} onChange={(event) => updateConfig('outputLanguage', event.target.value)}>{LANGUAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <Range label="Cường độ cảm xúc" value={config.intensity} onChange={(value) => updateConfig('intensity', value)} />
          <Range label="Tỷ lệ thoại" value={config.dialogueRatio} min={0.2} max={0.85} onChange={(value) => updateConfig('dialogueRatio', value)} />
          <Range label="Mật độ móc câu" value={config.hookDensity} onChange={(value) => updateConfig('hookDensity', value)} />
          <div className="setup-actions"><button type="button" className="secondary-button" disabled={busy || !isSignedIn || outOfSetupSuggestionQuota} onClick={() => void suggestSetup()}>Gợi ý kịch bản</button><button type="button" className="primary-button" disabled={busy || !isSignedIn || outOfQuota} onClick={() => void createStory()}>Viết bản thảo</button></div>
        </aside>

        <section className={storyPanelFocused || writing ? 'story-panel focused' : 'story-panel'} ref={storyPanelRef}>
          <div className="story-toolbar"><div><p className="eyebrow">Bản thảo truyện</p><h2>{storyTitle}</h2></div><div className="story-toolbar-actions">{canResumeCurrentStory && <button type="button" className="primary-button" disabled={!isSignedIn || busy} onClick={() => storyId && void resumeStory(storyId)}>Viết tiếp truyện</button>}<button type="button" disabled={!isSignedIn || result.chapters.length === 0} onClick={exportMarkdown}>Tải bản thảo</button></div></div>
          <nav className="panel-tabs"><button type="button" className={panel === 'chapters' ? 'active' : ''} onClick={() => setPanel('chapters')}>Chương</button><button type="button" className={panel === 'overview' ? 'active' : ''} onClick={() => setPanel('overview')}>Ý tưởng</button><button type="button" className={panel === 'plan' ? 'active' : ''} onClick={() => setPanel('plan')}>Dàn ý</button><button type="button" className={panel === 'bible' ? 'active' : ''} onClick={() => setPanel('bible')}>Hồ sơ</button><button type="button" className={panel === 'relationships' ? 'active' : ''} onClick={() => setPanel('relationships')}>Quan hệ</button></nav>
          <div className="status-card story-status-card">
            <span>{PHASE_LABELS[phase]}</span>
            <small className="loading-action">{progressLabel}{busy && stageElapsed >= 3 ? ` · ${formatElapsed(stageElapsed)}` : ''}</small>
            <LoadingAnimation active={busy} />
            <div className="progress-row"><strong>{progress}%</strong><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>
          </div>

          {panel === 'chapters' && <ChapterPanel chapters={result.chapters} activeChapter={activeChapter} activeChapterData={activeChapterData} onSelect={setActiveChapter} loading={writing} reveal={activeChapterData ? typewriter.revealed[`chapter-${activeChapterData.index}`] : undefined} typing={!!activeChapterData && typewriter.activeKey === `chapter-${activeChapterData.index}`} />}
          {panel === 'overview' && <TextPanel title="Kịch bản / cốt truyện" content={result.concept} loading={writing} reveal={typewriter.revealed.concept} typing={typewriter.activeKey === 'concept'} />}
          {panel === 'plan' && <TextPanel title="Dàn ý chương" content={result.plan} loading={writing} reveal={typewriter.revealed.plan} typing={typewriter.activeKey === 'plan'} />}
          {panel === 'bible' && <TextPanel title="Hồ sơ truyện" content={stringifyBible(result.bible)} loading={writing} reveal={typewriter.revealed.bible} typing={typewriter.activeKey === 'bible'} />}
          {panel === 'relationships' && <RelationshipGraphPanel graph={result.relationshipGraph} />}

          {phase === 'completed' && activeChapterData && <section className="rewrite-panel"><PanelHeading label="Chỉnh chương" value={`Chương ${activeChapterData.index}`} /><select value={rewriteMode} onChange={(event) => setRewriteMode(event.target.value)}>{REWRITE_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><textarea value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} placeholder="VD: giữ cốt truyện, tăng cảm giác bị xem thường ở đoạn cao trào." rows={3} /><button type="button" className="primary-button" disabled={rewriteBusy || !rewriteInstruction.trim() || !isSignedIn} onClick={() => void rewriteChapter()}>{rewriteBusy ? 'Đang viết lại...' : 'Viết lại chương'}</button></section>}
        </section>

        <aside className="saved-panel">
          <StoryList stories={savedStories} busy={storyListBusy} signedIn={isSignedIn} onRefresh={loadSavedStories} onOpen={openStory} onResume={resumeStory} onRename={renameStory} onDelete={deleteStory} />
        </aside>
      </section>
      <footer className="workspace-footer">
        <nav aria-label="Liên kết NovelKit">
          <a href="https://novelkit.cc">novelkit.cc</a>
          <a href="https://meowsolo.com">meowsolo.com</a>
          <a href="https://beta.novelkit.cc">beta.novelkit.cc</a>
        </nav>
        <span>Made NovelKit.Cc with ❤️ by Dũng Nguyễn</span>
      </footer>
    </main>
  );
}

function LoadingAnimation({ active }: { active: boolean }) {
  return (
    <div className={active ? 'loading-dog active' : 'loading-dog'} aria-hidden="true">
      <img src="/loading-dog.svg" alt="" />
    </div>
  );
}

function StoryList({ stories, busy, signedIn, onRefresh, onOpen, onResume, onRename, onDelete }: { stories: SavedStory[]; busy: boolean; signedIn: boolean; onRefresh: () => Promise<void>; onOpen: (id: string) => Promise<void>; onResume: (id: string) => Promise<void>; onRename: (id: string, title: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  return <section className="saved-stories"><PanelHeading label="Tủ truyện" value={busy ? 'Đang nạp' : `${stories.length} truyện`} /><button type="button" className="secondary-button" disabled={!signedIn || busy} onClick={() => void onRefresh()}>Nạp lại tủ truyện</button>{!signedIn ? <div className="empty-state compact">Đăng nhập để xem các bản thảo đã lưu.</div> : stories.length === 0 ? <div className="empty-state compact">Tủ truyện đang trống. Viết bản thảo đầu tiên để lưu tại đây.</div> : <div className="story-list">{stories.map((story) => <article key={story.id} className="story-list-item"><button type="button" onClick={() => void onOpen(story.id)}><strong>{story.title}</strong><span>{STATUS_LABELS[story.status]} · {story.chapterCount}/{TOTAL_CHAPTERS} chương</span></button><div>{canResumeStory(story) && <button type="button" onClick={() => void onResume(story.id)}>Viết tiếp</button>}<button type="button" onClick={() => void onRename(story.id, story.title)}>Đổi tên</button><button type="button" onClick={() => void onDelete(story.id)}>Xóa</button></div></article>)}</div>}</section>;
}

function ChapterPanel({ chapters, activeChapter, activeChapterData, onSelect, loading, reveal, typing }: { chapters: Chapter[]; activeChapter: number; activeChapterData?: Chapter; onSelect: (chapter: number) => void; loading?: boolean; reveal?: number; typing?: boolean }) {
  const fullText = activeChapterData?.content ?? '';
  const shown = typing && reveal !== undefined ? fullText.slice(0, reveal) : fullText;
  const hasText = shown.trim().length > 0;
  return <div className="chapter-layout"><nav className="chapter-list">{Array.from({ length: TOTAL_CHAPTERS }, (_, index) => index + 1).map((number) => { const chapter = chapters.find((item) => item.index === number); return <button key={number} type="button" className={activeChapter === number ? 'active' : ''} disabled={!chapter} onClick={() => onSelect(number)}><span>{number.toString().padStart(2, '0')}</span><strong>{chapter?.title || 'Đang chờ'}</strong></button>; })}</nav><article className="chapter-reader">{activeChapterData && hasText ? <><h3>{activeChapterData.title || `Chương ${activeChapterData.index}`}</h3><TypewriterProse text={shown} typing={typing} /></> : loading ? <ReaderLoading message="Mèo đang viết chương cho bạn..." /> : <div className="empty-state">Chưa có chương nào. Bấm “Viết bản thảo” để bắt đầu.</div>}</article></div>;
}

function TextPanel({ title, content, loading, reveal, typing }: { title: string; content: string; loading?: boolean; reveal?: number; typing?: boolean }) {
  const shown = typing && reveal !== undefined ? content.slice(0, reveal) : content;
  return <article className="text-panel"><h3>{title}</h3>{content ? <pre>{shown}{typing && shown.length < content.length ? <span className="type-caret" aria-hidden="true" /> : null}</pre> : loading ? <ReaderLoading message="Mèo đang chuẩn bị nội dung..." /> : <div className="empty-state">Nội dung sẽ hiện ở đây khi phiên viết bắt đầu.</div>}</article>;
}

function TypewriterProse({ text, typing }: { text: string; typing?: boolean }) {
  const paragraphs = text.split(/\n{2,}/);
  return <div className="prose">{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}{typing && index === paragraphs.length - 1 ? <span className="type-caret" aria-hidden="true" /> : null}</p>)}</div>;
}

function ReaderLoading({ message }: { message: string }) {
  return <div className="reader-loading"><LoadingAnimation active /><p>{message}</p></div>;
}

function RelationshipGraphPanel({ graph }: { graph?: RelationshipGraphView }) {
  const graphPreview = createRelationshipGraphPreview(graph);
  if (!graphPreview || graphPreview.nodes.length === 0) {
    return <article className="text-panel"><h3>Quan hệ nhân vật</h3><div className="empty-state">Quan hệ nhân vật sẽ hiện sau khi hệ thống dựng hồ sơ truyện.</div></article>;
  }

  const positions = graphPreview.nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(graphPreview.nodes.length, 1) - Math.PI / 2;
    return { node, x: 260 + Math.cos(angle) * 190, y: 210 + Math.sin(angle) * 145 };
  });
  const byId = new Map(positions.map((item) => [item.node.id, item]));
  const hiddenCount = graphPreview.hiddenNodeCount + graphPreview.hiddenEdgeCount;

  return <article className="relationship-panel"><h3>Quan hệ nhân vật</h3>{hiddenCount > 0 && <p className="relationship-note">Đang hiển thị {graphPreview.nodes.length} nhân vật chính và {graphPreview.edges.length} quan hệ nổi bật.</p>}<div className="relationship-canvas"><svg viewBox="0 0 520 420" role="img" aria-label="Sơ đồ quan hệ nhân vật">{graphPreview.edges.map((edge, index) => { const source = byId.get(edge.source); const target = byId.get(edge.target); if (!source || !target) return null; const midX = (source.x + target.x) / 2; const midY = (source.y + target.y) / 2; return <g key={`${edge.source}-${edge.target}-${index}`}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} /><text x={midX} y={midY}>{edge.chapterNumber ? `Ch.${edge.chapterNumber}` : edge.type}</text></g>; })}{positions.map(({ node, x, y }) => <g key={node.id} className="relationship-node"><circle cx={x} cy={y} r="38" /><text x={x} y={y - 4}>{node.name}</text><text x={x} y={y + 14}>{node.role}</text></g>)}</svg></div><div className="relationship-list">{graphPreview.edges.map((edge, index) => { const source = byId.get(edge.source)?.node.name ?? edge.source; const target = byId.get(edge.target)?.node.name ?? edge.target; return <p key={index}><strong>{source} → {target}</strong><span>{edge.label}</span></p>; })}</div></article>;
}

function PanelHeading({ label, value }: { label: string; value: string }) {
  return <div className="panel-heading"><span>{label}</span><strong>{value}</strong></div>;
}

type RevealJob = {
  key: string;
  panel: Panel;
  chapterIndex?: number;
  length: number;
};

type TypewriterController = {
  /** Number of characters currently revealed for a given reveal key. */
  revealed: Record<string, number>;
  /** The reveal key that is actively typing, if any. */
  activeKey: string | null;
  /** True while there is queued or in-progress typing. */
  active: boolean;
  /** Queue a section to be typed out. Ignores duplicates already seen. */
  enqueue: (job: RevealJob) => void;
  /** Flush everything to fully revealed (used on done/error). */
  complete: () => void;
  /** Clear all reveal state for a fresh story session. */
  reset: () => void;
  /** Reset, then mark the given keys as already revealed (used on resume). */
  prime: (keys: string[]) => void;
};

const TYPEWRITER_TICK_MS = 16;
const TYPEWRITER_BASE_CPS = 200; // characters per second when caught up

/**
 * Client-side typewriter that reveals streamed sections one after another,
 * activating the relevant panel as each section begins. The backend delivers
 * whole blocks (concept/bible/plan, then each chapter), so the chatbot-style
 * incremental reveal is simulated here without touching the API/stream.
 */
function useTypewriterQueue({ onSectionStart }: { onSectionStart: (job: RevealJob) => void }): TypewriterController {
  const [revealed, setRevealed] = useState<Record<string, number>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  const queueRef = useRef<RevealJob[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const currentRef = useRef<RevealJob | null>(null);
  const revealedRef = useRef<Record<string, number>>({});
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const onSectionStartRef = useRef(onSectionStart);
  onSectionStartRef.current = onSectionStart;

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      window.clearTimeout(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const setRevealedFor = useCallback((key: string, value: number) => {
    revealedRef.current = { ...revealedRef.current, [key]: value };
    setRevealed(revealedRef.current);
  }, []);

  const tick = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastTickRef.current;
    lastTickRef.current = now;

    let job = currentRef.current;
    if (!job) {
      job = queueRef.current.shift() ?? null;
      currentRef.current = job;
      if (job) {
        setActiveKey(job.key);
        setRevealedFor(job.key, 0);
        onSectionStartRef.current(job);
      }
    }

    if (!job) {
      stopLoop();
      setActive(false);
      setActiveKey(null);
      return;
    }

    // Speed up when a backlog is waiting so the reader can catch up.
    const backlog = queueRef.current.length;
    const cps = TYPEWRITER_BASE_CPS * (1 + backlog * 0.6);
    const current = revealedRef.current[job.key] ?? 0;
    const next = Math.min(job.length, current + Math.max(1, Math.ceil((cps * elapsed) / 1000)));
    if (next !== current) setRevealedFor(job.key, next);

    if (next >= job.length) {
      currentRef.current = null;
    }

    rafRef.current = window.setTimeout(tick, TYPEWRITER_TICK_MS);
  }, [setRevealedFor, stopLoop]);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    lastTickRef.current = Date.now();
    setActive(true);
    rafRef.current = window.setTimeout(tick, TYPEWRITER_TICK_MS);
  }, [tick]);

  const enqueue = useCallback((job: RevealJob) => {
    if (seenRef.current.has(job.key)) {
      // Already revealed (e.g. replayed on reconnect): show in full immediately.
      if ((revealedRef.current[job.key] ?? 0) < job.length) setRevealedFor(job.key, job.length);
      return;
    }
    seenRef.current.add(job.key);
    queueRef.current.push(job);
    startLoop();
  }, [setRevealedFor, startLoop]);

  const complete = useCallback(() => {
    stopLoop();
    const merged = { ...revealedRef.current };
    if (currentRef.current) merged[currentRef.current.key] = currentRef.current.length;
    for (const job of queueRef.current) merged[job.key] = job.length;
    queueRef.current = [];
    currentRef.current = null;
    revealedRef.current = merged;
    setRevealed(merged);
    setActive(false);
    setActiveKey(null);
  }, [stopLoop]);

  useEffect(() => stopLoop, [stopLoop]);

  const reset = useCallback(() => {
    stopLoop();
    queueRef.current = [];
    seenRef.current = new Set();
    currentRef.current = null;
    revealedRef.current = {};
    setRevealed({});
    setActive(false);
    setActiveKey(null);
  }, [stopLoop]);

  const prime = useCallback((keys: string[]) => {
    reset();
    seenRef.current = new Set(keys);
  }, [reset]);

  return { revealed, activeKey, active, enqueue, complete, reset, prime };
}

function Range({ label, value, onChange, min = 0, max = 1, step = 0.01 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <label className="range-row"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><strong>{Math.round(value * 100)}</strong></label>;
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

function stringifyBible(bible: unknown): string {
  return bible ? JSON.stringify(bible, null, 2) : '';
}

/** Keys for content that already exists when resuming, so it shows instantly. */
function existingRevealKeys(story: StoryDetail): string[] {
  const keys = ['concept', 'bible', 'plan'];
  for (const chapter of story.storyPayload?.chapters ?? []) {
    keys.push(`chapter-${chapter.chapterNumber}`);
  }
  return keys;
}

function resultFromPayload(payload: StoryPayload): StoryResult {
  return {
    concept: [`Nhan đề: ${payload.title}`, `Tóm tắt một câu: ${payload.concept.logline}`, `Lời hứa thể loại: ${payload.concept.promise}`, `Xung đột: ${payload.concept.conflictEngine}`].join('\n'),
    plan: payload.chapterPlan.map((chapter) => [`${chapter.chapterNumber}. ${chapter.title}`, `Nhịp chính: ${chapter.mainBeat}`, `Móc câu: ${chapter.hook}`, `Kết chương: ${chapter.endingBeat}`].join('\n')).join('\n\n'),
    bible: payload.storyBible,
    relationshipGraph: normalizeRelationshipGraph(payload.relationshipGraph),
    chapters: payload.chapters.map((chapter) => ({ index: chapter.chapterNumber, title: chapter.title, content: chapter.text })),
  };
}

function buildMarkdown(title: string, result: StoryResult) {
  const parts = [`# ${title || 'Truyện chưa đặt tên'}`];
  if (result.concept) parts.push('## Ý tưởng', result.concept);
  if (result.plan) parts.push('## Dàn ý', result.plan);
  for (const chapter of result.chapters) parts.push(`## Chương ${chapter.index}: ${chapter.title || ''}`.trim(), chapter.content.trim());
  return `${parts.join('\n\n')}\n`;
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'novelkit-story';
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}p${s.toString().padStart(2, '0')}` : `${s}s`;
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
