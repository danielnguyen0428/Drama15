import { useEffect, useMemo, useRef, useState } from 'react';

import { getApiBaseUrl } from '../api/apiBase';
import { httpFetch } from '../api/httpClient';
import './StoryWorkspace.css';

type Phase = 'idle' | 'suggesting' | 'creating' | 'streaming' | 'completed' | 'failed';

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
};

type StylePreset = { id: string; displayName: string; description: string };
type Chapter = { index: number; title?: string; content: string };
type StoryResult = { concept: string; plan: string; bible?: unknown; chapters: Chapter[] };

type StreamEvent = {
  stage?: 'progress' | 'overview' | 'bible' | 'plan' | 'chapter' | 'done' | 'error';
  title?: string;
  concept?: string;
  bible?: unknown;
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
  stylePreset: 'wharton_class_shame_elegance',
};

const NICHES = [
  ['billionaire_rich_poor_romance', 'Ty phu / tinh yeu vuot giai cap'],
  ['humiliation_revenge_justice', 'Si nhuc / tra dua / cong ly'],
  ['secret_identity_hidden_heiress', 'Than phan bi mat / thien kim'],
  ['toxic_family_betrayal', 'Gia dinh doc hai / phan boi'],
  ['cheating_ex_wedding_drama', 'Ngoai tinh / drama cuoi'],
  ['single_mom_poor_woman_comeback', 'Me don than / lat keo'],
  ['social_injustice_discrimination_drama', 'Bat cong xa hoi'],
  ['workplace_ceo_power_struggle', 'Cong so / CEO / tranh quyen'],
  ['medical_hidden_doctor_life_care', 'Y te / bac si an danh'],
  ['school_campus_bullying_identity', 'Hoc duong / bat nat'],
  ['werewolf_luna_alpha_soulmate', 'Werewolf / Alpha soulmate'],
  ['steamy_alien_captive_romance', 'Steamy / dark romance'],
  ['custom', 'Nhanh tuy bien'],
] as const;

