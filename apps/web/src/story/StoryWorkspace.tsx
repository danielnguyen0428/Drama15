import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { getApiBaseUrl } from '../api/apiBase';
import { httpFetch } from '../api/httpClient';
import { getAccessToken, supabase } from '../api/supabaseClient';
import { useI18n } from '../i18n/useI18n';
import { LlmSettingsModal, type LlmSettings } from './LlmSettingsModal';
import { canResumeStory, createRelationshipGraphPreview, normalizeRelationshipGraph, normalizeQualityReports, TOTAL_CHAPTERS, type RelationshipGraphView, type QualityReportView } from './storyViewModel';
import './StoryWorkspace.css';

type Phase = 'idle' | 'suggesting' | 'creating' | 'streaming' | 'completed' | 'failed';
type Panel = 'chapters' | 'overview' | 'plan' | 'bible' | 'relationships' | 'quality';
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
type StoryResult = { concept: string; plan: string; bible?: unknown; relationshipGraph?: RelationshipGraphView; quality?: QualityReportView; chapters: Chapter[] };
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
  meta?: unknown;
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

const NICHE_KEYS = [
  'billionaire_rich_poor_romance',
  'humiliation_revenge_justice',
  'secret_identity_hidden_heiress',
  'toxic_family_betrayal',
  'cheating_ex_wedding_drama',
  'single_mom_poor_woman_comeback',
  'social_injustice_discrimination_drama',
  'workplace_ceo_power_struggle',
  'medical_hidden_doctor_life_care',
  'school_campus_bullying_identity',
  'werewolf_luna_alpha_soulmate',
  'steamy_alien_captive_romance',
  'custom',
] as const;

const LANGUAGE_OPTION_KEYS = [
  'vietnamese',
  'english',
  'japanese',
  'korean',
  'spanish',
  'portuguese',
] as const;

const REWRITE_MODE_KEYS = [
  'full_chapter',
  'opening_hook',
  'closing_beat',
  'dialogue_tone',
  'class_humiliation',
  'retaliation_sharpness',
] as const;

const FALLBACK_STYLE: StylePreset = {
  id: DEFAULT_CONFIG.stylePreset,
  displayName: 'Cố Mạn - ấm áp hiện đại',
  description: '',
};

