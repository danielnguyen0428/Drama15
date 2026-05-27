import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiBaseUrl } from '../api/apiBase';
import { httpFetch } from '../api/httpClient';
import { clearAccessToken, getAccessToken } from '../auth/tokenStore';
import { computeDeviceFingerprint } from '../security/deviceFingerprint';
import { formatChapterText, formatChapterPlainText, formatConceptHtml, formatPlanHtml } from './formatChapterText';

interface StoryConfig {
  niche: string;
  customNiche: string;
  title: string;
  seed: string;
  outputLanguage: string;
  intensity: number;
  dialogueRatio: number;
  hookDensity: number;
  /**
   * Named writing-style preset (desktop parity). Loaded from
   * `GET /story/style-presets`. Server falls back to
   * `wharton_class_shame_elegance` when omitted, so legacy drafts
   * without this field continue to work.
   */
  stylePreset: string;
}

type Phase = 'idle' | 'suggesting' | 'creating' | 'streaming' | 'completed' | 'failed';

interface ChapterResult {
  index: number;
  content: string;
  title?: string;
}

interface StoryBible {
  heroine?: { name: string; wound?: string; strengths?: string[]; blindSpots?: string[] };
  betrayer?: { name: string; wound?: string; cowardiceVector?: string };
  rival?: { name: string; socialPower?: string; demeanor?: string };
  premise?: string;
  betrayalEngine?: string;
  classShameEngine?: string;
  revengeEngine?: string;
  [key: string]: unknown;
}

interface CharacterRelationship {
  from: string;
  to: string;
  label: string;
  type: 'love' | 'betrayal' | 'rivalry' | 'family' | 'ally' | 'neutral';
}

interface StoryResult {
  concept?: string;
  plan?: string;
  bible?: StoryBible;
  chapters: ChapterResult[];
}

interface AccountProfile {
  email?: string;
  name?: string;
  picture?: string;
}

interface DraftEntry {
  storyId: string;
  title: string;
  seed: string;
  niche: string;
  createdAt: string;
  updatedAt: string;
  phase: Phase;
  result: StoryResult;
  config: StoryConfig;
}

interface PublishedStory {
  id: string;
  title: string;
  chapters: number;
  niche?: string;
  author?: string;
  publishedAt: string;
  chaptersData?: Array<{ index: number; title?: string; content: string }>;
}


interface StreamEvent {
  stage?: 'overview' | 'bible' | 'plan' | 'chapter' | 'chapter_delta' | 'done' | 'error' | 'keepalive';
  concept?: string;
  plan?: string;
  chapterIndex?: number;
  title?: string;
  content?: string;
  /** For chapter_delta only: the incremental text fragment from the LLM. */
  delta?: string;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
}

const API_BASE = getApiBaseUrl();
const DRAFTS_KEY = 'drama15_drafts';
const PUBLISHED_SYNC_KEY = 'drama15_published_story_ids';

const NICHES = [
  { key: 'billionaire_rich_poor_romance', label: 'Tỷ phú / Tình yêu vượt giai cấp' },
  { key: 'humiliation_revenge_justice', label: 'Sỉ nhục / Trả đũa / Công lý' },
  { key: 'secret_identity_hidden_heiress', label: 'Thân phận bí mật / Thiên kim' },
  { key: 'toxic_family_betrayal', label: 'Gia đình độc hại / Phản bội' },
  { key: 'cheating_ex_wedding_drama', label: 'Ngoại tình / Drama cưới' },
  { key: 'single_mom_poor_woman_comeback', label: 'Mẹ đơn thân / Lật kèo' },
  { key: 'social_injustice_discrimination_drama', label: 'Bất công xã hội' },
  { key: 'workplace_ceo_power_struggle', label: 'Công sở / CEO / Tranh quyền' },
  { key: 'medical_hidden_doctor_life_care', label: 'Y tế / Bác sĩ ẩn danh' },
  { key: 'school_campus_bullying_identity', label: 'Học đường / Bắt nạt' },
  { key: 'werewolf_luna_alpha_soulmate', label: 'Werewolf / Alpha soulmate' },
  { key: 'steamy_alien_captive_romance', label: 'Steamy / Dark romance' },
];

const DEFAULT_CONFIG: StoryConfig = {
  niche: 'billionaire_rich_poor_romance',
  customNiche: '',
  title: '',
  seed: '',
  outputLanguage: 'vietnamese',
  intensity: 0.84,
  dialogueRatio: 0.56,
  hookDensity: 0.5,
  stylePreset: 'wharton_class_shame_elegance',
};

interface StylePresetSummary {
  id: string;
  displayName: string;
  description: string;
}

const toneMarks = [
  ['Cường độ', 'Xung đột rõ, nhịp nhanh', 'intensity'],
  ['Đối thoại', 'Cảnh nói chuyện có lực', 'dialogueRatio'],
  ['Hook', 'Móc câu cuối chương', 'hookDensity'],
] as const;

function readAccountProfile(): AccountProfile {
  try {
    const raw = sessionStorage.getItem('oauth_profile');
    return raw ? (JSON.parse(raw) as AccountProfile) : {};
  } catch {
    return {};
  }
}

function loadDrafts(): DraftEntry[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? (JSON.parse(raw) as DraftEntry[]) : [];
  } catch {
    return [];
  }
}

function saveDraft(draft: DraftEntry): void {
  try {
    const drafts = loadDrafts().filter((item) => item.storyId !== draft.storyId);
    drafts.unshift(draft);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, 30)));
  } catch {}
}

function removeDraft(storyId: string): void {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(loadDrafts().filter((item) => item.storyId !== storyId)));
  } catch {}
}

