/**
 * `RewritePanel` — Web_Client UI for the `Viết Lại` (Rewrite) feature.
 *
 * Validates: Requirements 7.1, 7.2, 7.3.
 *
 *   7.1  The Web_Client SHALL show a `Viết Lại` panel that lets the
 *        user pick a target chapter, a rewrite mode, and a free-form
 *        instruction. → This component.
 *   7.2  The Web_Client SHALL support at minimum the six rewrite modes
 *        listed in `REWRITE_MODES`. → The mode dropdown is rendered
 *        from a single, closed-set constant that mirrors the
 *        `RewriteMode` union in `@drama15/contracts`. Adding a value
 *        on one side without the other is a TypeScript compile error.
 *   7.3  WHEN the user clicks `Viết Lại Chương`, the Web_Client SHALL
 *        send the rewrite request along with the Story_Job id to the
 *        API_Gateway and SHALL render the new chapter content after
 *        receiving the response. → The submit handler POSTs to
 *        `/stories/:id/rewrite` via `httpFetch` (which carries the
 *        `X-Client-Integrity` and `X-Device-Fingerprint` headers,
 *        Requirements 13.3, 4.1) and renders the returned
 *        `content` field.
 *
 * Quota error rendering (Requirement 7.6)
 * ---------------------------------------
 * On HTTP 429 with `error.code === 'rewrite_quota_exhausted'`, the
 * panel reads the `error.resetAt` ISO-8601 timestamp from the
 * canonical error envelope (`packages/contracts/src/errors.ts`) and
 * surfaces a hint telling the user when the daily window resets. The
 * 30/24h cap is enforced server-side; the panel only displays the
 * resulting hint.
 *
 * Server-authoritative model (Requirement 3.4)
 * --------------------------------------------
 * No plan, role, or quota counter is read from `localStorage` here.
 * The component issues the request, displays the success body, and
 * displays the failure envelope. Every authority decision happens at
 * the gateway.
 */

import { useState, type FormEvent } from 'react';

import { httpFetch } from '../api/httpClient';

/**
 * Closed-set rewrite mode union. Mirrors `RewriteMode` from
 * `@drama15/contracts`. Kept as a local type so this file does not
 * pull in the contracts package directly (the web app currently has
 * no `@drama15/contracts` dependency).
 */
export type RewriteMode =
  | 'full_chapter'
  | 'opening_hook'
  | 'closing_beat'
  | 'dialogue_tone'
  | 'class_humiliation'
  | 'retaliation_sharpness';

/**
 * The six modes Requirement 7.2 mandates. Order is fixed so the
 * dropdown is stable across renders and snapshots.
 */
export const REWRITE_MODES: readonly RewriteMode[] = [
  'full_chapter',
  'opening_hook',
  'closing_beat',
  'dialogue_tone',
  'class_humiliation',
  'retaliation_sharpness',
] as const;

/** Number of chapters in a Drama15 story (Requirement 6.4). */
const CHAPTER_COUNT = 10;
const CHAPTER_INDICES: readonly number[] = Array.from(
  { length: CHAPTER_COUNT },
  (_, i) => i + 1,
);

/** Human-readable label for each closed-set mode. */
const MODE_LABELS: Record<RewriteMode, string> = {
  full_chapter: 'Viết lại toàn chương',
  opening_hook: 'Viết lại hook mở đầu',
  closing_beat: 'Viết lại nhịp kết chương',
  dialogue_tone: 'Chỉnh giọng điệu hội thoại',
  class_humiliation: 'Tăng nhục mạ giai cấp',
  retaliation_sharpness: 'Tăng độ sắc của trả đũa',
};

/**
 * Successful rewrite response body. Shape mirrors `RewriteResponse`
 * from `@drama15/contracts`.
 */
interface RewriteResponseBody {
  storyId: string;
  chapterIndex: number;
  content: string;
  updatedAt: string;
}

/** Canonical error envelope shape returned by the API_Gateway. */
interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    retryAfterSeconds?: number;
    resetAt?: string;
    requestId?: string;
  };
}

export interface RewritePanelProps {
  /** Story_Job id whose chapter is being rewritten (Requirement 7.3). */
  storyId: string;
  /**
   * Optional chapter index to preselect (1..10). Defaults to 1.
   */
  defaultChapterIndex?: number;
}

/**
 * `RewritePanel` — controlled form that issues rewrite requests and
 * renders either the new chapter or a structured error message.
 */
