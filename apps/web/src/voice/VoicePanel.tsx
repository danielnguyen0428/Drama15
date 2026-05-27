/**
 * `VoicePanel` — Web_Client UI for the Voice_Job feature (Task 17.7).
 *
 * Validates: Requirements 9.1, 9.3, 9.4, 9.7, 9.10.
 *
 *   9.1   The Web_Client SHALL display a Voice panel with a Voice ID
 *         picker, speed and pitch controls (parity with the desktop
 *         build). → The form has a `<select>` for Voice ID and two
 *         `<input type="number">` for speed and pitch.
 *
 *   9.3   WHEN the user clicks `Voice ID`, the Web_Client SHALL call
 *         the API_Gateway to fetch the OmniVoice voice list and
 *         render it in a dropdown. → On mount we issue
 *         `GET /voices`. Re-fetching on each open of the panel would
 *         leak per-tenant entitlement state to a shared cache so we
 *         keep `Cache-Control: no-store` semantics by always going
 *         through `httpFetch` (the gateway sets the no-store header).
 *
 *   9.4   WHEN the user clicks `Gen Voice 10 Chương` and the story
 *         has 10 chapters, the Web_Client SHALL initialize a
 *         Voice_Job via the API_Gateway. → The "Bắt đầu Voice"
 *         button POSTs to `/stories/:storyId/voice`. The 10-chapter
 *         precondition is enforced server-side
 *         (`apps/api/src/voice/createVoice.ts`); the panel surfaces
 *         the resulting error envelope when the server rejects.
 *
 *   9.7   WHILE a Voice_Job is running, the Web_Client SHALL display
 *         per-chapter progress and SHALL allow Pause / Stop /
 *         Resume / Retry. → After a successful start the panel
 *         renders 10 progress rows (`#1`..`#10`) plus three control
 *         buttons. Each row carries its own "Thử lại" button.
 *
 *   9.10  The Web_Client SHALL NOT display the real OmniVoice host.
 *         → Every error string surfaced to the DOM is run through
 *         {@link sanitizeUpstreamLeak} which redacts any token
 *         containing `internal`, `drama15`, or `.local`. The pattern
 *         intentionally matches the host fragments the gateway is
 *         expected to strip (`apps/api/src/gateway/upstreamProxy.ts`)
 *         so a proxy regression cannot leak host information into
 *         the SPA. The route URL in the upstream proxy is
 *         `omnivoice.drama15.internal/...`-shaped; we never render
 *         it and we never store it.
 *
 * Server-authoritative model (Requirement 3.4)
 * --------------------------------------------
 * The panel issues calls and renders the response envelope. Plan,
 * role, and quota counters are read at the gateway from
 * `License_Service.getPlanState`; nothing here reads `localStorage`
 * or relies on a client-side flag to gate the UI. The Free_Plan
 * rejection (`voice_requires_paid`, Requirement 9.2) is reported by
 * the server and rendered through the same sanitised error pipe.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';

import { httpFetch } from '../api/httpClient';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Number of chapters in a Drama15 story (Requirement 6.4 / 9.4). */
export const VOICE_CHAPTER_COUNT = 10;

/**
 * Per-chapter Voice_Job progress projection. The `index` is 1-based
 * to match the API contract (`/voice/:id/chapter/:idx/retry` accepts
 * `idx ∈ [1, 10]` — see `apps/api/src/voice/control.ts`).
 */
export interface VoiceChapterProgress {
  /** 1..10 chapter index. */
  index: number;
  /** Current per-chapter status as projected from job updates. */
  status: 'pending' | 'running' | 'done' | 'failed';
}

/**
 * Voice metadata as exposed by `GET /voices`. The gateway projects
 * the upstream OmniVoice list to `{ voices: [...] }` but does not
 * normalise individual fields, so we accept anything with at least
 * an `id` and best-effort use `name` / `label` for display.
 */
export interface VoiceOption {
  id: string;
  name?: string;
  label?: string;
  language?: string;
}

/** Successful response shape for `POST /stories/:storyId/voice`. */
interface CreateVoiceResponseBody {
  voiceJobId?: string;
  paidQuotaReserved?: boolean;
  error?: { code?: string; message?: string };
}

/** Successful response shape for the FSM control endpoints. */
interface VoiceFsmResponseBody {
  status?: 'running' | 'paused' | 'completed' | 'failed' | 'partial';
  version?: number;
  error?: { code?: string; message?: string };
}

