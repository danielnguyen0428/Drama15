/**
 * `StorySetupForm` — story setup panel for the Web_Client (Task 17.1).
 *
 * Validates: Requirements 6.1, 6.2, 6.10, 6.11.
 *
 *   6.1   THE Web_Client SHALL hiển thị form thiết lập truyện gồm gợi ý tiêu
 *         đề, niche, ngôn ngữ đầu ra, hạt giống bối cảnh, cường độ, tỷ lệ
 *         thoại và mật độ hook tương đương bản desktop.
 *   6.2   WHEN người dùng bấm `Tự tạo`, THE Web_Client SHALL gọi API_Gateway
 *         để sinh tiêu đề, hạt giống bối cảnh và config sáng tác theo niche
 *         đã chọn và phải điền kết quả vào form.
 *   6.10  THE Web_Client SHALL hỗ trợ tối thiểu các niche giống bản desktop
 *         hiện tại bao gồm tình yêu tỷ phú, sỉ nhục lật kèo, che giấu thân
 *         phận, gia đình độc hại, ngoại tình, mẹ đơn thân, bất công xã hội.
 *   6.11  THE Web_Client SHALL hỗ trợ niche tùy chỉnh do người dùng tự nhập.
 *
 * Niche keys mirror the upstream router-LLM presets so the API_Gateway can
 * forward them to `Existing_Generation_Server` verbatim. Keeping the keys
 * stable here means a future i18n catalog rollout (catalog.vi/en) can
 * replace the hard-coded labels without touching the request body shape.
 *
 * Mutual exclusion (niche vs customNiche)
 * ---------------------------------------
 * The form binds either a curated niche key OR a free-text custom niche on
 * any single submission, never both. When the user picks a curated niche
 * from the dropdown, the `customNiche` text input is cleared; when the user
 * types into `customNiche`, the curated selection is cleared. The shared
 * "active" state lives in `useState`, so the two fields cannot drift
 * out of sync between renders. This matches the upstream contract — the
 * setup-suggest route in `apps/api/src/stories/setupSuggest.ts` rejects
 * payloads with neither field, but accepts either one.
 */

import { useState } from 'react';

import { httpFetch } from '../api/httpClient';
import { getOutputLanguage, type OutputLanguage } from './outputLanguage';

/**
 * Curated niche keys (parity with the desktop client) — Requirement 6.10.
 *
 * The underlying string keys are the upstream LLM router preset ids; the
 * display labels are Vietnamese strings rendered directly because the
 * shared i18n catalog (`apps/web/src/i18n/catalog.vi.ts`) does not yet
 * carry niche labels. When those keys are added in a future change, the
 * `label` property below can be swapped for a `t('story.niche.<key>')`
 * lookup without altering callers.
 */
export type CuratedNicheKey =
  | 'billionaire'
  | 'humiliation_revenge'
  | 'hidden_identity'
  | 'toxic_family'
  | 'affair'
  | 'single_mother'
  | 'social_injustice';

export interface CuratedNiche {
  readonly key: CuratedNicheKey;
  readonly label: string;
}

export const CURATED_NICHES: ReadonlyArray<CuratedNiche> = [
  { key: 'billionaire', label: 'Tỷ phú' },
  { key: 'humiliation_revenge', label: 'Sỉ nhục lật kèo' },
  { key: 'hidden_identity', label: 'Che giấu thân phận' },
  { key: 'toxic_family', label: 'Gia đình độc hại' },
  { key: 'affair', label: 'Ngoại tình' },
  { key: 'single_mother', label: 'Mẹ đơn thân' },
  { key: 'social_injustice', label: 'Bất công xã hội' },
] as const;

/**
 * Default sliders mirror the desktop preset; values can be tuned by the
 * user before clicking "Tạo Chương" / "Tạo Toàn Bộ Truyện".
 */
const DEFAULT_INTENSITY = 0.7;
const DEFAULT_DIALOGUE_RATIO = 0.5;
const DEFAULT_HOOK_DENSITY = 0.5;

/** Endpoint the "Tự tạo" button POSTs to. Mounted by API_Gateway Task 19.1. */
export const SETUP_SUGGEST_ENDPOINT = import.meta.env.DEV
  ? 'http://localhost:3000/story/setup-suggest'
  : `${import.meta.env.VITE_API_URL || ''}/story/setup-suggest`;

/**
 * Shape returned by `POST /story/setup-suggest`.
 *
 * The upstream LLM router can return any subset of these keys (it is
 * stochastic), so every field is optional and we only fill the form for
 * the keys that came back. Unknown extra keys are ignored.
 */
export interface SetupSuggestResponse {
  readonly title?: string;
  readonly seed?: string;
  readonly config?: {
    readonly intensity?: number;
    readonly dialogueRatio?: number;
    readonly hookDensity?: number;
  };
}