export function RewritePanel({
  storyId,
  defaultChapterIndex = 1,
}: RewritePanelProps): JSX.Element {
  const initialChapter = clampChapterIndex(defaultChapterIndex);

  const [mode, setMode] = useState<RewriteMode>('full_chapter');
  const [chapterIndex, setChapterIndex] = useState<number>(initialChapter);
  const [instruction, setInstruction] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<RewriteResponseBody | null>(null);
  const [error, setError] = useState<{
    code: string;
    message: string;
    resetAt?: string;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    const trimmedInstruction = instruction.trim();
    const body: Record<string, unknown> = {
      mode,
      chapterIndex,
    };
    if (trimmedInstruction.length > 0) {
      body.instruction = trimmedInstruction;
    }

    try {
      const response = await httpFetch(
        `/stories/${encodeURIComponent(storyId)}/rewrite`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (response.ok) {
        const payload = (await response.json()) as RewriteResponseBody;
        setResult(payload);
        return;
      }

      // Non-2xx — try to read the canonical error envelope. We never
      // inspect the upstream URL or any header that could leak
      // provider information (Requirement 12.6).
      let envelope: ApiErrorEnvelope = {};
      try {
        envelope = (await response.json()) as ApiErrorEnvelope;
      } catch {
        envelope = {};
      }
      const code = envelope.error?.code ?? 'internal_error';
      const message = envelope.error?.message ?? 'Rewrite request failed.';
      const resetAt = envelope.error?.resetAt;

      setError({
        code,
        message,
        ...(typeof resetAt === 'string' ? { resetAt } : {}),
      });
    } catch {
      setError({
        code: 'internal_error',
        message: 'Network error. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="rewrite-panel-title"
      data-testid="rewrite-panel"
    >
      <h2 id="rewrite-panel-title">Viết Lại</h2>

      <form onSubmit={handleSubmit} aria-label="Rewrite chapter form">
        <div>
          <label htmlFor="rewrite-mode">Chế độ viết lại</label>
          <select
            id="rewrite-mode"
            data-testid="rewrite-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as RewriteMode)}
            disabled={submitting}
          >
            {REWRITE_MODES.map((m) => (
              <option key={m} value={m} data-testid={`rewrite-mode-option-${m}`}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="rewrite-chapter-index">Chương mục tiêu</label>
          <select
            id="rewrite-chapter-index"
            data-testid="rewrite-chapter-index"
            value={chapterIndex}
            onChange={(e) =>
              setChapterIndex(clampChapterIndex(Number(e.target.value)))
            }
            disabled={submitting}
          >
            {CHAPTER_INDICES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="rewrite-instruction">
            Yêu cầu chỉnh sửa (tuỳ chọn)
          </label>
          <textarea
            id="rewrite-instruction"
            data-testid="rewrite-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={submitting}
            rows={4}
          />
        </div>

        <button
          type="submit"
          data-testid="rewrite-submit"
          disabled={submitting}
        >
          {submitting ? 'Đang viết lại…' : 'Viết Lại Chương'}
        </button>
      </form>

      {error && (
        <div role="alert" data-testid="rewrite-error">
          <p data-testid="rewrite-error-message">{error.message}</p>
          {error.code === 'rewrite_quota_exhausted' && error.resetAt && (
            <p data-testid="rewrite-quota-reset-hint">
              Quota viết lại sẽ đặt lại lúc {error.resetAt} (UTC).
            </p>
          )}
        </div>
      )}

      {result && (
        <article aria-label="Rewritten chapter" data-testid="rewrite-result">
          <header>
            <h3 data-testid="rewrite-result-title">
              Chương {result.chapterIndex}
            </h3>
            <p data-testid="rewrite-result-updated-at">
              Cập nhật: {result.updatedAt}
            </p>
          </header>
          <pre data-testid="rewrite-result-content">{result.content}</pre>
        </article>
      )}
    </section>
  );
}

/**
 * Clamp an arbitrary number to the closed range [1, 10] and coerce
 * non-integers / NaN to 1. Defensive: the dropdown only ever emits
 * the ten valid values, but the prop boundary is widened to `number`
 * for callers.
 */
function clampChapterIndex(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const i = Math.trunc(n);
  if (i < 1) return 1;
  if (i > CHAPTER_COUNT) return CHAPTER_COUNT;
  return i;
}

export default RewritePanel;