/** Successful response shape for the per-chapter retry endpoint. */
interface VoiceRetryResponseBody {
  chaptersCompleted?: number;
  error?: { code?: string; message?: string };
}

/** Response shape for `GET /voices`. */
interface VoicesListResponseBody {
  voices?: unknown;
  error?: { code?: string; message?: string };
}

// ---------------------------------------------------------------------------
// Upstream-host sanitisation (Requirement 9.10)
// ---------------------------------------------------------------------------

/**
 * Strip host-like tokens that contain `internal`, `drama15`, or
 * `.local` from a free-form error message. This is defence-in-depth
 * on top of `apps/api/src/gateway/upstreamProxy.ts` which already
 * collapses upstream host leaks at the gateway. If a future proxy
 * regression let one through, we still want the DOM to be clean.
 *
 * The pattern grabs an entire hostname-shaped run (alphanumerics,
 * dots, dashes, underscores) that contains any of the three
 * sentinel substrings, so partial host fragments such as
 * `drama15-voice` and full FQDNs such as
 * `omnivoice.drama15.internal:9443` are both redacted.
 */
const UPSTREAM_LEAK_PATTERN = /[\w.-]*(?:internal|drama15|\.local)[\w.-]*/gi;

export function sanitizeUpstreamLeak(value: string | undefined): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  // Replace every host-like token containing the sentinels with the
  // canonical placeholder; collapse runs of whitespace introduced by
  // the redaction so the result reads cleanly.
  return value
    .replace(UPSTREAM_LEAK_PATTERN, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the initial 10-row per-chapter progress array. */
function initialChapters(): VoiceChapterProgress[] {
  const rows: VoiceChapterProgress[] = [];
  for (let i = 1; i <= VOICE_CHAPTER_COUNT; i++) {
    rows.push({ index: i, status: 'pending' });
  }
  return rows;
}

/**
 * Best-effort label for a `VoiceOption`. Falls back through
 * `name` → `label` → `id` so the dropdown is always populated even
 * if the upstream metadata schema is sparse.
 */
function voiceLabel(v: VoiceOption): string {
  if (typeof v.name === 'string' && v.name.length > 0) return v.name;
  if (typeof v.label === 'string' && v.label.length > 0) return v.label;
  return v.id;
}

/**
 * Coerce an arbitrary `unknown` from the `GET /voices` body into a
 * sane `VoiceOption[]`. Items without a string `id` are dropped
 * defensively — the UI can never render a voice it can't address.
 */
function coerceVoices(raw: unknown): VoiceOption[] {
  if (!Array.isArray(raw)) return [];
  const out: VoiceOption[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      if (typeof obj.id === 'string' && obj.id.length > 0) {
        const opt: VoiceOption = { id: obj.id };
        if (typeof obj.name === 'string') opt.name = obj.name;
        if (typeof obj.label === 'string') opt.label = obj.label;
        if (typeof obj.language === 'string') opt.language = obj.language;
        out.push(opt);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VoicePanelProps {
  /** Story_Job id whose chapters are being voiced. */
  storyId: string;
  /** Initial speed value (defaults to 1.0). */
  initialSpeed?: number;
  /** Initial pitch value (defaults to 0). */
  initialPitch?: number;
  /** Optional callback fired AFTER the Voice_Job is created. */
  onVoiceJobStarted?: (voiceJobId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoicePanel({
  storyId,
  initialSpeed = 1.0,
  initialPitch = 0,
  onVoiceJobStarted,
}: VoicePanelProps): JSX.Element {
  // --- Form state ----------------------------------------------------------
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voicesLoading, setVoicesLoading] = useState<boolean>(true);
  const [voiceId, setVoiceId] = useState<string>('');
  const [speed, setSpeed] = useState<number>(initialSpeed);
  const [pitch, setPitch] = useState<number>(initialPitch);

  // --- Job state -----------------------------------------------------------
  const [voiceJobId, setVoiceJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<
    'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'partial'
  >('idle');
  const [chapters, setChapters] = useState<VoiceChapterProgress[]>(() =>
    initialChapters(),
  );

  // --- Transient feedback --------------------------------------------------
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorView, setErrorView] = useState<{
    code: string;
    message: string;
  } | null>(null);

  // ------------------------------------------------------------------------
  // Effect: GET /voices on mount (Requirement 9.3)
  // ------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setVoicesLoading(true);
      try {
        const response = await httpFetch('/voices', { method: 'GET' });
        let body: VoicesListResponseBody = {};
        try {
          body = (await response.json()) as VoicesListResponseBody;
        } catch {
          body = {};
        }
        if (cancelled) return;
        if (!response.ok) {
          setErrorView({
            code: body.error?.code ?? 'voices_unavailable',
            message: sanitizeUpstreamLeak(
              body.error?.message ?? 'Không thể tải danh sách giọng đọc.',
            ),
          });
          setVoices([]);
          return;
        }
        const list = coerceVoices(body.voices);
        setVoices(list);
        // Default the dropdown to the first voice so the form has a
        // valid value out of the box. The user can change it before
        // submitting.
        if (list.length > 0 && voiceId === '') {
          setVoiceId(list[0]!.id);
        }
      } catch {
        if (cancelled) return;
        setErrorView({
          code: 'network_error',
          message: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
        });
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // We deliberately depend on `storyId` so swapping stories
    // re-fetches the voice list (a new tenant gate may apply).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId]);

  // ------------------------------------------------------------------------
  // Submit handler — POST /stories/:storyId/voice (Requirement 9.4)
  // ------------------------------------------------------------------------

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (voiceJobId !== null) return false;
    if (typeof voiceId !== 'string' || voiceId.length === 0) return false;
    if (!Number.isFinite(speed)) return false;
    if (!Number.isFinite(pitch)) return false;
    return true;
  }, [submitting, voiceJobId, voiceId, speed, pitch]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;

      setSubmitting(true);
      setErrorView(null);

      const payload = { voiceId, speed, pitch };

      try {
        const response = await httpFetch(
          `/stories/${encodeURIComponent(storyId)}/voice`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );

        let body: CreateVoiceResponseBody = {};
        try {
          body = (await response.json()) as CreateVoiceResponseBody;
        } catch {
          body = {};
        }

        if (!response.ok || typeof body.voiceJobId !== 'string') {
          setErrorView({
            code: body.error?.code ?? 'voice_create_failed',
            message: sanitizeUpstreamLeak(
              body.error?.message ?? 'Không thể tạo Voice_Job. Vui lòng thử lại.',
            ),
          });
          return;
        }

        setVoiceJobId(body.voiceJobId);
        setJobStatus('running');
        setChapters(initialChapters());
        onVoiceJobStarted?.(body.voiceJobId);
      } catch {
        setErrorView({
          code: 'network_error',
          message: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
        });
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, voiceId, speed, pitch, storyId, onVoiceJobStarted],
  );

  // ------------------------------------------------------------------------
  // FSM control handlers — pause / resume / stop (Requirement 9.7)
  // ------------------------------------------------------------------------

  const sendControl = useCallback(
    async (verb: 'pause' | 'resume' | 'stop') => {
      if (voiceJobId === null) return;
      setErrorView(null);
      try {
        const response = await httpFetch(
          `/voice/${encodeURIComponent(voiceJobId)}/${verb}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
        );

        let body: VoiceFsmResponseBody = {};
        try {
          body = (await response.json()) as VoiceFsmResponseBody;
        } catch {
          body = {};
        }

        if (!response.ok) {
          setErrorView({
            code: body.error?.code ?? 'voice_control_failed',
            message: sanitizeUpstreamLeak(
              body.error?.message ??
                `Không thể ${verb} Voice_Job. Vui lòng thử lại.`,
            ),
          });
          return;
        }
        if (body.status) {
          setJobStatus(body.status);
        }
      } catch {
        setErrorView({
          code: 'network_error',
          message: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
        });
      }
    },
    [voiceJobId],
  );

  const handlePause = useCallback(() => sendControl('pause'), [sendControl]);
  const handleResume = useCallback(
    () => sendControl('resume'),
    [sendControl],
  );
  const handleStop = useCallback(() => sendControl('stop'), [sendControl]);

  // ------------------------------------------------------------------------
  // Per-chapter retry handler (Requirements 9.7, 9.9)
  // ------------------------------------------------------------------------

  const handleRetryChapter = useCallback(
    async (chapterIndex: number) => {
      if (voiceJobId === null) return;
      if (chapterIndex < 1 || chapterIndex > VOICE_CHAPTER_COUNT) return;
      setErrorView(null);
      try {
        const response = await httpFetch(
          `/voice/${encodeURIComponent(voiceJobId)}/chapter/${chapterIndex}/retry`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
        );

        let body: VoiceRetryResponseBody = {};
        try {
          body = (await response.json()) as VoiceRetryResponseBody;
        } catch {
          body = {};
        }

        if (!response.ok) {
          setErrorView({
            code: body.error?.code ?? 'voice_retry_failed',
            message: sanitizeUpstreamLeak(
              body.error?.message ??
                'Không thể thử lại chương này. Vui lòng thử lại.',
            ),
          });
          return;
        }

        // Optimistically flip the chapter back to `running` so the
        // user sees immediate feedback. Real progress comes via job
        // updates wired by the parent route.
        setChapters((prev) =>
          prev.map((c) =>
            c.index === chapterIndex ? { ...c, status: 'running' } : c,
          ),
        );
      } catch {
        setErrorView({
          code: 'network_error',
          message: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
        });
      }
    },
    [voiceJobId],
  );

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------

  return (
    <section
      data-testid="voice-panel"
      aria-labelledby="voice-panel-title"
    >
      <h2 id="voice-panel-title">Voice</h2>

      {voiceJobId === null ? (
        <form
          data-testid="voice-form"
          onSubmit={handleSubmit}
          aria-label="Voice form"
        >
          <div>
            <label htmlFor="voice-id-select">Voice ID</label>
            <select
              id="voice-id-select"
              data-testid="voice-id-select"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              disabled={voicesLoading || voices.length === 0}
            >
              {voices.length === 0 ? (
                <option value="">
                  {voicesLoading ? 'Đang tải...' : 'Không có giọng đọc'}
                </option>
              ) : (
                voices.map((v) => (
                  <option
                    key={v.id}
                    value={v.id}
                    data-testid={`voice-option-${v.id}`}
                  >
                    {voiceLabel(v)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label htmlFor="voice-speed">Tốc độ</label>
            <input
              id="voice-speed"
              data-testid="voice-speed"
              type="number"
              step={0.1}
              value={Number.isFinite(speed) ? speed : ''}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </div>

          <div>
            <label htmlFor="voice-pitch">Pitch</label>
            <input
              id="voice-pitch"
              data-testid="voice-pitch"
              type="number"
              step={0.1}
              value={Number.isFinite(pitch) ? pitch : ''}
              onChange={(e) => setPitch(Number(e.target.value))}
            />
          </div>

          <button
            type="submit"
            data-testid="voice-submit"
            disabled={!canSubmit}
            aria-busy={submitting || undefined}
          >
            Bắt đầu Voice
          </button>

          {errorView !== null ? (
            <div role="alert" data-testid="voice-error">
              <span data-testid="voice-error-code">{errorView.code}</span>:{' '}
              <span data-testid="voice-error-message">
                {errorView.message}
              </span>
            </div>
          ) : null}
        </form>
      ) : (
        <div
          data-testid="voice-job-view"
          aria-label="Voice_Job progress"
        >
          <div data-testid="voice-status">Trạng thái: {jobStatus}</div>

          <div data-testid="voice-controls">
            <button
              type="button"
              data-testid="voice-pause"
              onClick={handlePause}
              disabled={jobStatus !== 'running'}
            >
              Tạm dừng
            </button>
            <button
              type="button"
              data-testid="voice-resume"
              onClick={handleResume}
              disabled={jobStatus !== 'paused'}
            >
              Tiếp tục
            </button>
            <button
              type="button"
              data-testid="voice-stop"
              onClick={handleStop}
              disabled={
                jobStatus === 'completed' || jobStatus === 'failed'
              }
            >
              Dừng
            </button>
          </div>

          <ul data-testid="voice-chapter-list">
            {chapters.map((c) => (
              <li
                key={c.index}
                data-testid={`voice-chapter-${c.index}`}
              >
                <span data-testid={`voice-chapter-label-${c.index}`}>
                  Chương {c.index}: {c.status}
                </span>
                <button
                  type="button"
                  data-testid={`voice-retry-${c.index}`}
                  onClick={() => handleRetryChapter(c.index)}
                  disabled={c.status === 'done'}
                >
                  Thử lại
                </button>
              </li>
            ))}
          </ul>

          {errorView !== null ? (
            <div role="alert" data-testid="voice-error">
              <span data-testid="voice-error-code">{errorView.code}</span>:{' '}
              <span data-testid="voice-error-message">
                {errorView.message}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default VoicePanel;