function loadPublishedSyncIds(): string[] {
  try {
    const raw = localStorage.getItem(PUBLISHED_SYNC_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function markPublishedSync(storyId: string): void {
  try {
    const ids = new Set(loadPublishedSyncIds());
    ids.add(storyId);
    localStorage.setItem(PUBLISHED_SYNC_KEY, JSON.stringify(Array.from(ids).slice(-200)));
  } catch {}
}



const DAILY_QUOTA_KEY = "drama15_daily_quota";
const MAX_STORIES_PER_DAY = 2;

interface DailyQuota {
  date: string;
  count: number;
}

function getDailyQuota(): DailyQuota {
  try {
    const raw = localStorage.getItem(DAILY_QUOTA_KEY);
    if (!raw) return { date: todayStr(), count: 0 };
    const q = JSON.parse(raw) as DailyQuota;
    if (q.date !== todayStr()) return { date: todayStr(), count: 0 };
    return q;
  } catch {
    return { date: todayStr(), count: 0 };
  }
}

function incrementDailyQuota(): void {
  const q = getDailyQuota();
  q.count += 1;
  q.date = todayStr();
  try { localStorage.setItem(DAILY_QUOTA_KEY, JSON.stringify(q)); } catch {}
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function canCreateStory(): { allowed: boolean; remaining: number } {
  const q = getDailyQuota();
  const remaining = Math.max(0, MAX_STORIES_PER_DAY - q.count);
  return { allowed: remaining > 0, remaining };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function StoryWorkspace(): JSX.Element {
  const [config, setConfig] = useState<StoryConfig>(DEFAULT_CONFIG);
  const [phase, setPhase] = useState<Phase>('idle');
  const [storyId, setStoryId] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Sẵn sàng vào phòng viết');
  const [result, setResult] = useState<StoryResult>({ chapters: [] });
  const [activeChapter, setActiveChapter] = useState(1);
  const [activeNav, setActiveNav] = useState<'chapters' | 'overview' | 'settings'>('chapters');
  const [chapterTab, setChapterTab] = useState<'overview' | 'summary' | 'content' | 'relationships'>('overview');
  const [error, setError] = useState<string | null>(null);
  const [rewriteMode, setRewriteMode] = useState('full_chapter');
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [accountProfile, setAccountProfile] = useState<AccountProfile>(readAccountProfile);
  const [drafts, setDrafts] = useState<DraftEntry[]>(loadDrafts);
  const [suggestResult, setSuggestResult] = useState<{ title: string; seed: string } | null>(null);
  const [stylePresets, setStylePresets] = useState<StylePresetSummary[]>([]);
  const [publishedStories, setPublishedStories] = useState<PublishedStory[]>([]);
  const [selectedPublishedStory, setSelectedPublishedStory] = useState<PublishedStory | null>(null);
  // Live partial chapter buffer driven by `chapter_delta` SSE events. The
  // chapter that is currently streaming has its accumulated text here; once
  // the final `chapter` event arrives we flush this into `result.chapters`.
  const [partialChapter, setPartialChapter] = useState<{ index: number; text: string } | null>(null);
  const [previewContent, setPreviewContent] = useState<{ stage: string; text: string } | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const syncProfile = (): void => setAccountProfile(readAccountProfile());
    window.addEventListener('storage', syncProfile);
    syncProfile();
    return () => window.removeEventListener('storage', syncProfile);
  }, []);

  // Load style preset list once on mount. Falls back silently on failure
  // so the form still works (server will use its hard-coded default).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await httpFetch(`${API_BASE}/story/style-presets`);
        if (!response.ok) return;
        const data = (await response.json()) as { presets?: StylePresetSummary[] };
        if (cancelled) return;
        if (Array.isArray(data.presets) && data.presets.length > 0) {
          setStylePresets(data.presets);
        }
      } catch {
        // Network/server error — fall back to a single hard-coded option below.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch published stories from server (public shelf)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await httpFetch(`${API_BASE}/published-stories`);
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { stories?: PublishedStory[] };
        if (!cancelled && Array.isArray(data.stories)) {
          setPublishedStories(data.stories);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Backfill chaptersData for published stories missing content (from local completed drafts)
  useEffect(() => {
    if (publishedStories.length === 0) return;
    const localDrafts = loadDrafts().filter((d) => d.result.chapters.length >= 10);
    console.log('[backfill] publishedStories:', publishedStories.length, 'localDrafts completed:', localDrafts.length);
    if (localDrafts.length === 0) {
      console.log('[backfill] No completed local drafts found. All drafts:', loadDrafts().map((d) => ({ title: d.title, phase: d.phase, chapters: d.result.chapters.length })));
      return;
    }
    void (async () => {
      for (const serverStory of publishedStories) {
        if (serverStory.chaptersData && serverStory.chaptersData.length > 0) continue;
        console.log('[backfill] Server story missing content:', serverStory.title);
        const missingServerStories = publishedStories.filter((s) => !s.chaptersData || s.chaptersData.length === 0);
        const match = localDrafts.find((d) => { const dt = (d.title || d.config.title || '').trim().toLowerCase(); const st = serverStory.title.trim().toLowerCase(); return dt === st || dt.includes(st.slice(0, 20)) || st.includes(dt.slice(0, 20)); }) || (missingServerStories.length === 1 && localDrafts.length === 1 ? localDrafts[0] : undefined);
        if (!match) { console.log('[backfill] No local match found for:', serverStory.title); continue; }
        console.log('[backfill] Match found! Patching:', match.title || match.config.title, '->', match.result.chapters.length, 'chapters');
        try {
          await httpFetch(`${API_BASE}/published-stories/${serverStory.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chapters: match.result.chapters.length,
              chaptersData: match.result.chapters.map((c) => ({ index: c.index, title: c.title, content: c.content })),
            }),
          });
        } catch {}
      }
      // Refresh shelf after backfill
      try {
        const refresh = await httpFetch(`${API_BASE}/published-stories`);
        if (refresh.ok) {
          const data = (await refresh.json()) as { stories?: PublishedStory[] };
          if (Array.isArray(data.stories)) setPublishedStories(data.stories);
        }
      } catch {}
    })();
  }, [publishedStories.length]);

  // Auto-publish completed story to server
  useEffect(() => {
    if (phase !== 'completed' || !storyId) return;
    const synced = loadPublishedSyncIds();
    if (synced.includes(storyId)) return;
    void (async () => {
      try {
        const response = await httpFetch(`${API_BASE}/published-stories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: storyTitle || config.title || 'Untitled',
            chapters: result.chapters.length,
            niche: config.niche,
            chaptersData: result.chapters.map((c) => ({ index: c.index, title: c.title, content: c.content })),
            author: accountProfile.name || accountProfile.email || 'Anonymous',
          }),
        });
        if (response.ok) {
          markPublishedSync(storyId);
          // Refresh shelf
          const refresh = await httpFetch(`${API_BASE}/published-stories`);
          if (refresh.ok) {
            const data = (await refresh.json()) as { stories?: PublishedStory[] };
            if (Array.isArray(data.stories)) setPublishedStories(data.stories);
          }
        }
      } catch {}
    })();
  }, [phase, storyId]);

  useEffect(() => {
    if (!storyId) return;
    saveDraft({
      storyId,
      title: storyTitle || config.title || 'Bản thảo mới',
      seed: config.seed,
      niche: config.niche,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phase,
      result,
      config,
    });
    setDrafts(loadDrafts());
  }, [storyId, storyTitle, phase, result, config]);

  const activeChapterData = useMemo(
    () => result.chapters.find((chapter) => chapter.index === activeChapter),
    [activeChapter, result.chapters],
  );

  const manuscriptText = useMemo(() => {
    const header = storyTitle || config.title || 'Bản thảo mới';
    const chapters = result.chapters
      .map((chapter) => `## Chương ${chapter.index}: ${chapter.title ?? 'Chưa đặt tên'}\n\n${formatChapterPlainText(chapter.content)}`)
      .join('\n\n');
    return `# ${header}\n\n${result.concept ? `## Tổng quan\n\n${result.concept}\n\n` : ''}${result.plan ? `## Kế hoạch\n\n${result.plan}\n\n` : ''}${chapters}`;
  }, [config.title, result.chapters, result.concept, result.plan, storyTitle]);

  const totalWords = useMemo(() => wordCount(manuscriptText), [manuscriptText]);
  const isBusy = phase === 'suggesting' || phase === 'creating' || phase === 'streaming';
  const accountName = accountProfile.name ?? accountProfile.email ?? 'Account';
  const avatarInitial = accountName.trim().charAt(0).toUpperCase() || 'A';

  const updateConfig = <K extends keyof StoryConfig>(key: K, value: StoryConfig[K]): void => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const handleSuggest = async (): Promise<void> => {
    setPhase('suggesting');
    setError(null);
    setSuggestResult(null);
    setPreviewContent(null);
    setActiveNav('chapters');
    setChapterTab('overview');
    setProgressLabel('Đang tạo gợi ý cốt truyện');

    try {
      const body: Record<string, unknown> = { outputLanguage: config.outputLanguage };
      if (config.niche === '__custom__') body.customNiche = config.customNiche;
      else body.niche = config.niche;
      if (config.seed) body.seed = config.seed;

      const response = await httpFetch(`${API_BASE}/story/setup-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setError('Không thể tạo gợi ý. Kiểm tra kết nối API rồi thử lại.');
        return;
      }

      const data = (await response.json()) as Partial<Pick<StoryConfig, 'title' | 'seed'>>;
      setConfig((current) => ({ ...current, title: data.title ?? current.title, seed: data.seed ?? current.seed }));
      setSuggestResult({ title: data.title ?? config.title, seed: data.seed ?? config.seed });
      setProgressLabel('Đã nạp gợi ý cốt truyện');
    } catch {
      setError('Kiểm tra kết nối API rồi thử lại.');
    } finally {
      setPhase('idle');
    }
  };

  const handleCreate = async (): Promise<void> => {
    if (activeDraft && activeDraft.storyId !== storyId) {
      setError(`Bạn đang có bộ truyện chưa hoàn thành: "${activeDraft.title}". Hoàn thành hoặc xóa nó trước.`);
      return;
    }
    const quota = canCreateStory();
    if (!quota.allowed) {
      setError(`Đã đạt giới hạn ${MAX_STORIES_PER_DAY} bộ/ngày. Quay lại vào ngày mai hoặc nâng cấp tài khoản.`);
      return;
    }
    setSuggestResult(null);
    setPhase('creating');
    setError(null);
    setProgress(4);
    setProgressLabel('Đang dựng phòng biên kịch');
    setResult({ chapters: [] });
    setStoryTitle(config.title || 'Bản thảo mới');
    setShowSetup(false);
    setActiveNav('chapters');
    setChapterTab('overview');

    try {
      const fingerprint = await computeDeviceFingerprint();
      const response = await httpFetch(`${API_BASE}/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Fingerprint': fingerprint,
        },
        body: JSON.stringify({
          mode: 'full',
          config: {
            niche: config.niche === '__custom__' ? undefined : config.niche,
            customNiche: config.niche === '__custom__' ? config.customNiche : undefined,
            title: config.title,
            seed: config.seed,
            outputLanguage: config.outputLanguage,
            intensity: config.intensity,
            dialogueRatio: config.dialogueRatio,
            hookDensity: config.hookDensity,
            stylePreset: config.stylePreset,
          },
        }),
      });

      if (!response.ok) {
        // Decode the gateway error envelope so the user sees the
        // actual reason (rate limit, daily quota, validation error,
        // upstream down) instead of a generic message.
        let serverMessage = '';
        let serverCode = '';
        try {
          const errBody = (await response.clone().json()) as {
            error?: { code?: string; message?: string; retryAfterSeconds?: number };
          };
          serverCode = errBody.error?.code ?? '';
          serverMessage = errBody.error?.message ?? '';
        } catch {
          /* non-JSON response */
        }

        if (response.status === 429) {
          if (serverCode === 'rate_limited') {
            const retry = response.headers.get('Retry-After');
            setError(
              retry
                ? `Bạn vừa tạo quá nhiều truyện. Thử lại sau ~${retry}s.`
                : 'Bạn vừa tạo quá nhiều truyện. Vui lòng đợi ít phút.',
            );
          } else if (serverCode === 'daily_quota_exhausted' || /quota/i.test(serverMessage)) {
            setError(
              'Bạn đã đạt giới hạn truyện/ngày. Quota sẽ được reset lúc nửa đêm UTC.',
            );
          } else {
            setError('Đã chạm giới hạn truyện. Vui lòng thử lại sau ít phút.');
          }
        } else if (response.status === 401) {
          setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        } else if (response.status === 403) {
          setError('Tài khoản chưa được cấp quyền tạo truyện.');
        } else if (response.status === 400) {
          setError(serverMessage || 'Cấu hình truyện không hợp lệ. Kiểm tra lại các trường.');
        } else if (response.status >= 500) {
          setError('Máy chủ đang gặp sự cố. Vui lòng thử lại sau ít phút.');
        } else {
          setError(serverMessage || 'Không thể tạo truyện. Kiểm tra cấu hình rồi thử lại.');
        }
        setPhase('failed');
        return;
      }

      const data = (await response.json()) as { id?: string; storyId?: string; title?: string };
      const nextStoryId = data.id ?? data.storyId;
      if (!nextStoryId) {
        setError('Máy chủ chưa trả về mã truyện.');
        setPhase('failed');
        return;
      }

      setStoryId(nextStoryId);
      setStoryTitle(data.title ?? config.title ?? 'Bản thảo mới');
      incrementDailyQuota();
      startStream(nextStoryId);
    } catch {
      setError('Kiểm tra kết nối API rồi thử lại.');
      setPhase('failed');
    }
  };

  const startStream = (nextStoryId: string, retryCount = 0): void => {
    // Abort any previous stream
    if ((streamRef.current as any)?.__abort) {
      (streamRef.current as any).__abort.abort();
    }
    const abortController = new AbortController();
    streamRef.current = { close: () => abortController.abort(), __abort: abortController } as any;
    setPhase('streaming');
    setProgressLabel('AI đang viết từng nhịp truyện');

    // We track every event we have already processed in this tab so a
    // reconnect can skip the replay frames the server emits and avoid
    // double-rendering chapters or duplicating delta text. The server
    // caches the SSE frames it has produced so far and replays them
    // verbatim on reconnect, so a frame counter is enough.
    let processedEventCount = 0;

    const processEvent = (event: StreamEvent): void => {
      if (event.stage === 'keepalive') return;
      if (event.stage === 'overview' && event.concept) {
        setResult((current) => ({ ...current, concept: event.concept }));
        setPreviewContent({ stage: 'overview', text: event.concept ?? '' });
        setProgress(12);
        setProgressLabel('Đã dựng tổng quan');
      }
      if (event.stage === 'bible') {
        if (event.content) setPreviewContent({ stage: 'bible', text: event.content });
        setProgress(18);
        setProgressLabel('Đã dựng story bible');
        if (event.content) {
          try {
            const bibleData = JSON.parse(event.content) as StoryBible;
            setResult((current) => ({ ...current, bible: bibleData }));
          } catch { /* skip */ }
        }
      }
      if (event.stage === 'plan' && event.plan) {
        setResult((current) => ({ ...current, plan: event.plan }));
        setPreviewContent({ stage: 'plan', text: event.plan ?? '' });
        setProgress(22);
        setProgressLabel('Đã khóa beat sheet');
      }
      if (event.stage === 'chapter_delta' && typeof event.chapterIndex === 'number' && event.delta) {
        const incomingIndex = event.chapterIndex;
        const incomingDelta = event.delta;
        setPartialChapter((current) => {
          if (!current || current.index !== incomingIndex) {
            return { index: incomingIndex, text: incomingDelta };
          }
          return { index: current.index, text: current.text + incomingDelta };
        });
        setActiveChapter(incomingIndex);
        setProgressLabel(`Đang viết chương ${incomingIndex}…`);
      }
      if (event.stage === 'chapter' && event.chapterIndex && event.content) {
        setPreviewContent(null);
        setResult((current) => {
          const chapter: ChapterResult = { index: event.chapterIndex ?? current.chapters.length + 1, title: event.title, content: event.content ?? '' };
          const withoutDuplicate = current.chapters.filter((item) => item.index !== chapter.index);
          return { ...current, chapters: [...withoutDuplicate, chapter].sort((a, b) => a.index - b.index) };
        });
        setPartialChapter((current) => (current && current.index === event.chapterIndex ? null : current));
        setActiveChapter(event.chapterIndex);
        setProgress(Math.min(98, 22 + event.chapterIndex * 7));
        setProgressLabel(`Đã hoàn thành chương ${event.chapterIndex}`);
      }
      if (event.stage === 'done') {
        setPhase('completed');
        setProgress(100);
        setProgressLabel('Bản thảo đã sẵn sàng biên tập');
        setPartialChapter(null);
      }
      if (event.stage === 'error') {
        if (event.code === 'upstream_unavailable') {
          const wait = event.retryAfterSeconds ?? 30;
          setError(`AI server đang quá tải. Thử lại sau ~${wait}s.`);
        } else {
          setError(event.error ?? 'Luồng sáng tác bị gián đoạn.');
        }
        setPhase('failed');
        setPartialChapter(null);
      }
    };

    (async () => {
      // Retry policy: 8 attempts, exponential backoff capped at 15s.
      // The pipeline can take 10-30 minutes; a 3-attempt budget capped at
      // 10s only covers ~14s of network instability which is too tight
      // for a real outage (Cloudflare edge restart, ISP blip, etc.).
      const MAX_RETRY = 8;
      const RETRY_CAP_MS = 15_000;
      try {
        const token = getAccessToken();
        const fingerprint = await computeDeviceFingerprint();
        const response = await fetch(`${API_BASE}/stories/${nextStoryId}/stream`, {
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            'X-Device-Fingerprint': fingerprint,
            // NOTE: Do NOT add `Cache-Control: no-cache` here. Browsers
            // treat it as a non-simple request header and trigger a CORS
            // preflight that lists `cache-control` in
            // `Access-Control-Request-Headers`. The gateway's CORS
            // allow-list only includes `authorization, content-type,
            // x-client-integrity, x-device-fingerprint, x-request-id`,
            // so the preflight succeeds (204) but the actual GET is
            // blocked by the browser, producing a phantom "stream
            // ended without `done` event" → infinite reconnect loop.
            // The server already sets `Cache-Control: no-store,
            // no-transform` on the SSE response, which Cloudflare and
            // every browser cache honours; we don't need a request-side
            // hint.
          },
          signal: abortController.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`stream response ${response.status}`);
        }
        // Reset retry counter once we successfully get a response — this
        // lets a transient blip mid-stream reset the backoff window so a
        // long pipeline isn't killed by counting cumulative retries.
        retryCount = 0;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // Track how many "data:" frames we have seen on THIS connection.
        // The server replays cached frames first on reconnect, so the
        // first `replayCount` frames after a retry are duplicates we must
        // skip.
        const replayCount = processedEventCount;
        let frameSeenThisConnection = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            // SSE comment frames (`:` keepalive) — ignore.
            if (line.startsWith(':')) continue;
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as StreamEvent;
                if (event.stage === 'keepalive') continue;
                frameSeenThisConnection += 1;
                // Skip frames we have already processed in a previous
                // connection. The server replays from frame 0; we resume
                // from where we left off.
                if (frameSeenThisConnection <= replayCount) continue;
                processEvent(event);
                processedEventCount += 1;
                if (event.stage === 'done' || event.stage === 'error') return;
              } catch { /* skip malformed */ }
            }
          }
        }
        // Stream ended without `done` event — the connection dropped
        // mid-pipeline. Reconnect and pick up where we left off; the
        // server replays the cache from frame 0 and our `replayCount`
        // skip logic dedups.
        if (retryCount < MAX_RETRY) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), RETRY_CAP_MS);
          setProgressLabel(`Đang nối lại stream (${retryCount + 1}/${MAX_RETRY})…`);
          setTimeout(() => startStream(nextStoryId, retryCount + 1), delay);
        } else {
          setError('Mất kết nối stream sau nhiều lần thử. Vui lòng tạo lại.');
          setPhase('failed');
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        if (retryCount < MAX_RETRY) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), RETRY_CAP_MS);
          setProgressLabel(`Đang nối lại stream (${retryCount + 1}/${MAX_RETRY})…`);
          setTimeout(() => startStream(nextStoryId, retryCount + 1), delay);
        } else {
          setError('Mất kết nối stream sau nhiều lần thử. Vui lòng tạo lại.');
          setPhase('failed');
        }
      }
    })();
  };

  const handleRewrite = async (): Promise<void> => {
    if (!storyId || !activeChapterData) {
      setError('Chọn một chương trước khi viết lại.');
      return;
    }
    setRewriteBusy(true);
    setError(null);
    try {
      const response = await httpFetch(`${API_BASE}/stories/${storyId}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterIndex: activeChapter, mode: rewriteMode, instruction: rewriteInstruction, content: activeChapterData.content }),
      });
      if (!response.ok) {
        setError('Không thể viết lại chương này.');
        return;
      }
      const data = (await response.json()) as { content?: string; title?: string };
      setResult((current) => ({
        ...current,
        chapters: current.chapters.map((chapter) =>
          chapter.index === activeChapter ? { ...chapter, content: data.content ?? chapter.content, title: data.title ?? chapter.title } : chapter,
        ),
      }));
      setRewriteInstruction('');
      setProgressLabel(`Đã chỉnh chương ${activeChapter}`);
    } catch {
      setError('Không thể kết nối máy chủ khi viết lại.');
    } finally {
      setRewriteBusy(false);
    }
  };

  const exportMd = (): void => download(`${storyTitle || 'ban-thao'}.md`, manuscriptText, 'text/markdown;charset=utf-8');

  /**
   * Export the persisted story content as PDF via the backend pipeline
   * (`POST /stories/:id/export/pdf`). The server renders chapters + overview
   * with the Vietnamese-compatible Noto Serif font and returns a signed URL
   * (TTL ≤ 60 minutes, Requirement 11.2). The browser then opens that URL.
   *
   * This intentionally does NOT call `window.print()` — that would dump the
   * UI chrome (sidebar, buttons, headers) into the PDF instead of the actual
   * story content.
   */
  const exportPdf = async (): Promise<void> => {
    if (!storyId) {
      setError('Hãy lưu truyện trước khi xuất PDF.');
      return;
    }
    if (pdfExporting) return;
    setPdfExporting(true);
    setError(null);
    try {
      const response = await httpFetch(`${API_BASE}/stories/${encodeURIComponent(storyId)}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        let message = 'Không thể xuất PDF. Vui lòng thử lại.';
        try {
          const body = (await response.json()) as { error?: { message?: string } };
          if (body.error?.message) message = body.error.message;
        } catch {
          // response was not JSON; keep the fallback message
        }
        setError(message);
        return;
      }
      const data = (await response.json()) as { url?: string };
      if (!data.url) {
        setError('Máy chủ chưa trả về liên kết tải PDF.');
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Không thể kết nối máy chủ khi xuất PDF.');
    } finally {
      setPdfExporting(false);
    }
  };

  const handleLogout = (): void => {
    clearAccessToken();
    try { sessionStorage.removeItem('oauth_profile'); } catch {}
    window.location.reload();
  };

  const quotaStatus = canCreateStory();
  const activeDraft = drafts.find((d) => d.phase === 'streaming' || d.phase === 'creating');


  const handleResume = (draft: DraftEntry): void => {
    loadDraft(draft);
    // Re-trigger stream from server using existing storyId
    setPhase('creating');
    setProgress(22 + draft.result.chapters.length * 7);
    setProgressLabel(`Tiếp tục từ chương ${draft.result.chapters.length + 1}`);
    startStream(draft.storyId);
  };

  const loadDraft = (draft: DraftEntry): void => {
    setStoryId(draft.storyId);
    setStoryTitle(draft.title);
    setConfig(draft.config);
    setResult(draft.result);
    setPhase(draft.phase === 'creating' || draft.phase === 'streaming' ? 'streaming' : draft.phase);
    setActiveNav('chapters');
    setShowSetup(false);
    setSuggestResult(null);
    setActiveChapter(draft.result.chapters[0]?.index ?? 1);
  };

  return (
    <main className="studio-shell">
      <nav className="studio-nav" aria-label="Điều hướng studio">
        <button type="button" className="brand-lockup" onClick={() => setShowSetup(true)}>
          <span>Drama15</span>
          <small>Novel Studio</small>
        </button>
        <div className="nav-actions">
          <a href="https://novelkit.cc" target="_blank" rel="noopener noreferrer" className="nav-ext-link">NovelKit.cc</a>
          <a href="https://www.facebook.com/novelkit" target="_blank" rel="noopener noreferrer" className="nav-ext-link">Fanpage</a>
          <a href="https://t.me/novelkit_zone" target="_blank" rel="noopener noreferrer" className="nav-ext-link">Telegram</a>
        </div>
        <button type="button" className="account-button" onClick={() => setAccountOpen(true)}>
          {accountProfile.picture ? <img src={accountProfile.picture} alt="" /> : <span className="avatar-fallback">{avatarInitial}</span>}
          <span>{accountName}</span>
        </button>
      </nav>

      <section className="hero-band">
        <div>
          <div className="support-strip" aria-label="Cộng đồng NovelKit">
            <button type="button" className="support-card" onClick={() => setDonateOpen(true)}>
              <svg className="support-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              <strong>Cúng dường</strong>
              <span>Web mở xài chùa, hãy thương AD đô nách cho AD không là server sập</span>
            </button>
            <a className="support-card" href="https://t.me/novelkit_zone" target="_blank" rel="noreferrer">
              <svg className="support-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></svg>
              <strong>Tham gia Nhóm Chat</strong>
              <span>Giao lưu & chém gió cùng các sếp</span>
            </a>
            <button type="button" className="support-card" onClick={() => { setShowSetup(true); setSuggestResult(null); setConfig(DEFAULT_CONFIG); setStoryId(null); setResult({ chapters: [] }); setPhase('idle'); setProgress(0); setProgressLabel('Sẵn sàng vào phòng viết'); setStoryTitle(''); setActiveNav('chapters'); }}>
              <svg className="support-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
              <strong>Tạo truyện mới</strong>
              <span>Còn {quotaStatus.remaining}/{MAX_STORIES_PER_DAY} bộ hôm nay</span>
            </button>
          </div>
          <p className="eyebrow">Drama15 Lite Studio</p>
          <h1>Studio sáng tác Drama ngắn chuẩn xuất bản</h1>
        </div>
      {publishedStories.length > 0 && (
        <div className="completed-shelf">
          <h3 className="shelf-heading">Đã xuất bản</h3>
          <div className="shelf-grid">
            {publishedStories.slice(0, 6).map((story) => (
              <button key={story.id} type="button" className="shelf-card" onClick={() => setSelectedPublishedStory(story)}>
                <div className="shelf-thumb" aria-hidden="true">
                  <svg viewBox="0 0 40 60" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="60" rx="4" fill="#2a1f18"/><rect x="6" y="8" width="28" height="3" rx="1.5" fill="#f4d29e" opacity=".6"/><rect x="6" y="14" width="20" height="2" rx="1" fill="#f4d29e" opacity=".3"/><rect x="6" y="19" width="24" height="2" rx="1" fill="#f4d29e" opacity=".2"/><path d="M8 40l8-6 8 6 8-10" stroke="#f4d29e" strokeWidth="1.5" opacity=".3" fill="none"/></svg>
                </div>
                <div className="shelf-info">
                  <strong>{story.title}</strong>
                  <span>{story.author}</span>
                  <small>{story.chapters} chương • {new Date(story.publishedAt).toLocaleDateString('vi-VN')}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
        <div className="hero-card">
          <span>Tiến độ</span>
          <strong>{progress}%</strong>
          <p>{progressLabel}</p>
        </div>
      </section>


      <section className="studio-grid">
        <aside className={`briefing-panel${showSetup ? '' : ' is-collapsed'}${phase === 'suggesting' ? ' is-disabled' : ''}`} aria-label="Briefing sáng tác">
          <div className="panel-heading">
            <span>Creative Brief</span>
            <button type="button" className="suggest-btn-ai" onClick={() => void handleSuggest()} disabled={isBusy}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>{phase === 'suggesting' ? 'AI đang tạo gợi ý…' : 'AI Gợi ý'}</button>
          </div>
          {showSetup ? (
            <form className="brief-form" onSubmit={(event) => { event.preventDefault(); void handleCreate(); }}>
              <label>Dòng truyện
                <select value={config.niche} onChange={(event) => updateConfig('niche', event.target.value)} disabled={isBusy}>
                  {NICHES.map((niche) => <option key={niche.key} value={niche.key}>{niche.label}</option>)}
                  <option value="__custom__">Concept riêng</option>
                </select>
              </label>
              {config.niche === '__custom__' && <label>Concept riêng<textarea value={config.customNiche} onChange={(event) => updateConfig('customNiche', event.target.value)} disabled={isBusy} /></label>}
              <label>Tựa truyện<input value={config.title} onChange={(event) => updateConfig('title', event.target.value)} placeholder="VD: Cô vợ nghèo ở bàn VIP" disabled={isBusy} /></label>
              <label>Seed cảm xúc<textarea value={config.seed} onChange={(event) => updateConfig('seed', event.target.value)} placeholder="Nhân vật, cú nhục, bí mật, cú lật..." disabled={isBusy} /></label>
              <label>Phong cách viết
                <select
                  value={config.stylePreset}
                  onChange={(event) => updateConfig('stylePreset', event.target.value)}
                  disabled={isBusy}
                >
                  {(stylePresets.length > 0
                    ? stylePresets
                    : [{ id: 'wharton_class_shame_elegance', displayName: 'Wharton — Sỉ nhục giai cấp tinh tế', description: '' }]
                  ).map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.displayName}</option>
                  ))}
                </select>
                <span className="style-preset-hint">
                  {stylePresets.find((preset) => preset.id === config.stylePreset)?.description ?? ''}
                </span>
              </label>
              <div className="tone-grid">
                {toneMarks.map(([title, caption, key]) => (
                  <label key={key}>{title}<span>{caption}</span><input type="range" min="0" max="1" step="0.01" value={config[key]} disabled={isBusy} onChange={(event) => updateConfig(key, Number(event.target.value))} /></label>
                ))}
              </div>
              <div className="action-row">

                <button type="submit" className="primary-button full" disabled={isBusy || !config.seed.trim() || !config.title.trim()}>{phase === 'creating' || phase === 'streaming' ? 'Đang sáng tác' : 'Bắt đầu viết'}</button>
              </div>
            </form>
          ) : (
            <div className="brief-collapsed">
              <p className="collapsed-label">Brief đã thu gọn</p>
              <h2>{storyTitle || config.title || 'Bản thảo mới'}</h2>
              <dl>
                <div><dt>Dòng truyện</dt><dd>{NICHES.find((niche) => niche.key === config.niche)?.label ?? (config.customNiche || 'Concept riêng')}</dd></div>
                <div><dt>Seed</dt><dd>{config.seed || 'Chưa thêm seed cảm xúc'}</dd></div>
                <div><dt>Trạng thái</dt><dd>{progressLabel}</dd></div>
              </dl>

            </div>
          )}
          {error && <p className="studio-error" role="alert">{error}</p>}
        </aside>

        <section className="manuscript-panel" aria-label="Bản thảo">
          {activeNav === 'overview' && (
            <article className="document-page">
              <p className="document-kicker">Tổng quan truyện</p>
              <h2>{storyTitle || config.title || 'Chưa có tựa truyện'}</h2>
              {result.concept ? <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatConceptHtml(result.concept) }} /> : <div className="empty-state"><strong>Chưa có tổng quan.</strong><span>Tổng quan sẽ xuất hiện sau khi AI dựng concept.</span></div>}
              <h3>Kế hoạch chương</h3>
              {result.plan ? <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatPlanHtml(result.plan) }} /> : <div className="empty-state"><strong>Chưa có kế hoạch.</strong><span>Beat sheet sẽ xuất hiện sau bước lập kế hoạch.</span></div>}
            </article>
          )}

          {activeNav === 'settings' && (
            <article className="document-page">
              <p className="document-kicker">Thông số phòng viết</p>
              <h2>Điều khiển nhịp truyện</h2>
              <div className="settings-grid">
                {toneMarks.map(([title, caption, key]) => <div key={key}><span>{title}</span><strong>{Math.round(config[key] * 100)}%</strong><p>{caption}</p></div>)}
              </div>
            </article>
          )}

          {activeNav === 'chapters' && (
            <article className="document-page">
              {suggestResult && !storyId && !isBusy && (
                <div className="suggest-result">
                  <p className="document-kicker">Gợi ý cốt truyện</p>
                  <h2>{suggestResult.title || config.title || 'Chưa có tựa'}</h2>
                  <div className="seed-block"><span className="seed-label">Seed cảm xúc</span><p>{suggestResult.seed || config.seed}</p></div>
                  <button type="button" className="primary-button start-cta" onClick={() => void handleCreate()} disabled={isBusy}>Bắt đầu viết</button>
                </div>
              )}
              {phase === 'suggesting' && <Generating title="Đang tạo gợi ý…" text="AI đang phân tích niche và tạo seed cảm xúc" />}
              {(phase === 'creating' || phase === 'streaming') && (
                <div className="gen-progress" aria-live="polite">
                  <div className="gen-progress-header"><span className="writing-spinner" aria-hidden="true" /><strong>Đang viết truyện…</strong><span className="gen-progress-label">{progressLabel}</span></div>
                  <div className="gen-timeline">
                    <TimelinePhase label="Setup" steps={['Phòng biên kịch', 'Tổng quan', 'Bible', 'Beat sheet']} currentStep={progress < 12 ? 0 : progress < 18 ? 1 : progress < 22 ? 2 : result.chapters.length === 0 ? 3 : 4} />
                    <TimelinePhase label={`Chương (${result.chapters.length}/10)`} steps={Array.from({ length: 10 }, (_, i) => `Ch.${i + 1}`)} currentStep={result.chapters.length > 0 ? result.chapters.length : -1} />
                  </div>
                </div>
              )}
              {(phase === 'creating' || phase === 'streaming') && (
                <nav className="chapter-tabs" aria-label="Xem ná»™i dung">
                  <button type="button" className={chapterTab === 'overview' ? 'active' : ''} onClick={() => setChapterTab('overview')}>Tổng quan</button>
                  <button type="button" className={chapterTab === 'summary' ? 'active' : ''} onClick={() => setChapterTab('summary')}>Kế hoạch</button>
                  <button type="button" className={chapterTab === 'content' ? 'active' : ''} onClick={() => setChapterTab('content')}>Bản thảo</button>
                </nav>
              )}
              {(phase === 'creating' || phase === 'streaming') && chapterTab === 'overview' && (
                <div className="gen-preview">
                  {result.concept ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatConceptHtml(result.concept) }} />
                  ) : previewContent?.stage === 'overview' ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatConceptHtml(previewContent.text) }} />
                  ) : (
                    <div className="empty-state"><strong>Đang dựng tổng quan…</strong><span>Nội dung sẽ xuất hiện khi AI hoàn thành bước này.</span></div>
                  )}
                </div>
              )}
              {(phase === 'creating' || phase === 'streaming') && chapterTab === 'summary' && (
                <div className="gen-preview">
                  {result.plan ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatPlanHtml(result.plan) }} />
                  ) : previewContent?.stage === 'plan' ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatPlanHtml(previewContent.text) }} />
                  ) : (
                    <div className="empty-state"><strong>Đang dựng kế hoạch…</strong><span>Beat sheet sẽ xuất hiện sau khi AI hoàn thành tổng quan.</span></div>
                  )}
                </div>
              )}
              {(phase === 'creating' || phase === 'streaming') && chapterTab === 'content' && (
                <div className="gen-preview">
                  {result.chapters.length > 0 && (
                    <div className="stream-chapter-list" aria-label="Chương đã viết">
                      {result.chapters.map((chapter) => (
                        <button
                          key={chapter.index}
                          type="button"
                          className={chapter.index === activeChapter ? 'active' : ''}
                          onClick={() => setActiveChapter(chapter.index)}
                        >
                          <span>Chương {chapter.index}</span>
                          <small>{chapter.title ?? 'Đã xong'}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  {partialChapter && partialChapter.index === activeChapter ? (
                    <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />Đang viết chương {partialChapter.index}…</div><div className="prose-block prose-block-streaming" dangerouslySetInnerHTML={{ __html: formatChapterText(partialChapter.text) }} /></>
                  ) : activeChapterData ? (
                    <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />Chương {activeChapter} đã xong</div><div className="prose-block" dangerouslySetInnerHTML={{ __html: formatChapterText(activeChapterData.content) }} /></>
                  ) : partialChapter ? (
                    <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />Đang viết chương {partialChapter.index}…</div><div className="prose-block prose-block-streaming" dangerouslySetInnerHTML={{ __html: formatChapterText(partialChapter.text) }} /></>
                  ) : (
                    <div className="empty-state"><strong>Đang chuẩn bị viết chương…</strong><span>Bản thảo sẽ xuất hiện khi AI bắt đầu viết chương đầu tiên.</span></div>
                  )}
                </div>
              )}
              {phase !== 'suggesting' && phase !== 'creating' && phase !== 'streaming' && !suggestResult && result.chapters.length > 0 && (
                <>
                  <nav className="chapter-tabs" aria-label="Chế độ xem chương">
                    <button type="button" className={chapterTab === 'overview' ? 'active' : ''} onClick={() => setChapterTab('overview')}>Tổng quan</button>
                    <button type="button" className={chapterTab === 'summary' ? 'active' : ''} onClick={() => setChapterTab('summary')}>Tóm tắt</button>
                    <button type="button" className={chapterTab === 'content' ? 'active' : ''} onClick={() => setChapterTab('content')}>Ná»™i dung</button>
                    <button type="button" className={chapterTab === 'relationships' ? 'active' : ''} onClick={() => setChapterTab('relationships')}>Quan hệ</button>
                  </nav>
                  {chapterTab === 'overview' && <ChapterOverviewTab concept={result.concept} plan={result.plan} storyTitle={storyTitle} configTitle={config.title} totalChapters={result.chapters.length} />}
                  {chapterTab === 'summary' && <ChapterSummaryTab chapters={result.chapters} activeChapter={activeChapter} onSelectChapter={(idx) => { setActiveChapter(idx); setChapterTab('content'); }} />}
                  {chapterTab === 'content' && <ManuscriptContent activeChapterData={activeChapterData} storyTitle={storyTitle} configTitle={config.title} activeDraft={!storyId ? activeDraft : undefined} onResume={handleResume} />}
                  {chapterTab === 'relationships' && <CharacterRelationshipsTab bible={result.bible} />}
                </>
              )}
              {phase !== 'suggesting' && phase !== 'creating' && phase !== 'streaming' && !suggestResult && result.chapters.length === 0 && <ManuscriptContent activeChapterData={activeChapterData} storyTitle={storyTitle} configTitle={config.title} activeDraft={!storyId ? activeDraft : undefined} onResume={handleResume} />}
            </article>
          )}
        </section>

        <aside className="history-panel" aria-label="Lịch sử truyện">
          <div className="hero-stats sidebar-stats" aria-label="Thống kê bản thảo">
            <div><strong>{result.chapters.length}</strong><span>Chương</span></div>
            <div><strong>{totalWords.toLocaleString('vi-VN')}</strong><span>Từ</span></div>
            <div><strong>{storyId ? 'Live' : 'Draft'}</strong><span>Phiên</span></div>
          </div>
          <div className="panel-heading"><span>Thư viện</span><strong>Đang viết / Đã viết</strong></div>
          {drafts.length === 0 ? <div className="history-empty"><span>Chưa có truyện nào.</span><small>Truyện sẽ xuất hiện ở đây sau khi bắt đầu viết.</small></div> : (
            <ul className="history-list">
              {drafts.map((draft) => (
                <li key={draft.storyId} className={`history-item${draft.storyId === storyId ? ' active' : ''}`}>
                  <button type="button" className="history-item-btn" onClick={() => loadDraft(draft)}><span className="history-title">{draft.title}</span><span className="history-meta">{draft.result.chapters.length} chương • {draft.phase === 'completed' ? 'Xong' : draft.phase === 'failed' ? 'Lỗi' : 'Đang viết'}</span></button>
                  <button type="button" className="history-delete" aria-label="Xóa" onClick={() => { removeDraft(draft.storyId); setDrafts(loadDrafts()); }}>×</button>
                </li>
              ))}
            </ul>
          )}
          {storyId && phase === 'completed' && <div className="director-notes-card"><div className="panel-heading"><span>Director Notes</span><strong>Rewrite</strong></div><div className="chapter-strip">{Array.from({ length: Math.max(10, result.chapters.length) }, (_, index) => index + 1).map((chapterNumber) => { const exists = result.chapters.some((chapter) => chapter.index === chapterNumber); return <button key={chapterNumber} type="button" className={chapterNumber === activeChapter ? 'active' : ''} disabled={!exists} onClick={() => setActiveChapter(chapterNumber)}>{chapterNumber}</button>; })}</div><label className="rewrite-field">Chế độ viết lại<select value={rewriteMode} onChange={(event) => setRewriteMode(event.target.value)}><option value="full_chapter">Viết lại toàn chương</option><option value="opening_hook">Hook mở đầu</option><option value="closing_beat">Nhịp kết chương</option><option value="dialogue_tone">Giọng thoại</option><option value="class_humiliation">Tăng sỉ nhục giai cấp</option><option value="retaliation_sharpness">Tăng độ trả đũa</option></select></label><label className="rewrite-field">Ghi chú biên tập<textarea value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} placeholder="Ví dụ: giữ plot, tăng căng thẳng, giảm thoại giải thích." /></label><button type="button" className="primary-button full" onClick={() => void handleRewrite()} disabled={rewriteBusy || !activeChapterData}>{rewriteBusy ? 'Đang viết lại' : `Viết lại chương ${activeChapter}`}</button><div className="export-card"><strong>Xuất bản thảo</strong><p>Markdown để biên tập, hoặc PDF in sẵn nội dung truyện (kèm bìa, tổng quan và watermark).</p><button type="button" className="secondary-button full" onClick={exportMd} disabled={result.chapters.length === 0}>Lưu Markdown</button><button type="button" className="secondary-button full" onClick={() => { void exportPdf(); }} disabled={result.chapters.length === 0 || pdfExporting || !storyId} aria-busy={pdfExporting || undefined}>{pdfExporting ? 'Đang xuất PDF…' : 'Xuất PDF Cả Truyện'}</button></div></div>}
        </aside>
      </section>

      {accountOpen && <AccountDialog accountProfile={accountProfile} accountName={accountName} avatarInitial={avatarInitial} onClose={() => setAccountOpen(false)} onLogout={handleLogout} />}
      {donateOpen && <DonateDialog onClose={() => setDonateOpen(false)} />}

      <footer className="studio-footer">
        <div className="footer-inner">
          <span className="footer-brand">Drama15 Lite Studio</span>
          <span className="footer-copy">© {new Date().getFullYear()} NovelKit. All rights reserved.</span>
          <nav className="footer-links">
            <a href="https://t.me/novelkit_zone" target="_blank" rel="noreferrer">Telegram</a>
            <span className="footer-sep">·</span>
            <a href="mailto:support@novelkit.cc">Liên hệ</a>
          </nav>
        </div>
      </footer>
      {selectedPublishedStory && (
        <PublishedStoryModal story={selectedPublishedStory} onClose={() => setSelectedPublishedStory(null)} />
      )}
    </main>
  );
}