export function StoryWorkspace(): JSX.Element {
  const [config, setConfig] = useState<StoryConfig>(DEFAULT_CONFIG);
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [storyId, setStoryId] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState('Untitled Drama');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Ready');
  const [result, setResult] = useState<StoryResult>(EMPTY_RESULT);
  const [activeChapter, setActiveChapter] = useState(1);
  const [panel, setPanel] = useState<'chapters' | 'overview' | 'plan' | 'bible'>('chapters');
  const [rewriteMode, setRewriteMode] = useState('full_chapter');
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  const activeChapterData = useMemo(
    () => result.chapters.find((chapter) => chapter.index === activeChapter) ?? result.chapters[0],
    [activeChapter, result.chapters],
  );
  const markdown = useMemo(() => buildMarkdown(storyTitle, result), [result, storyTitle]);
  const busy = phase === 'suggesting' || phase === 'creating' || phase === 'streaming';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await httpFetch('/story/style-presets');
        if (!response.ok) return;
        const data = (await response.json()) as { presets?: StylePreset[] };
        if (!cancelled && Array.isArray(data.presets)) setStyles(data.presets);
      } catch {
        // API can be started after the web client.
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.close();
    };
  }, []);

  function updateConfig<K extends keyof StoryConfig>(key: K, value: StoryConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function suggestSetup() {
    setPhase('suggesting');
    setError(null);
    setProgressLabel('Suggesting seed...');
    try {
      const response = await httpFetch('/story/setup-suggest', postJson(config));
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { title?: string; seed?: string };
      setConfig((current) => ({ ...current, title: data.title || current.title, seed: data.seed || current.seed }));
      setStoryTitle(data.title || config.title || 'Untitled Drama');
      setProgressLabel('Seed ready');
      setPhase('idle');
    } catch (err) {
      fail(err, 'Could not suggest setup.');
    }
  }

  async function createStory() {
    streamRef.current?.close();
    setPhase('creating');
    setError(null);
    setProgress(0);
    setProgressLabel('Creating story job...');
    setResult(EMPTY_RESULT);
    setActiveChapter(1);
    setStoryTitle(config.title || 'Untitled Drama');
    try {
      const response = await httpFetch('/stories', postJson(config));
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { storyId: string };
      setStoryId(data.storyId);
      connectStream(data.storyId);
    } catch (err) {
      fail(err, 'Could not create story.');
    }
  }

  function connectStream(id: string) {
    const source = new EventSource(`${API_BASE}/stories/${encodeURIComponent(id)}/stream`);
    streamRef.current = source;
    setPhase('streaming');
    source.onmessage = (event) => handleStreamEvent(JSON.parse(event.data) as StreamEvent);
    source.onerror = () => {
      source.close();
      setError('The local API stream disconnected. Check the API terminal.');
      setPhase('failed');
    };
  }

  function handleStreamEvent(payload: StreamEvent) {
    if (payload.stage === 'progress') {
      const total = Math.max(payload.total ?? 1, 1);
      setProgress(Math.round(((payload.current ?? 0) / total) * 100));
      setProgressLabel(payload.detail || payload.label || 'Working...');
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
      setProgressLabel('Story complete');
      setPhase('completed');
      return;
    }
    if (payload.stage === 'error') {
      fail(payload.error, 'Story generation failed.');
      streamRef.current?.close();
    }
  }

  async function rewriteChapter() {
    if (!storyId || !activeChapterData || !rewriteInstruction.trim()) return;
    setRewriteBusy(true);
    setError(null);
    try {
      const response = await httpFetch(`/stories/${encodeURIComponent(storyId)}/rewrite`, postJson({
        chapterIndex: activeChapterData.index,
        mode: rewriteMode,
        instruction: rewriteInstruction,
      }));
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { chapter: Chapter };
      setResult((current) => ({ ...current, chapters: upsertChapter(current.chapters, data.chapter) }));
      setRewriteInstruction('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rewrite chapter.');
    } finally {
      setRewriteBusy(false);
    }
  }

  function exportMarkdown() {
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
          <p className="eyebrow">Drama15 Local Studio</p>
          <h1>Core sang tac API/Web local</h1>
          <p>Local API, local web UI, no login, no deploy surface.</p>
        </div>
        <aside className="status-card">
          <span>{phase}</span>
          <strong>{progress}%</strong>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
          <small>{progressLabel}</small>
        </aside>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace-grid">
        <aside className="setup-panel">
          <PanelHeading label="Setup" value="Local" />
          <label>Niche<select value={config.niche} onChange={(event) => updateConfig('niche', event.target.value)}>{NICHES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {config.niche === 'custom' && <label>Custom branch<input value={config.customNiche} onChange={(event) => updateConfig('customNiche', event.target.value)} placeholder="VD: me don than bi coi thuong" /></label>}
          <label>Title hint<input value={config.title} onChange={(event) => updateConfig('title', event.target.value)} placeholder="Optional" /></label>
          <label>Setting seed<textarea value={config.seed} onChange={(event) => updateConfig('seed', event.target.value)} placeholder="Canh mo dau, bi mat, vat chung, quan he..." rows={6} /></label>
          <label>Style<select value={config.stylePreset} onChange={(event) => updateConfig('stylePreset', event.target.value)}>{(styles.length ? styles : [{ id: DEFAULT_CONFIG.stylePreset, displayName: 'Wharton class shame elegance', description: '' }]).map((style) => <option key={style.id} value={style.id}>{style.displayName}</option>)}</select></label>
          <label>Language<select value={config.outputLanguage} onChange={(event) => updateConfig('outputLanguage', event.target.value)}><option value="vietnamese">Vietnamese</option><option value="english">English</option><option value="japanese">Japanese</option><option value="korean">Korean</option><option value="spanish">Spanish</option><option value="portuguese">Portuguese</option></select></label>
          <Range label="Intensity" value={config.intensity} onChange={(value) => updateConfig('intensity', value)} />
          <Range label="Dialogue" value={config.dialogueRatio} onChange={(value) => updateConfig('dialogueRatio', value)} />
          <Range label="Hook" value={config.hookDensity} onChange={(value) => updateConfig('hookDensity', value)} />
          <div className="setup-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void suggestSetup()}>Goi y seed</button><button type="button" className="primary-button" disabled={busy} onClick={() => void createStory()}>Viet truyen</button></div>
        </aside>

        <section className="story-panel">
          <div className="story-toolbar"><div><p className="eyebrow">Manuscript</p><h2>{storyTitle}</h2></div><button type="button" disabled={result.chapters.length === 0} onClick={exportMarkdown}>Tai Markdown</button></div>
          <nav className="panel-tabs"><button type="button" className={panel === 'chapters' ? 'active' : ''} onClick={() => setPanel('chapters')}>Chapters</button><button type="button" className={panel === 'overview' ? 'active' : ''} onClick={() => setPanel('overview')}>Overview</button><button type="button" className={panel === 'plan' ? 'active' : ''} onClick={() => setPanel('plan')}>Plan</button><button type="button" className={panel === 'bible' ? 'active' : ''} onClick={() => setPanel('bible')}>Bible</button></nav>

          {panel === 'chapters' && <ChapterPanel chapters={result.chapters} activeChapter={activeChapter} activeChapterData={activeChapterData} onSelect={setActiveChapter} />}
          {panel === 'overview' && <TextPanel title="Concept" content={result.concept} />}
          {panel === 'plan' && <TextPanel title="Chapter plan" content={result.plan} />}
          {panel === 'bible' && <TextPanel title="Story bible" content={result.bible ? JSON.stringify(result.bible, null, 2) : ''} />}

          {phase === 'completed' && activeChapterData && <section className="rewrite-panel"><PanelHeading label="Rewrite" value={`Chapter ${activeChapterData.index}`} /><select value={rewriteMode} onChange={(event) => setRewriteMode(event.target.value)}><option value="full_chapter">Rewrite full chapter</option><option value="opening_hook">Opening hook</option><option value="closing_beat">Closing beat</option><option value="dialogue_tone">Dialogue tone</option><option value="class_humiliation">Class humiliation</option><option value="retaliation_sharpness">Retaliation sharpness</option></select><textarea value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} placeholder="VD: giu plot, tang cam giac bi coi thuong." rows={3} /><button type="button" className="primary-button" disabled={rewriteBusy || !rewriteInstruction.trim()} onClick={() => void rewriteChapter()}>{rewriteBusy ? 'Dang rewrite...' : 'Rewrite chuong'}</button></section>}
        </section>
      </section>
    </main>
  );
}