export function StoryWorkspace(): JSX.Element {
  const { t, locale, setLocale } = useI18n();
  const [config, setConfig] = useState<StoryConfig>(DEFAULT_CONFIG);
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [storyId, setStoryId] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState(t('story.default_title'));
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
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [showLlmSettings, setShowLlmSettings] = useState(false);
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [storyListBusy, setStoryListBusy] = useState(false);
  const streamRef = useRef<EventSource | null>(null);
  const storyPanelRef = useRef<HTMLElement | null>(null);
  const [storyPanelFocused, setStoryPanelFocused] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(true);

  const focusStoryPanel = useCallback(() => {
    setStoryPanelFocused(true);
    storyPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => setStoryPanelFocused(false), 1600);
  }, []);

  const typewriter = useTypewriterQueue({
    onSectionStart: useCallback((job: RevealJob) => {
      // Follow the writing: switch to whichever section is actively being typed
      // so concept, plan (Dàn ý), bible (Hồ sơ) and chapters all show their
      // realtime reveal. onSectionStart only fires for typed sections, so this
      // never yanks the user onto the non-streamed tabs (Quan hệ, Chất lượng).
      setPanel(job.panel);
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
  const markdown = useMemo(() => buildMarkdown(storyTitle, result, t), [result, storyTitle, t]);
  const busy = phase === 'suggesting' || phase === 'creating' || phase === 'streaming';
  const streaming = phase === 'creating' || phase === 'streaming';
  const writing = streaming || typewriter.active;
  const isSignedIn = Boolean(session && user);
  const outOfQuota = Boolean(quota && quota.remaining <= 0);
  const outOfSetupSuggestionQuota = Boolean(setupSuggestionQuota && setupSuggestionQuota.remaining <= 0);
  const llmConfigured = Boolean(llmSettings?.configured);
  const canResumeCurrentStory = Boolean(
    storyId && phase !== 'completed' && (currentSavedStory ? canResumeStory(currentSavedStory) : result.chapters.length > 0 && result.chapters.length < TOTAL_CHAPTERS),
  );
  const setupSuggestionQuotaCopy = setupSuggestionQuota
    ? outOfSetupSuggestionQuota
      ? t('account.setup_quota_used', { limit: setupSuggestionQuota.limit })
      : t('account.setup_quota_remaining', { remaining: setupSuggestionQuota.remaining, limit: setupSuggestionQuota.limit })
    : t('account.setup_quota_free');

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
        void refreshLlmSettings();
        void loadSavedStories();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('error.login'));
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        if (nextSession) {
          void refreshAccount();
          void refreshLlmSettings();
          void loadSavedStories();
        } else {
          setUser(null);
          setQuota(null);
          setSetupSuggestionQuota(null);
          setLlmSettings(null);
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
      setError(t('error.supabase'));
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
      setError(err instanceof Error ? err.message : t('error.account'));
    }
  }

  async function refreshLlmSettings() {
    try {
      const response = await httpFetch('/llm/settings');
      if (!response.ok) throw new Error(await readError(response));
      setLlmSettings((await response.json()) as LlmSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được cấu hình LLM.');
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
      setError(err instanceof Error ? err.message : t('error.stories'));
    } finally {
      setStoryListBusy(false);
    }
  }

  function requireLogin() {
    if (isSignedIn) return true;
    setError(t('error.require_login'));
    return false;
  }

  async function suggestSetup() {
    if (!requireLogin()) return;
    setPhase('suggesting');
    setError(null);
    setProgressLabel(t('progress.suggesting'));
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
      setStoryTitle(data.title || config.title || t('story.default_title'));
      setProgressLabel(t('progress.suggested'));
      setPhase('idle');
    } catch (err) {
      fail(err, t('error.suggest'));
    }
  }

  async function createStory() {
    if (!requireLogin()) return;
    if (outOfQuota) {
      setError(t('error.out_of_quota'));
      return;
    }

    focusStoryPanel();
    streamRef.current?.close();
    typewriter.reset();
    setPhase('creating');
    setError(null);
    setProgress(0);
    setStageStartedAt(Date.now());
    setProgressLabel(t('progress.creating'));
    setResult(EMPTY_RESULT);
    setActiveChapter(1);
    setPanel('overview');
    setStoryTitle(config.title || t('story.default_title'));
    try {
      const response = await httpFetch('/stories', postJson(config));
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { storyId: string; quota?: Quota };
      if (data.quota) setQuota(data.quota);
      setStoryId(data.storyId);
      await loadSavedStories();
      await connectStream(data.storyId);
    } catch (err) {
      fail(err, t('error.create'));
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
      setError(t('error.stream_disconnect'));
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
    setResult(story.storyPayload ? resultFromPayload(story.storyPayload, t) : { ...EMPTY_RESULT, relationshipGraph: normalizeRelationshipGraph(story.relationshipGraph) });
    setActiveChapter(story.storyPayload?.chapters[0]?.chapterNumber ?? 1);
    setPanel('chapters');
    setPhase(completed ? 'completed' : story.status === 'failed' ? 'failed' : 'idle');
    setProgress(completed ? 100 : Math.round((chapterCount / TOTAL_CHAPTERS) * 100));
    setProgressLabel(label ?? (completed ? t('progress.opened_saved') : chapterCount > 0 ? t('progress.opened_partial', { count: chapterCount, total: TOTAL_CHAPTERS }) : t('progress.no_chapters')));
  }

  function handleStreamEvent(payload: StreamEvent) {
    if (payload.stage === 'progress') {
      const total = Math.max(payload.total ?? 1, 1);
      setProgress(Math.round(((payload.current ?? 0) / total) * 100));
      const nextLabel = payload.detail || payload.label || t('progress.processing');
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
      setProgressLabel(t('progress.done'));
      setPhase('completed');
      void loadSavedStories();
      void refreshAccount();
      return;
    }
    if (payload.stage === 'error') {
      fail(payload.error, t('error.stream_interrupted'));
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
      setError(err instanceof Error ? err.message : t('error.open'));
    }
  }

  async function resumeStory(id: string) {
    if (!requireLogin()) return;
    streamRef.current?.close();
    focusStoryPanel();
    setError(null);
    setPhase('creating');
    setProgressLabel(t('progress.resuming'));
    try {
      const story = await fetchStory(id);
      applyStoryDetail(story, t('progress.resumed'));
      typewriter.prime(existingRevealKeys(story));
      const response = await httpFetch(`/stories/${encodeURIComponent(id)}/resume`, { method: 'POST' });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { storyId?: string };
      const nextStoryId = data.storyId || id;
      setStoryId(nextStoryId);
      await loadSavedStories();
      await connectStream(nextStoryId);
    } catch (err) {
      fail(err, t('error.resume'));
    }
  }

  async function renameStory(id: string, currentTitle: string) {
    const title = window.prompt(t('dialog.rename'), currentTitle)?.trim();
    if (!title) return;
    try {
      const response = await httpFetch(`/stories/${encodeURIComponent(id)}`, jsonRequest('PATCH', { title }));
      if (!response.ok) throw new Error(await readError(response));
      await loadSavedStories();
      if (storyId === id) setStoryTitle(title);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.rename'));
    }
  }

  async function deleteStory(id: string) {
    if (!window.confirm(t('dialog.delete_confirm'))) return;
    try {
      const response = await httpFetch(`/stories/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response));
      await loadSavedStories();
      if (storyId === id) {
        setStoryId(null);
        setStoryTitle(t('story.default_title'));
        setResult(EMPTY_RESULT);
        setPhase('idle');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.delete'));
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
      setError(err instanceof Error ? err.message : t('error.rewrite'));
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

  const toggleLocale = () => setLocale(locale === 'vi' ? 'en' : 'vi');

  return (
    <main className="workspace-shell">
      <section className="account-bar">
        {user ? (
          <div className="account-summary">
            {user.avatarUrl && <img src={user.avatarUrl} alt={t('account.avatar_alt')} />}
            <div>
              <strong>{user.displayName || user.email}</strong>
              <span>{t(`tier.${user.tier}`)}</span>
            </div>
          </div>
        ) : <p>{t('account.login_prompt')}</p>}
        <div className="account-usage">
          {quota && <div className={outOfQuota ? 'account-quota blocked' : 'account-quota'}><strong>{t('account.quota_today', { remaining: quota.remaining, limit: quota.limit })}</strong><span>{outOfQuota ? t('account.quota_out') : t('account.quota_info')}</span></div>}
          <div className={outOfSetupSuggestionQuota ? 'account-quota blocked' : 'account-quota'}><strong>{setupSuggestionQuotaCopy}</strong></div>
        </div>
        <div className="account-actions">
          {user ? <>{resumableStory && <button type="button" className="primary-button" disabled={busy || !llmConfigured} onClick={() => void resumeStory(resumableStory.id)}>{t('account.resume_btn')}</button>}<button type="button" className={llmConfigured ? 'secondary-button' : 'primary-button'} onClick={() => setShowLlmSettings(true)}>{llmConfigured ? llmSettings?.model : 'Cấu hình LLM'}</button><button type="button" className="secondary-button" onClick={() => void signOut()}>{t('account.sign_out')}</button></> : <button type="button" className="primary-button" onClick={() => void signInWithGoogle()}>{t('account.sign_in')}</button>}
          <button type="button" className="secondary-button lang-switch-btn" onClick={toggleLocale} aria-label="Switch language" title={locale === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}>🌐 {t('lang_switch.label')}</button>
        </div>
      </section>

      <header className="workspace-header">
        <div className="studio-title-block">
          <div className="studio-kicker"><span>NovelKit Studio</span><i>{t('header.kicker')}</i></div>
          <h1>{t('header.title')}</h1>
          <p>{t('header.subtitle')}</p>
          <div className="studio-meta" aria-label={t('header.meta.aria')}>
            <span>{t('header.meta.idea')}</span>
            <span>{t('header.meta.character')}</span>
            <span>{t('header.meta.outline')}</span>
            <span>{t('header.meta.chapter')}</span>
          </div>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace-grid">
        <aside className="setup-panel">
          <PanelHeading label={t('setup.heading_label')} value={t('setup.heading_value')} />
          <label>{t('setup.niche_label')}<select value={config.niche} onChange={(event) => updateConfig('niche', event.target.value)}>{NICHE_KEYS.map((key) => <option key={key} value={key}>{t(`niche.${key}`)}</option>)}</select></label>
          {config.niche === 'custom' && <label>{t('setup.custom_label')}<input value={config.customNiche} onChange={(event) => updateConfig('customNiche', event.target.value)} placeholder={t('setup.custom_placeholder')} /></label>}
          <label>{t('setup.title_label')}<input value={config.title} onChange={(event) => updateConfig('title', event.target.value)} placeholder={t('setup.title_placeholder')} /></label>
          <label>{t('setup.seed_label')}<textarea value={config.seed} onChange={(event) => updateConfig('seed', event.target.value)} placeholder={t('setup.seed_placeholder')} rows={6} /></label>
          <label>{t('setup.style_label')}<select value={config.stylePreset} onChange={(event) => updateConfig('stylePreset', event.target.value)}>{(styles.length ? styles : [FALLBACK_STYLE]).map((style) => <option key={style.id} value={style.id}>{style.displayName}</option>)}</select></label>
          <label>{t('setup.language_label')}<select value={config.outputLanguage} onChange={(event) => updateConfig('outputLanguage', event.target.value)}>{LANGUAGE_OPTION_KEYS.map((key) => <option key={key} value={key}>{t(`lang.${key}`)}</option>)}</select></label>
          <Range label={t('setup.intensity')} value={config.intensity} onChange={(value) => updateConfig('intensity', value)} />
          <Range label={t('setup.dialogue_ratio')} value={config.dialogueRatio} min={0.2} max={0.85} onChange={(value) => updateConfig('dialogueRatio', value)} />
          <Range label={t('setup.hook_density')} value={config.hookDensity} onChange={(value) => updateConfig('hookDensity', value)} />
          <div className="setup-actions"><button type="button" className="secondary-button" disabled={busy || !isSignedIn || !llmConfigured || outOfSetupSuggestionQuota} onClick={() => void suggestSetup()}>{t('setup.suggest_btn')}</button><button type="button" className="primary-button" disabled={busy || !isSignedIn || !llmConfigured || outOfQuota || !config.title.trim() || !config.seed.trim()} onClick={() => void createStory()}>{t('setup.write_btn')}</button></div>
        </aside>

        <section className={storyPanelFocused || writing ? 'story-panel focused' : 'story-panel'} ref={storyPanelRef}>
          <div className="story-toolbar"><div><p className="eyebrow">{t('story.eyebrow')}</p><h2>{storyTitle}</h2></div><div className="story-toolbar-actions">{canResumeCurrentStory && <button type="button" className="primary-button" disabled={!isSignedIn || !llmConfigured || busy} onClick={() => storyId && void resumeStory(storyId)}>{t('story.resume_btn')}</button>}<button type="button" disabled={!isSignedIn || result.chapters.length === 0} onClick={exportMarkdown}>{t('story.export_btn')}</button></div></div>
          <nav className="panel-tabs"><button type="button" className={panel === 'chapters' ? 'active' : ''} onClick={() => setPanel('chapters')}>{t('story.tab.chapters')}</button><button type="button" className={panel === 'overview' ? 'active' : ''} onClick={() => setPanel('overview')}>{t('story.tab.overview')}</button><button type="button" className={panel === 'plan' ? 'active' : ''} onClick={() => setPanel('plan')}>{t('story.tab.plan')}</button><button type="button" className={panel === 'bible' ? 'active' : ''} onClick={() => setPanel('bible')}>{t('story.tab.bible')}</button><button type="button" className={panel === 'relationships' ? 'active' : ''} onClick={() => setPanel('relationships')}>{t('story.tab.relationships')}</button><button type="button" className={panel === 'quality' ? 'active' : ''} onClick={() => setPanel('quality')}>{t('story.tab.quality')}</button></nav>
          {!(storyId === null && phase === 'idle') && (
            <div className="status-card story-status-card">
              <span>{t(`phase.${phase}`)}</span>
              <small className="loading-action">{progressLabel}{busy && stageElapsed >= 3 ? ` · ${formatElapsed(stageElapsed)}` : ''}</small>
              <LoadingAnimation active={busy} />
              <div className="progress-row"><strong>{progress}%</strong><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>
            </div>
          )}

          {panel === 'chapters' && <ChapterPanel chapters={result.chapters} activeChapter={activeChapter} activeChapterData={activeChapterData} onSelect={setActiveChapter} loading={writing} reveal={activeChapterData ? typewriter.revealed[`chapter-${activeChapterData.index}`] : undefined} typing={!!activeChapterData && typewriter.activeKey === `chapter-${activeChapterData.index}`} t={t} />}
          {panel === 'overview' && <TextPanel title={t('text.overview_title')} content={result.concept} loading={writing} reveal={typewriter.revealed.concept} typing={typewriter.activeKey === 'concept'} t={t} />}
          {panel === 'plan' && <TextPanel title={t('text.plan_title')} content={result.plan} loading={writing} reveal={typewriter.revealed.plan} typing={typewriter.activeKey === 'plan'} t={t} />}
          {panel === 'bible' && <TextPanel title={t('text.bible_title')} content={stringifyBible(result.bible)} loading={writing} reveal={typewriter.revealed.bible} typing={typewriter.activeKey === 'bible'} t={t} />}
          {panel === 'relationships' && <RelationshipGraphPanel graph={result.relationshipGraph} t={t} />}
          {panel === 'quality' && <QualityReportPanel quality={result.quality} t={t} />}

          {phase === 'completed' && activeChapterData && <section className="rewrite-panel"><PanelHeading label={t('rewrite.heading_label')} value={t('rewrite.heading_value', { index: activeChapterData.index })} /><select value={rewriteMode} onChange={(event) => setRewriteMode(event.target.value)}>{REWRITE_MODE_KEYS.map((key) => <option key={key} value={key}>{t(`rewrite.${key}`)}</option>)}</select><textarea value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} placeholder={t('rewrite.placeholder')} rows={3} /><button type="button" className="primary-button" disabled={rewriteBusy || !rewriteInstruction.trim() || !isSignedIn || !llmConfigured} onClick={() => void rewriteChapter()}>{rewriteBusy ? t('rewrite.btn_busy') : t('rewrite.btn')}</button></section>}
        </section>

        <aside className="saved-panel">
          <StoryList stories={savedStories} busy={storyListBusy} signedIn={isSignedIn} onRefresh={loadSavedStories} onOpen={openStory} onResume={resumeStory} onRename={renameStory} onDelete={deleteStory} t={t} />
        </aside>
      </section>
      <footer className="workspace-footer">
        <nav aria-label={t('footer.aria')}>
          <a href="https://novelkit.cc">novelkit.cc</a>
          <a href="https://meowsolo.com">meowsolo.com</a>
          <a href="https://beta.novelkit.cc">beta.novelkit.cc</a>
        </nav>
        <span>{t('footer.tagline')}</span>
      </footer>
      {showAnnouncement && !showLlmSettings && (
        <aside className="announcement-card" role="note">
          <div className="announcement-header">
            <span className="announcement-kicker">{t('announcement.kicker')}</span>
            <button type="button" className="announcement-close-btn" onClick={() => setShowAnnouncement(false)} aria-label="Close announcement">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />
              </svg>
            </button>
          </div>
          <ul className="announcement-list">
            <li>
              <span className="announcement-dot" aria-hidden="true" />
              <span><strong>{t('announcement.item_free_label')}</strong>{t('announcement.item_free')}</span>
            </li>
            <li>
              <span className="announcement-dot" aria-hidden="true" />
              <span><strong>{t('announcement.item_keys_label')}</strong>{t('announcement.item_keys')}</span>
            </li>
            <li>
              <span className="announcement-dot" aria-hidden="true" />
              <span><strong>{t('announcement.item_admin_provider_label')}</strong>{t('announcement.item_admin_provider')}</span>
            </li>
          </ul>
        </aside>
      )}
      {!showLlmSettings && (
        <a className={`fb-float-btn ${showAnnouncement ? 'with-announcement' : ''}`} href="https://www.facebook.com/novelkit" target="_blank" rel="noreferrer noopener" aria-label={t('footer.fb_aria')}>
          <svg viewBox="0 0 36 36" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M18 2C9.163 2 2 8.636 2 16.7c0 4.592 2.268 8.694 5.812 11.396V34l5.592-3.072A17.838 17.838 0 0 0 18 31.4c8.837 0 16-6.636 16-14.7S26.837 2 18 2Zm1.588 19.79-4.074-4.346-7.95 4.346 8.744-9.28 4.178 4.345 7.846-4.345-8.744 9.28Z" /></svg>
        </a>
      )}
      <LlmSettingsModal
        open={showLlmSettings}
        onClose={() => setShowLlmSettings(false)}
        onSaved={setLlmSettings}
      />
    </main>
  );
}

type TFn = (key: string, params?: Record<string, string | number>) => string;

function LoadingAnimation({ active }: { active: boolean }) {
  return (
    <div className={active ? 'loading-dog active' : 'loading-dog'} aria-hidden="true">
      <img src="/loading-dog.svg" alt="" />
    </div>
  );
}

function StoryList({ stories, busy, signedIn, onRefresh, onOpen, onResume, onRename, onDelete, t }: { stories: SavedStory[]; busy: boolean; signedIn: boolean; onRefresh: () => Promise<void>; onOpen: (id: string) => Promise<void>; onResume: (id: string) => Promise<void>; onRename: (id: string, title: string) => Promise<void>; onDelete: (id: string) => Promise<void>; t: TFn }) {
  return <section className="saved-stories"><PanelHeading label={t('stories.heading_label')} value={busy ? t('stories.heading_busy') : t('stories.heading_count', { count: stories.length })} /><button type="button" className="secondary-button" disabled={!signedIn || busy} onClick={() => void onRefresh()}>{t('stories.refresh')}</button>{!signedIn ? <div className="empty-state compact">{t('stories.login_prompt')}</div> : stories.length === 0 ? <div className="empty-state compact">{t('stories.empty')}</div> : <div className="story-list">{stories.map((story) => <article key={story.id} className="story-list-item"><button type="button" onClick={() => void onOpen(story.id)}><strong>{story.title}</strong><span>{t(`status.${story.status}`)} · {t('stories.chapter_count', { count: story.chapterCount, total: TOTAL_CHAPTERS })}</span></button><div>{canResumeStory(story) && <button type="button" onClick={() => void onResume(story.id)}>{t('stories.resume')}</button>}<button type="button" onClick={() => void onRename(story.id, story.title)}>{t('stories.rename')}</button><button type="button" onClick={() => void onDelete(story.id)}>{t('stories.delete')}</button></div></article>)}</div>}</section>;
}

function ChapterPanel({ chapters, activeChapter, activeChapterData, onSelect, loading, reveal, typing, t }: { chapters: Chapter[]; activeChapter: number; activeChapterData?: Chapter; onSelect: (chapter: number) => void; loading?: boolean; reveal?: number; typing?: boolean; t: TFn }) {
  const fullText = activeChapterData?.content ?? '';
  const shown = typing && reveal !== undefined ? fullText.slice(0, reveal) : fullText;
  const hasText = shown.trim().length > 0;
  return <div className="chapter-layout"><nav className="chapter-list">{Array.from({ length: TOTAL_CHAPTERS }, (_, index) => index + 1).map((number) => { const chapter = chapters.find((item) => item.index === number); return <button key={number} type="button" className={activeChapter === number ? 'active' : ''} disabled={!chapter} onClick={() => onSelect(number)}><span>{number.toString().padStart(2, '0')}</span><strong>{chapter?.title || t('chapter.waiting')}</strong></button>; })}</nav><article className="chapter-reader">{activeChapterData && hasText ? <><h3>{activeChapterData.title || `${t('chapter.prefix')} ${activeChapterData.index}`}</h3><TypewriterProse text={shown} typing={typing} /></> : loading ? <ReaderLoading message={t('chapter.loading')} /> : <div className="empty-state">{t('chapter.empty')}</div>}</article></div>;
}

function TextPanel({ title, content, loading, reveal, typing, t }: { title: string; content: string; loading?: boolean; reveal?: number; typing?: boolean; t: TFn }) {
  const shown = typing && reveal !== undefined ? content.slice(0, reveal) : content;
  return <article className="text-panel"><h3>{title}</h3>{content ? <pre>{shown}{typing && shown.length < content.length ? <span className="type-caret" aria-hidden="true" /> : null}</pre> : loading ? <ReaderLoading message={t('text.loading')} /> : <div className="empty-state">{t('text.empty')}</div>}</article>;
}

function TypewriterProse({ text, typing }: { text: string; typing?: boolean }) {
  const paragraphs = text.split(/\n{2,}/);
  return <div className="prose">{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}{typing && index === paragraphs.length - 1 ? <span className="type-caret" aria-hidden="true" /> : null}</p>)}</div>;
}

function ReaderLoading({ message }: { message: string }) {
  return <div className="reader-loading"><LoadingAnimation active /><p>{message}</p></div>;
}

function RelationshipGraphPanel({ graph, t }: { graph?: RelationshipGraphView; t: TFn }) {
  const graphPreview = createRelationshipGraphPreview(graph);
  if (!graphPreview || graphPreview.nodes.length === 0) {
    return <article className="text-panel"><h3>{t('relationship.title')}</h3><div className="empty-state">{t('relationship.empty')}</div></article>;
  }

  const positions = graphPreview.nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(graphPreview.nodes.length, 1) - Math.PI / 2;
    return { node, x: 260 + Math.cos(angle) * 190, y: 210 + Math.sin(angle) * 145 };
  });
  const byId = new Map(positions.map((item) => [item.node.id, item]));
  const hiddenCount = graphPreview.hiddenNodeCount + graphPreview.hiddenEdgeCount;

  return <article className="relationship-panel"><h3>{t('relationship.title')}</h3>{hiddenCount > 0 && <p className="relationship-note">{t('relationship.showing', { nodes: graphPreview.nodes.length, edges: graphPreview.edges.length })}</p>}<div className="relationship-canvas"><svg viewBox="0 0 520 420" role="img" aria-label={t('relationship.aria')}>{graphPreview.edges.map((edge, index) => { const source = byId.get(edge.source); const target = byId.get(edge.target); if (!source || !target) return null; const midX = (source.x + target.x) / 2; const midY = (source.y + target.y) / 2; return <g key={`${edge.source}-${edge.target}-${index}`}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} /><text x={midX} y={midY}>{edge.chapterNumber ? `Ch.${edge.chapterNumber}` : edge.type}</text></g>; })}{positions.map(({ node, x, y }) => <g key={node.id} className="relationship-node"><circle cx={x} cy={y} r="38" /><text x={x} y={y - 4}>{node.name}</text><text x={x} y={y + 14}>{node.role}</text></g>)}</svg></div><div className="relationship-list">{graphPreview.edges.map((edge, index) => { const source = byId.get(edge.source)?.node.name ?? edge.source; const target = byId.get(edge.target)?.node.name ?? edge.target; return <p key={index}><strong>{source} → {target}</strong><span>{edge.label}</span></p>; })}</div></article>;
}

function PanelHeading({ label, value }: { label: string; value: string }) {
  return <div className="panel-heading"><span>{label}</span><strong>{value}</strong></div>;
}

function QualityReportPanel({ quality, t }: { quality?: QualityReportView; t: TFn }) {
  if (!quality) {
    return <article className="text-panel"><h3>{t('quality.title')}</h3><div className="empty-state">{t('quality.empty')}</div></article>;
  }

  const { readerPanel, manuscriptReview, propagationDebt, foundation } = quality;

  return <article className="quality-panel">
    <h3>{t('quality.title')}</h3>

    {foundation && <section className="quality-section">
      <div className="quality-section-head"><h4>{t('quality.foundation')}</h4><span className="quality-score">{foundation.overallScore.toFixed(1)}/10</span></div>
      {foundation.attempts && foundation.attempts > 1 && <p className="relationship-note">{t('quality.foundation_rebuilt', { attempts: foundation.attempts })}</p>}
      {foundation.dimensions.length > 0 && <div className="quality-persona-grid">{foundation.dimensions.map((d, i) => <div key={i} className="quality-persona"><div className="quality-persona-head"><strong>{d.name}</strong><span>{d.score.toFixed(1)}</span></div>{d.note && <p className="quality-liked">{d.note}</p>}</div>)}</div>}
      {foundation.issues.length > 0 && <ul className="quality-issues">{foundation.issues.map((issue, i) => <li key={i}><span className="quality-issue-text">⚠️ {issue}</span></li>)}</ul>}
      {foundation.suggestions.length > 0 && <ul className="quality-issues">{foundation.suggestions.map((s, i) => <li key={i}><span className="quality-issue-text">💡 {s}</span></li>)}</ul>}
    </section>}

    {readerPanel && <section className="quality-section">
      <div className="quality-section-head"><h4>{t('quality.reader_panel')}</h4><span className="quality-score">{readerPanel.overallScore.toFixed(1)}/10</span></div>
      <div className="quality-persona-grid">{readerPanel.personas.map((p, i) => <div key={i} className="quality-persona"><div className="quality-persona-head"><strong>{p.persona}</strong><span>{p.score.toFixed(1)}</span></div>{p.liked && <p className="quality-liked">👍 {p.liked}</p>}{p.concern && <p className="quality-concern">⚠️ {p.concern}</p>}</div>)}</div>
      {readerPanel.topIssues.length > 0 && <ul className="quality-issues">{readerPanel.topIssues.map((issue, i) => <li key={i}><span className={`sev sev-${issue.severity}`}>{t(`quality.severity.${issue.severity}`)}</span><span className="quality-issue-text">{issue.issue}</span>{chapterTag(issue.chapters) && <span className="quality-chapter">{chapterTag(issue.chapters)}</span>}</li>)}</ul>}
    </section>}

    {manuscriptReview && <section className="quality-section">
      <div className="quality-section-head"><h4>{t('quality.manuscript')}</h4></div>
      {manuscriptReview.verdict && <p className="quality-verdict">{manuscriptReview.verdict}</p>}
      {manuscriptReview.items.length > 0 && <ul className="quality-issues">{manuscriptReview.items.map((item, i) => <li key={i}><span className={`sev sev-${item.severity}`}>{t(`quality.severity.${item.severity}`)}</span><span className="quality-persona-tag">{item.persona === 'professor' ? t('quality.persona.professor') : t('quality.persona.critic')}</span><span className="quality-issue-text">{item.issue}</span>{chapterTag(item.chapters) && <span className="quality-chapter">{chapterTag(item.chapters)}</span>}</li>)}</ul>}
    </section>}

    {propagationDebt && propagationDebt.length > 0 && <section className="quality-section">
      <div className="quality-section-head"><h4>{t('quality.debt')}</h4><span className="quality-score">{propagationDebt.length}</span></div>
      <ul className="quality-issues">{propagationDebt.map((debt, i) => <li key={i}><span className={`sev sev-${debt.severity}`}>{t(`quality.severity.${debt.severity}`)}</span><span className="quality-persona-tag">{t(`quality.debt_kind.${debt.kind}`)}</span><span className="quality-issue-text">{debt.detail}</span>{chapterTag(debt.chapters) && <span className="quality-chapter">{chapterTag(debt.chapters)}</span>}</li>)}</ul>
    </section>}
  </article>;
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

function chapterTag(chapters: number[]) {
  return chapters.length > 0 ? `Ch. ${chapters.join(', ')}` : '';
}

/** Keys for content that already exists when resuming, so it shows instantly. */
function existingRevealKeys(story: StoryDetail): string[] {
  const keys = ['concept', 'bible', 'plan'];
  for (const chapter of story.storyPayload?.chapters ?? []) {
    keys.push(`chapter-${chapter.chapterNumber}`);
  }
  return keys;
}

function resultFromPayload(payload: StoryPayload, t: TFn): StoryResult {
  return {
    concept: [`${t('result.title_prefix')}: ${payload.title}`, `${t('result.logline_prefix')}: ${payload.concept.logline}`, `${t('result.promise_prefix')}: ${payload.concept.promise}`, `${t('result.conflict_prefix')}: ${payload.concept.conflictEngine}`].join('\n'),
    plan: payload.chapterPlan.map((chapter) => [`${chapter.chapterNumber}. ${chapter.title}`, `${t('result.beat_prefix')}: ${chapter.mainBeat}`, `${t('result.hook_prefix')}: ${chapter.hook}`, `${t('result.ending_prefix')}: ${chapter.endingBeat}`].join('\n')).join('\n\n'),
    bible: payload.storyBible,
    relationshipGraph: normalizeRelationshipGraph(payload.relationshipGraph),
    quality: normalizeQualityReports(payload.meta),
    chapters: payload.chapters.map((chapter) => ({ index: chapter.chapterNumber, title: chapter.title, content: chapter.text })),
  };
}

function buildMarkdown(title: string, result: StoryResult, t: TFn) {
  const parts = [`# ${title || t('md.untitled')}`];
  if (result.concept) parts.push(`## ${t('md.idea')}`, result.concept);
  if (result.plan) parts.push(`## ${t('md.outline')}`, result.plan);
  for (const chapter of result.chapters) parts.push(`## ${t('md.chapter')} ${chapter.index}: ${chapter.title || ''}`.trim(), chapter.content.trim());
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