function TimelinePhase({ label, steps, currentStep }: { label: string; steps: string[]; currentStep: number }): JSX.Element {
  return (
    <div className="timeline-phase">
      <span className="timeline-phase-label">{label}</span>
      <div className="timeline-dots">
        {steps.map((step, i) => (
          <div
            key={step}
            className={`timeline-item${i < currentStep ? ' done' : i === currentStep ? ' active' : ''}`}
          >
            <span className="timeline-dot" />
            <span className="timeline-step-label">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Generating({ title, text }: { title: string; text: string }): JSX.Element {
  return <div className="writing-indicator" aria-live="polite"><span className="writing-spinner" aria-hidden="true" /><div><strong>{title}</strong><span>{text}</span></div></div>;
}

function ChapterOverviewTab({ concept, plan, storyTitle, configTitle, totalChapters }: { concept?: string; plan?: string; storyTitle: string; configTitle: string; totalChapters: number }): JSX.Element {
  return (
    <div className="chapter-overview-tab">
      <p className="document-kicker">Tổng quan truyện</p>
      <h2>{storyTitle || configTitle || 'Bản thảo'}</h2>
      <div className="overview-stats">
        <span className="stat-badge">{totalChapters} chương</span>
      </div>
      {concept && (
        <div className="overview-section">
          <h3>Concept</h3>
          <div className="overview-content" dangerouslySetInnerHTML={{ __html: formatConceptHtml(concept) }} />
        </div>
      )}
      {plan && (
        <div className="overview-section">
          <h3>Kế hoạch chương (Beat Sheet)</h3>
          <div className="overview-content" dangerouslySetInnerHTML={{ __html: formatPlanHtml(plan) }} />
        </div>
      )}
      {!concept && !plan && (
        <div className="empty-state"><strong>Chưa có dữ liệu tổng quan.</strong></div>
      )}
    </div>
  );
}

function ChapterSummaryTab({ chapters, activeChapter, onSelectChapter }: { chapters: ChapterResult[]; activeChapter: number; onSelectChapter: (idx: number) => void }): JSX.Element {
  return (
    <div className="chapter-summary-tab">
      <p className="document-kicker">Danh sách chương</p>
      <ul className="chapter-list">
        {chapters.map((chapter) => (
          <li key={chapter.index} className={`chapter-list-item${chapter.index === activeChapter ? ' active' : ''}`}>
            <button type="button" className="chapter-list-btn" onClick={() => onSelectChapter(chapter.index)}>
              <span className="chapter-list-number">Chương {chapter.index}</span>
              <span className="chapter-list-title">{chapter.title || 'Chưa đặt tên'}</span>
              <span className="chapter-list-preview">{formatChapterPlainText(chapter.content).slice(0, 120).replace(/\n/g, ' ')}…</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CharacterRelationshipsTab({ bible }: { bible?: StoryBible }): JSX.Element {
  if (!bible) {
    return (
      <div className="character-relationships-tab">
        <p className="document-kicker">Bản đồ quan hệ nhân vật</p>
        <div className="empty-state"><strong>Chưa có dữ liệu nhân vật.</strong><span>Story bible sẽ xuất hiện sau khi AI dựng xong.</span></div>
      </div>
    );
  }

  // Extract characters from bible
  const characters: { id: string; name: string; role: 'main' | 'secondary'; description: string }[] = [];
  if (bible.heroine?.name) characters.push({ id: 'heroine', name: bible.heroine.name, role: 'main', description: bible.heroine.wound ?? 'Nữ chính' });
  if (bible.betrayer?.name) characters.push({ id: 'betrayer', name: bible.betrayer.name, role: 'secondary', description: bible.betrayer.cowardiceVector ?? 'Kẻ phản bội' });
  if (bible.rival?.name) characters.push({ id: 'rival', name: bible.rival.name, role: 'secondary', description: bible.rival.socialPower ?? 'Đối thủ' });

  // Build relationships based on story bible structure
  const relationships: CharacterRelationship[] = [];
  if (bible.heroine?.name && bible.betrayer?.name) {
    relationships.push({ from: 'heroine', to: 'betrayer', label: bible.betrayalEngine ?? 'Phản bội', type: 'betrayal' });
  }
  if (bible.heroine?.name && bible.rival?.name) {
    relationships.push({ from: 'heroine', to: 'rival', label: bible.classShameEngine ?? 'Đối đầu', type: 'rivalry' });
  }
  if (bible.betrayer?.name && bible.rival?.name) {
    relationships.push({ from: 'betrayer', to: 'rival', label: 'Đồng minh / Tình cũ', type: 'ally' });
  }

  if (characters.length === 0) {
    return (
      <div className="character-relationships-tab">
        <p className="document-kicker">Bản đồ quan hệ nhân vật</p>
        <div className="empty-state"><strong>Không tìm thấy nhân vật trong story bible.</strong></div>
      </div>
    );
  }

  // Layout positions for the relationship map (SVG-based)
  const svgWidth = 600;
  const svgHeight = 400;
  const positions: Record<string, { x: number; y: number }> = {
    heroine: { x: svgWidth / 2, y: 80 },
    betrayer: { x: svgWidth / 2 - 180, y: 300 },
    rival: { x: svgWidth / 2 + 180, y: 300 },
  };

  const relationshipColors: Record<CharacterRelationship['type'], string> = {
    love: '#e74c8b',
    betrayal: '#c0392b',
    rivalry: '#8e44ad',
    family: '#27ae60',
    ally: '#2980b9',
    neutral: '#7f8c8d',
  };

  return (
    <div className="character-relationships-tab">
      <p className="document-kicker">Bản đồ quan hệ nhân vật</p>
      <div className="relationship-map-container">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="relationship-map-svg" aria-label="Sơ đồ quan hệ nhân vật">
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#7f8c8d" />
            </marker>
          </defs>
          {/* Relationship lines */}
          {relationships.map((rel) => {
            const fromPos = positions[rel.from];
            const toPos = positions[rel.to];
            if (!fromPos || !toPos) return null;
            const midX = (fromPos.x + toPos.x) / 2;
            const midY = (fromPos.y + toPos.y) / 2 - 12;
            const color = relationshipColors[rel.type];
            // Offset line endpoints to not overlap with node circles
            const dx = toPos.x - fromPos.x;
            const dy = toPos.y - fromPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const nodeRadius = 36;
            const startX = fromPos.x + (dx / dist) * nodeRadius;
            const startY = fromPos.y + (dy / dist) * nodeRadius;
            const endX = toPos.x - (dx / dist) * nodeRadius;
            const endY = toPos.y - (dy / dist) * nodeRadius;
            return (
              <g key={`${rel.from}-${rel.to}`}>
                <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={color} strokeWidth="2" strokeDasharray={rel.type === 'betrayal' ? '6,4' : 'none'} markerEnd="url(#arrowhead)" />
                <rect x={midX - 60} y={midY - 10} width="120" height="20" rx="4" fill="white" fillOpacity="0.9" stroke={color} strokeWidth="1" />
                <text x={midX} y={midY + 4} textAnchor="middle" fontSize="11" fill={color} fontWeight="500">{rel.label.length > 18 ? rel.label.slice(0, 18) + '…' : rel.label}</text>
              </g>
            );
          })}
          {/* Character nodes */}
          {characters.map((char) => {
            const pos = positions[char.id];
            if (!pos) return null;
            const isMain = char.role === 'main';
            return (
              <g key={char.id} className="character-node">
                <circle cx={pos.x} cy={pos.y} r={isMain ? 38 : 32} fill={isMain ? '#fdf2e9' : '#f4f6f7'} stroke={isMain ? '#e67e22' : '#95a5a6'} strokeWidth={isMain ? 3 : 2} />
                <text x={pos.x} y={pos.y - 2} textAnchor="middle" fontSize={isMain ? 13 : 12} fontWeight="700" fill="#362820">{char.name.length > 10 ? char.name.slice(0, 10) + '…' : char.name}</text>
                <text x={pos.x} y={pos.y + 14} textAnchor="middle" fontSize="10" fill="rgba(54,40,32,0.6)">{char.id === 'heroine' ? '★ Nữ chính' : char.id === 'betrayer' ? 'Phản bội' : 'Đối thủ'}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {/* Character detail cards */}
      <div className="character-cards">
        {characters.map((char) => (
          <div key={char.id} className={`character-card ${char.role}`}>
            <div className="character-card-header">
              <span className={`character-badge ${char.role}`}>{char.role === 'main' ? '★ Chính' : '◇ Phụ'}</span>
              <strong>{char.name}</strong>
            </div>
            <p className="character-card-desc">{char.description}</p>
            {char.id === 'heroine' && bible.heroine?.strengths && (
              <div className="character-traits"><span className="trait-label">Thế mạnh:</span> {bible.heroine.strengths.join(', ')}</div>
            )}
            {char.id === 'heroine' && bible.heroine?.blindSpots && (
              <div className="character-traits"><span className="trait-label">Điểm mù:</span> {bible.heroine.blindSpots.join(', ')}</div>
            )}
            {char.id === 'rival' && bible.rival?.demeanor && (
              <div className="character-traits"><span className="trait-label">Phong thái:</span> {bible.rival.demeanor}</div>
            )}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="relationship-legend">
        <span className="legend-title">Chú thích:</span>
        <span className="legend-item"><span className="legend-line" style={{ borderColor: relationshipColors.betrayal, borderStyle: 'dashed' }} />Phản bội</span>
        <span className="legend-item"><span className="legend-line" style={{ borderColor: relationshipColors.rivalry }} />Đối đầu</span>
        <span className="legend-item"><span className="legend-line" style={{ borderColor: relationshipColors.ally }} />Đồng minh</span>
      </div>
    </div>
  );
}

function ManuscriptContent({ activeChapterData, storyTitle, configTitle, activeDraft, onResume }: { activeChapterData?: ChapterResult; storyTitle: string; configTitle: string; activeDraft?: DraftEntry; onResume?: (d: DraftEntry) => void }): JSX.Element {
  if (!activeChapterData && activeDraft && onResume) {
    return <div className="resume-card"><strong>{activeDraft.title}</strong><span>{activeDraft.result.chapters.length}/10 chương • Bị ngắt</span><button type="button" className="primary-button" onClick={() => onResume(activeDraft)}>Tiếp tục viết</button></div>;
  }
  return <>{<p className="document-kicker">Bản thảo chính</p>}<h2>{activeChapterData?.title ?? storyTitle ?? configTitle ?? 'Chưa có chương'}</h2>{activeChapterData ? <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatChapterText(activeChapterData.content) }} /> : <div className="empty-state"><strong>Chưa có chương nào.</strong><span>Điền creative brief, bấm "Tạo gợi ý" hoặc "Bắt đầu viết" để bắt đầu.</span></div>}</>;
}

const qrUrl = 'https://img.vietqr.io/image/TCB-19025192879012-compact2.png?accountName=NGUYEN%20TIEN%20DUNG';

function AccountDialog({ accountProfile, accountName, avatarInitial, onClose, onLogout }: { accountProfile: AccountProfile; accountName: string; avatarInitial: string; onClose: () => void; onLogout: () => void }): JSX.Element {
  return <div className="account-dialog-backdrop" role="presentation" onClick={onClose}><section className="account-dialog" role="dialog" aria-modal="true" aria-label="Thông tin tài khoản" onClick={(event) => event.stopPropagation()}><header>{accountProfile.picture ? <img src={accountProfile.picture} alt="" /> : <span className="avatar-fallback large">{avatarInitial}</span>}<div><h2>{accountName}</h2>{accountProfile.email && <p>{accountProfile.email}</p>}</div><button type="button" className="dialog-close" onClick={onClose} aria-label="Đóng">×</button></header><div className="plan-card"><span>Gói hiện tại</span><strong>Free</strong></div><button type="button" className="logout-button" onClick={onLogout}>Logout</button></section></div>;
}

function DonateDialog({ onClose }: { onClose: () => void }): JSX.Element {
  return <div className="account-dialog-backdrop" role="presentation" onClick={onClose}><section className="account-dialog donate-dialog" role="dialog" aria-modal="true" aria-label="QR chuyển khoản Techcombank 19025192879012" onClick={(event) => event.stopPropagation()}><header><div><h2>Cúng dường server</h2><p>QR chuyển khoản Techcombank 19025192879012</p></div><button type="button" className="dialog-close" onClick={onClose} aria-label="Đóng">×</button></header><BankCard /></section></div>;
}

function BankCard(): JSX.Element {
  return <div className="bank-card"><img src={qrUrl} alt="QR chuyển khoản Techcombank 19025192879012" /><dl><div><dt>Ngân hàng</dt><dd>Techcombank</dd></div><div><dt>Tên tài khoản</dt><dd>NGUYỄN TIẾN DŨNG</dd></div><div><dt>Số tài khoản</dt><dd>19025192879012</dd></div></dl></div>;
}


function PublishedStoryModal({ story, onClose }: { story: PublishedStory; onClose: () => void }): JSX.Element {
  const [activeIdx, setActiveIdx] = useState(1);
  const chapters = story.chaptersData ?? [];
  const activeChap = chapters.find((c) => c.index === activeIdx);
  return (
    <div className="account-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="published-modal" role="dialog" aria-modal="true" aria-label={story.title} onClick={(e) => e.stopPropagation()}>
        <header className="published-modal-header">
          <div>
            <h2>{story.title}</h2>
            <p>{story.author} • {story.chapters} chương • {new Date(story.publishedAt).toLocaleDateString('vi-VN')}</p>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Đóng">×</button>
        </header>
        {chapters.length > 0 ? (
          <div className="published-modal-body">
            <nav className="published-chapter-nav">
              {chapters.map((c) => (
                <button key={c.index} type="button" className={c.index === activeIdx ? 'active' : ''} onClick={() => setActiveIdx(c.index)}>Ch. {c.index}</button>
              ))}
            </nav>
            <div className="published-chapter-content">
              {activeChap && (
                <>
                  <h3>{activeChap.title || `Chương ${activeChap.index}`}</h3>
                  <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatChapterText(activeChap.content) }} />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="published-modal-body"><p className="empty-state">Không có nội dung chương.</p></div>
        )}
      </section>
    </div>
  );
}

export default StoryWorkspace;