/** Internal form state. Kept flat so React rerenders are predictable. */
interface FormState {
  niche: CuratedNicheKey | '';
  customNiche: string;
  title: string;
  seed: string;
  intensity: number;
  dialogueRatio: number;
  hookDensity: number;
}

const INITIAL_STATE: FormState = {
  niche: 'billionaire',
  customNiche: '',
  title: '',
  seed: '',
  intensity: DEFAULT_INTENSITY,
  dialogueRatio: DEFAULT_DIALOGUE_RATIO,
  hookDensity: DEFAULT_HOOK_DENSITY,
};

/** Outbound payload for setup-suggest. Mirrors the API_Gateway parser. */
interface SetupSuggestRequestBody {
  niche?: CuratedNicheKey;
  customNiche?: string;
  outputLanguage: OutputLanguage;
  title?: string;
  seed?: string;
  intensity?: number;
  dialogueRatio?: number;
  hookDensity?: number;
}

function buildSuggestBody(state: FormState): SetupSuggestRequestBody {
  const body: SetupSuggestRequestBody = {
    outputLanguage: getOutputLanguage(),
    intensity: state.intensity,
    dialogueRatio: state.dialogueRatio,
    hookDensity: state.hookDensity,
  };
  if (state.customNiche.trim().length > 0) {
    body.customNiche = state.customNiche.trim();
  } else if (state.niche !== '') {
    body.niche = state.niche;
  }
  if (state.title.trim().length > 0) body.title = state.title.trim();
  if (state.seed.trim().length > 0) body.seed = state.seed.trim();
  return body;
}

export interface StorySetupFormProps {
  /**
   * Optional callback fired when the form is submitted via "Tạo Chương" or
   * "Tạo Toàn Bộ Truyện". Tests and parent components subscribe via this
   * callback rather than reading internal state.
   */
  readonly onSubmit?: (body: SetupSuggestRequestBody) => void;
}