function ChapterPanel({ chapters, activeChapter, activeChapterData, onSelect }: { chapters: Chapter[]; activeChapter: number; activeChapterData?: Chapter; onSelect: (chapter: number) => void }) {
  return <div className="chapter-layout"><nav className="chapter-list">{Array.from({ length: 10 }, (_, index) => index + 1).map((number) => { const chapter = chapters.find((item) => item.index === number); return <button key={number} type="button" className={activeChapter === number ? 'active' : ''} disabled={!chapter} onClick={() => onSelect(number)}><span>{number.toString().padStart(2, '0')}</span><strong>{chapter?.title || 'Waiting'}</strong></button>; })}</nav><article className="chapter-reader">{activeChapterData ? <><h3>{activeChapterData.title || `Chapter ${activeChapterData.index}`}</h3><div className="prose">{activeChapterData.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></> : <div className="empty-state">No chapter yet. Start generation to stream the manuscript here.</div>}</article></div>;
}

function TextPanel({ title, content }: { title: string; content: string }) {
  return <article className="text-panel"><h3>{title}</h3>{content ? <pre>{content}</pre> : <div className="empty-state">Waiting for stream data.</div>}</article>;
}

function PanelHeading({ label, value }: { label: string; value: string }) {
  return <div className="panel-heading"><span>{label}</span><strong>{value}</strong></div>;
}

function Range({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="range-row"><span>{label}</span><input type="range" min="0" max="1" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} /><strong>{Math.round(value * 100)}</strong></label>;
}

function postJson(value: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
}

function upsertChapter(chapters: Chapter[], next: Chapter) {
  return [...chapters.filter((chapter) => chapter.index !== next.index), next].sort((a, b) => a.index - b.index);
}

function buildMarkdown(title: string, result: StoryResult) {
  const parts = [`# ${title || 'Drama15 Story'}`];
  if (result.concept) parts.push('## Concept', result.concept);
  if (result.plan) parts.push('## Plan', result.plan);
  for (const chapter of result.chapters) parts.push(`## Chapter ${chapter.index}: ${chapter.title || ''}`.trim(), chapter.content.trim());
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