export function StorySetupForm({
  onSubmit,
}: StorySetupFormProps = {}): JSX.Element {
  const [state, setState] = useState<FormState>(INITIAL_STATE);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Selecting a curated niche clears the custom field so the two never
  // submit together (Requirements 6.10 / 6.11).
  const handleNicheChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ): void => {
    const next = event.target.value as CuratedNicheKey | '';
    setState((prev) => ({
      ...prev,
      niche: next,
      // Picking a curated niche always wipes any free-text input.
      customNiche: next.length > 0 ? '' : prev.customNiche,
    }));
  };

  // Typing a custom niche clears the curated selection. A blank text box
  // restores no curated default — the user can pick one again from the
  // dropdown to switch back to a curated niche.
  const handleCustomNicheChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const next = event.target.value;
    setState((prev) => ({
      ...prev,
      customNiche: next,
      niche: next.trim().length > 0 ? '' : prev.niche,
    }));
  };

  const handleTitleChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const value = event.target.value;
    setState((prev) => ({ ...prev, title: value }));
  };

  const handleSeedChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ): void => {
    const value = event.target.value;
    setState((prev) => ({ ...prev, seed: value }));
  };

  const handleNumberChange =
    (key: 'intensity' | 'dialogueRatio' | 'hookDensity') =>
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const parsed = Number(event.target.value);
      if (Number.isFinite(parsed)) {
        setState((prev) => ({ ...prev, [key]: parsed }));
      }
    };

  /**
   * Click handler for the "Tự tạo" button (Requirement 6.2).
   *
   *   1. POST the current form state to `/story/setup-suggest` via
   *      `httpFetch` so the request carries `X-Client-Integrity` and
   *      `X-Device-Fingerprint` (Requirements 4.1, 13.3).
   *   2. On success, merge the upstream's `title`, `seed`, and `config.*`
   *      into the form state so the user sees the suggestion immediately.
   *   3. On error, surface a localised message in `[data-testid="story-setup-error"]`
   *      so the existing error styles in the SPA pick it up.
   */
  const handleSuggest = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const body = buildSuggestBody(state);
      const endpoint = import.meta.env.DEV
  ? 'http://localhost:3001/story/setup-suggest'
        : `${import.meta.env.VITE_API_URL || ''}/story/setup-suggest`;
      const response = await httpFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        if (import.meta.env.DEV) {
          const errText = await response.clone().text().catch(() => '');
          console.error('[StorySetupForm] suggest failed:', response.status, errText);
        }
        setError('Hệ thống tạm thời bận, vui lòng thử lại.');
        return;
      }
      const json = (await response.json()) as SetupSuggestResponse;
      setState((prev) => ({
        ...prev,
        title:
          typeof json.title === 'string' && json.title.length > 0
            ? json.title
            : prev.title,
        seed:
          typeof json.seed === 'string' && json.seed.length > 0
            ? json.seed
            : prev.seed,
        intensity:
          json.config && Number.isFinite(json.config.intensity)
            ? (json.config.intensity as number)
            : prev.intensity,
        dialogueRatio:
          json.config && Number.isFinite(json.config.dialogueRatio)
            ? (json.config.dialogueRatio as number)
            : prev.dialogueRatio,
        hookDensity:
          json.config && Number.isFinite(json.config.hookDensity)
            ? (json.config.hookDensity as number)
            : prev.hookDensity,
      }));
      setSuccess('✓ Đã tạo gợi ý thành công!');
      // Notify parent that form config is ready for story creation
      onSubmit?.(buildSuggestBody({
        ...state,
        title: typeof json.title === 'string' && json.title.length > 0 ? json.title : state.title,
        seed: typeof json.seed === 'string' && json.seed.length > 0 ? json.seed : state.seed,
      }));
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[StorySetupForm] suggest error:', err);
        // Fallback: try direct fetch without security headers (dev only)
        try {
          const body = buildSuggestBody(state);
          const fallbackResp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/story/setup-suggest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (fallbackResp.ok) {
            const json = (await fallbackResp.json()) as SetupSuggestResponse;
            setState((prev) => ({
              ...prev,
              title: typeof json.title === 'string' && json.title.length > 0 ? json.title : prev.title,
              seed: typeof json.seed === 'string' && json.seed.length > 0 ? json.seed : prev.seed,
            }));
            setSuccess('✓ Đã tạo gợi ý thành công!');
            setError(null);
            onSubmit?.(buildSuggestBody(state));
            return;
          }
        } catch (fallbackErr) {
          console.error('[StorySetupForm] fallback also failed:', fallbackErr);
        }
      }
      setError('Hệ thống tạm thời bận, vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit?.(buildSuggestBody(state));
  };

  return (
    <form
      data-testid="story-setup-form"
      className="story-setup-form"
      onSubmit={handleSubmit}
    >
      <label htmlFor="story-setup-niche">
        Niche
        <select
          id="story-setup-niche"
          data-testid="story-setup-niche"
          value={state.niche}
          onChange={handleNicheChange}
        >
          <option value="">— Chọn niche —</option>
          {CURATED_NICHES.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label htmlFor="story-setup-custom-niche">
        Niche tùy chỉnh
        <input
          id="story-setup-custom-niche"
          data-testid="story-setup-custom-niche"
          type="text"
          value={state.customNiche}
          onChange={handleCustomNicheChange}
          placeholder="Tự nhập niche"
        />
      </label>

      <label htmlFor="story-setup-title">
        Tiêu đề
        <input
          id="story-setup-title"
          data-testid="story-setup-title"
          type="text"
          value={state.title}
          onChange={handleTitleChange}
        />
      </label>

      <label htmlFor="story-setup-seed">
        Hạt giống bối cảnh
        <textarea
          id="story-setup-seed"
          data-testid="story-setup-seed"
          value={state.seed}
          onChange={handleSeedChange}
        />
      </label>

      <label htmlFor="story-setup-intensity">
        Cường độ
        <input
          id="story-setup-intensity"
          data-testid="story-setup-intensity"
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={state.intensity}
          onChange={handleNumberChange('intensity')}
        />
      </label>

      <label htmlFor="story-setup-dialogue-ratio">
        Tỷ lệ thoại
        <input
          id="story-setup-dialogue-ratio"
          data-testid="story-setup-dialogue-ratio"
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={state.dialogueRatio}
          onChange={handleNumberChange('dialogueRatio')}
        />
      </label>

      <label htmlFor="story-setup-hook-density">
        Mật độ hook
        <input
          id="story-setup-hook-density"
          data-testid="story-setup-hook-density"
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={state.hookDensity}
          onChange={handleNumberChange('hookDensity')}
        />
      </label>

      <button
        type="button"
        data-testid="story-setup-suggest"
        onClick={() => {
          void handleSuggest();
        }}
        disabled={busy}
        style={{
          padding: '0.5rem 1.5rem',
          backgroundColor: busy ? '#ccc' : '#1976d2',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: busy ? 'not-allowed' : 'pointer',
          fontWeight: 500,
        }}
      >
        {busy ? '⏳ Đang tạo...' : 'Tự tạo'}
      </button>

      {busy && (
        <p data-testid="story-setup-loading" style={{ color: '#1976d2', marginTop: '0.5rem' }}>
          ⏳ Đang gọi AI sinh gợi ý, vui lòng chờ...
        </p>
      )}

      {success !== null && !busy ? (
        <p
          data-testid="story-setup-success"
          style={{ color: '#2e7d32', marginTop: '0.5rem', fontWeight: 500 }}
        >
          {success}
        </p>
      ) : null}

      {error !== null && !busy ? (
        <p
          role="alert"
          data-testid="story-setup-error"
          className="story-setup-error"
          style={{ color: '#d32f2f', marginTop: '0.5rem' }}
        >
          ❌ {error}
        </p>
      ) : null}
    </form>
  );
}

export default StorySetupForm;
