/**
 * `AutomationPanel` — Web_Client UI for the Automation_Job feature
 * (Task 17.6).
 *
 * Validates: Requirements 8.1, 8.6, 8.7
 *
 *   8.1  THE Web_Client SHALL display an `Automation` panel that lets
 *        the user configure an Automation_Job that creates multiple
 *        full stories in one batch.
 *   8.6  WHILE an Automation_Job is running, THE Web_Client SHALL
 *        render per-sub-story progress and MUST allow Pause / Resume
 *        / Stop on the parent job.
 *   8.7  IF a sub-story inside an Automation_Job fails, THEN THE
 *        Web_Client SHALL allow the user to retry only that sub-story
 *        (without touching the rest of the batch). Quota is NOT
 *        re-charged for the retry — that invariant is enforced by the
 *        backend (see `apps/api/src/automation/orchestrator.ts`).
 *
 * Boundaries
 * ----------
 * The component owns local UI state only (form inputs, last-known
 * job status, per-slot progress projection). It never holds plan
 * state, quota counters, or upstream credentials — those live in the
 * gateway / License_Service per Requirement 3.4. All API calls go
 * through {@link httpFetch} so the `X-Client-Integrity` and
 * `X-Device-Fingerprint` headers are attached automatically.
 *
 * Cap enforcement
 * ---------------
 * Per Requirement 8.3 each Automation_Job spawns at most 2 stories.
 * The numeric input is clamped to `[1, 2]` on every change. As a
 * defence in depth, if the parent passes a controlled value > 2 the
 * "Bắt đầu" button is disabled AND a `role="alert"` message is
 * rendered, so a programmatic over-cap cannot silently sneak past.
 *
 * Endpoints used
 * --------------
 *   POST /automation                              (create — 8.1)
 *   POST /automation/:id/pause                    (control — 8.6)
 *   POST /automation/:id/resume                   (control — 8.6)
 *   POST /automation/:id/stop                     (control — 8.6)
 *   POST /automation/:id/retry/:storyIndex        (retry  — 8.7)
 */

import { useCallback, useMemo, useState, type FormEvent } from 'react';

import { httpFetch } from '../api/httpClient';

// ---------------------------------------------------------------------------
// Domain shapes
// ---------------------------------------------------------------------------

/** Hard cap from Requirement 8.3. */
export const AUTOMATION_TARGET_COUNT_MAX = 2;
/** Lower bound — at least one sub-story per Automation_Job. */
export const AUTOMATION_TARGET_COUNT_MIN = 1;

/** Output languages the form exposes; mirrors `OutputLanguagePicker`. */
export type AutomationOutputLanguage = 'vi' | 'en';

/**
 * Local mirror of {@link import('@drama15/contracts').StorySetupConfig}.
 *
 * We deliberately re-declare the small subset the form drives so the
 * panel does not need a contracts-package import at the SPA layer
 * (the rest of the SPA already follows this pattern — see
 * `ResumeButton.tsx`'s local `StoryStatus`).
 */
export interface AutomationSubStoryConfig {
  /** Curated niche key (Requirement 6.10). Empty string when absent. */
  niche: string;
  /** User-defined niche (Requirement 6.11). Empty string when absent. */
  customNiche: string;
  /** Output language for the generated story (Requirement 6.12). */
  outputLanguage: AutomationOutputLanguage;
}

/** FSM states the parent Automation_Job can be in (mirrors `automation/fsm.ts`). */
export type AutomationStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

/** Sub-story status — same enum as `story_jobs.status`. */
export type SubStoryStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

/**
 * Local projection of one sub-story's progress. Length of the
 * containing array is exactly `targetCount`.
 */
export interface SubStoryProgress {
  /** 0-based slot index inside the Automation_Job. */
  slot: number;
  /** 0..10 chapters completed so far. */
  chaptersCompleted: number;
  /** Total chapters per sub-story (Requirement 8.3 → always 10). */
  chaptersTotal: number;
  status: SubStoryStatus;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default config used when growing the `configs` array on a count bump. */
function makeDefaultConfig(): AutomationSubStoryConfig {
  return { niche: '', customNiche: '', outputLanguage: 'vi' };
}

/**
 * Clamp `targetCount` to `[1, 2]`. Used by the numeric input handler so
 * a user typing `3` (or pasting a larger number, or hitting the up arrow
 * past the bound) cannot bypass the cap (Requirement 8.3).
 *
 * Note: the input also disables submit when the controlled value is
 * out of range, so even if a parent component injected an invalid value
 * the user could not POST it.
 */
export function clampTargetCount(raw: number): number {
  if (!Number.isFinite(raw)) return AUTOMATION_TARGET_COUNT_MIN;
  const n = Math.trunc(raw);
  if (n < AUTOMATION_TARGET_COUNT_MIN) return AUTOMATION_TARGET_COUNT_MIN;
  if (n > AUTOMATION_TARGET_COUNT_MAX) return AUTOMATION_TARGET_COUNT_MAX;
  return n;
}

/**
 * Resize the `configs` array to match the requested `targetCount`,
 * preserving any user-edited values for slots `< targetCount`.
 */
function resizeConfigs(
  current: AutomationSubStoryConfig[],
  next: number,
): AutomationSubStoryConfig[] {
  const out: AutomationSubStoryConfig[] = [];
  for (let i = 0; i < next; i++) {
    out.push(current[i] ?? makeDefaultConfig());
  }
  return out;
}

/** Build the per-slot progress array seeded for a fresh job. */
function initialProgress(targetCount: number): SubStoryProgress[] {
  const out: SubStoryProgress[] = [];
  for (let slot = 0; slot < targetCount; slot++) {
    out.push({
      slot,
      chaptersCompleted: 0,
      chaptersTotal: 10,
      status: 'pending',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AutomationPanelProps {
  /**
   * Optional initial target count (1 or 2). Out-of-range values are
   * clamped on first render but the submit button is still disabled
   * via the same guard as the runtime input handler, so an invalid
   * controlled value cannot smuggle past the cap.
   */
  initialTargetCount?: number;
  /**
   * Optional callback fired AFTER `POST /automation` succeeds. Useful
   * for the parent route to push the new automation id into a URL or
   * a higher-level store.
   */
  onCreated?: (automationJobId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Body shape returned by `POST /automation`. */
interface CreateAutomationResponseBody {
  automationJobId?: string;
  storyJobIds?: string[];
  error?: { code?: string; message?: string };
}

/** Body shape returned by the FSM control endpoints. */
interface ControlResponseBody {
  automationJobId?: string;
  status?: AutomationStatus;
  version?: number;
  error?: { code?: string; message?: string };
}

/** Body shape returned by the per-sub-story retry endpoint. */
interface RetryResponseBody {
  storyJobId?: string;
  outcome?: 'completed' | 'failed' | 'running';
  error?: { code?: string; message?: string };
}

export function AutomationPanel({
  initialTargetCount = 1,
  onCreated,
}: AutomationPanelProps): JSX.Element {
  // --- Form state ----------------------------------------------------------
  const [targetCount, setTargetCount] = useState<number>(
    clampTargetCount(initialTargetCount),
  );
  // Raw value backing the number input — kept distinct from the
  // clamped `targetCount` so we can detect "user typed 3" and surface
  // an error instead of silently rounding (Requirement 8.3 — the cap
  // must be visible to the user).
  const [rawTargetCount, setRawTargetCount] = useState<number>(
    initialTargetCount,
  );
  const [configs, setConfigs] = useState<AutomationSubStoryConfig[]>(() =>
    resizeConfigs([], clampTargetCount(initialTargetCount)),
  );

  // --- Job state -----------------------------------------------------------
  const [automationJobId, setAutomationJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<AutomationStatus>('idle');
  const [progress, setProgress] = useState<SubStoryProgress[]>(() =>
    initialProgress(clampTargetCount(initialTargetCount)),
  );

  // --- Transient feedback --------------------------------------------------
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /** True when the user typed an out-of-range count. */
  const isOverCap = rawTargetCount > AUTOMATION_TARGET_COUNT_MAX;
  /** True when the count is below the minimum (e.g. 0 or empty). */
  const isUnderMin =
    !Number.isFinite(rawTargetCount) ||
    rawTargetCount < AUTOMATION_TARGET_COUNT_MIN;

  /** The "Bắt đầu" button is enabled only when the form is valid. */
  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (isOverCap || isUnderMin) return false;
    if (automationJobId !== null) return false;
    return true;
  }, [submitting, isOverCap, isUnderMin, automationJobId]);

  // --- Handlers ------------------------------------------------------------

  const handleTargetCountChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number(event.target.value);
      setRawTargetCount(raw);
      // The clamp keeps the rest of the form (configs, progress) in
      // a valid shape even while the raw value is out of range.
      const clamped = clampTargetCount(raw);
      setTargetCount(clamped);
      setConfigs((prev) => resizeConfigs(prev, clamped));
    },
    [],
  );

  const handleConfigChange = useCallback(
    (
      slot: number,
      field: keyof AutomationSubStoryConfig,
      value: string,
    ) => {
      setConfigs((prev) =>
        prev.map((cfg, i) =>
          i === slot
            ? {
                ...cfg,
                [field]:
                  field === 'outputLanguage'
                    ? (value as AutomationOutputLanguage)
                    : value,
              }
            : cfg,
        ),
      );
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;

      setSubmitting(true);
      setError(null);

      // Build the request payload. Only fields known to the
      // contract are forwarded — `customNiche` rides along inside
      // the config blob the gateway persists, but `niche` is set to
      // the curated key when present (Requirements 6.10 / 6.11).
      const payload = {
        target_count: targetCount,
        configs: configs.map((cfg) => ({
          ...(cfg.niche ? { niche: cfg.niche } : {}),
          ...(cfg.customNiche ? { customNiche: cfg.customNiche } : {}),
          outputLanguage: cfg.outputLanguage,
        })),
      };

      try {
        const response = await httpFetch('/automation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        let body: CreateAutomationResponseBody = {};
        try {
          body = (await response.json()) as CreateAutomationResponseBody;
        } catch {
          // Non-JSON body on transport errors is acceptable.
        }

        if (!response.ok || typeof body.automationJobId !== 'string') {
          setError(
            body.error?.message ??
              'Không thể tạo Automation_Job. Vui lòng thử lại.',
          );
          setSubmitting(false);
          return;
        }

        setAutomationJobId(body.automationJobId);
        setStatus('running');
        setProgress(initialProgress(targetCount));
        onCreated?.(body.automationJobId);
      } catch {
        setError('Không thể kết nối tới máy chủ. Vui lòng thử lại.');
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, targetCount, configs, onCreated],
  );

  /**
   * Shared driver for the three FSM control buttons. Each button is a
   * thin alias over this helper so the request shape and error
   * handling stay consistent across pause / resume / stop.
   */
  const sendControl = useCallback(
    async (verb: 'pause' | 'resume' | 'stop') => {
      if (automationJobId === null) return;
      setError(null);
      try {
        const response = await httpFetch(
          `/automation/${encodeURIComponent(automationJobId)}/${verb}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
        );

        let body: ControlResponseBody = {};
        try {
          body = (await response.json()) as ControlResponseBody;
        } catch {
          // ignore non-JSON bodies
        }

        if (!response.ok) {
          setError(
            body.error?.message ??
              `Không thể ${verb} Automation_Job. Vui lòng thử lại.`,
          );
          return;
        }
        if (body.status) {
          setStatus(body.status);
        }
      } catch {
        setError('Không thể kết nối tới máy chủ. Vui lòng thử lại.');
      }
    },
    [automationJobId],
  );

  const handlePause = useCallback(() => sendControl('pause'), [sendControl]);
  const handleResume = useCallback(
    () => sendControl('resume'),
    [sendControl],
  );
  const handleStop = useCallback(() => sendControl('stop'), [sendControl]);

  /**
   * Retry a single sub-story (Requirement 8.7). The slot index is
   * 0-based and is rendered in the URL as `:storyIndex`.
   */
  const handleRetrySubStory = useCallback(
    async (slot: number) => {
      if (automationJobId === null) return;
      setError(null);
      try {
        const response = await httpFetch(
          `/automation/${encodeURIComponent(automationJobId)}/retry/${slot}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
        );

        let body: RetryResponseBody = {};
        try {
          body = (await response.json()) as RetryResponseBody;
        } catch {
          // ignore
        }

        if (!response.ok) {
          setError(
            body.error?.message ??
              'Không thể thử lại truyện này. Vui lòng thử lại.',
          );
          return;
        }
        // Optimistically flip the slot back to `running` so the user
        // sees immediate feedback. The orchestrator's eventual SSE
        // updates (out of scope for this panel) will keep the rest
        // of the bar in sync.
        setProgress((prev) =>
          prev.map((p) =>
            p.slot === slot ? { ...p, status: 'running' } : p,
          ),
        );
      } catch {
        setError('Không thể kết nối tới máy chủ. Vui lòng thử lại.');
      }
    },
    [automationJobId],
  );

  // --- Render --------------------------------------------------------------

  return (
    <section
      data-testid="automation-panel"
      aria-labelledby="automation-panel-title"
    >
      <h2 id="automation-panel-title">Automation</h2>

      {automationJobId === null ? (
        <form
          data-testid="automation-form"
          onSubmit={handleSubmit}
          aria-label="Automation form"
        >
          <div>
            <label htmlFor="automation-target-count">
              Số truyện muốn tạo (tối đa {AUTOMATION_TARGET_COUNT_MAX})
            </label>
            <input
              id="automation-target-count"
              data-testid="automation-target-count"
              type="number"
              min={AUTOMATION_TARGET_COUNT_MIN}
              max={AUTOMATION_TARGET_COUNT_MAX}
              step={1}
              value={Number.isFinite(rawTargetCount) ? rawTargetCount : ''}
              onChange={handleTargetCountChange}
              aria-invalid={isOverCap || isUnderMin || undefined}
            />
          </div>

          {isOverCap ? (
            <div
              role="alert"
              data-testid="automation-cap-error"
            >
              Mỗi Automation_Job chỉ được tạo tối đa{' '}
              {AUTOMATION_TARGET_COUNT_MAX} truyện.
            </div>
          ) : null}
          {isUnderMin && !isOverCap ? (
            <div role="alert" data-testid="automation-min-error">
              Cần tạo ít nhất {AUTOMATION_TARGET_COUNT_MIN} truyện.
            </div>
          ) : null}

          <fieldset data-testid="automation-configs">
            <legend>Cấu hình từng truyện</legend>
            {configs.map((cfg, slot) => (
              <div
                key={slot}
                data-testid={`automation-config-${slot}`}
              >
                <h3>Truyện {slot + 1}</h3>
                <label htmlFor={`automation-niche-${slot}`}>Niche</label>
                <input
                  id={`automation-niche-${slot}`}
                  data-testid={`automation-niche-${slot}`}
                  type="text"
                  value={cfg.niche}
                  onChange={(e) =>
                    handleConfigChange(slot, 'niche', e.target.value)
                  }
                />

                <label htmlFor={`automation-custom-niche-${slot}`}>
                  Niche tự đặt
                </label>
                <input
                  id={`automation-custom-niche-${slot}`}
                  data-testid={`automation-custom-niche-${slot}`}
                  type="text"
                  value={cfg.customNiche}
                  onChange={(e) =>
                    handleConfigChange(
                      slot,
                      'customNiche',
                      e.target.value,
                    )
                  }
                />
                {/*
                  Output-language picker is intentionally hidden while
                  the product is Vietnamese-only. The local config
                  still carries `outputLanguage: 'vi'`, which the
                  server normalises to `'vietnamese'` via
                  `coerceOutputLanguage` (see
                  `apps/api/src/lib/storyValidation.ts`). To re-
                  introduce English output, restore the legacy
                  <select> block from
                  `apps/web/src/_future-i18n/AutomationPanel.legacy.tsx`
                  and flip the server coercer.
                */}
              </div>
            ))}
          </fieldset>

          <button
            type="submit"
            data-testid="automation-submit"
            disabled={!canSubmit}
            aria-busy={submitting || undefined}
          >
            Bắt đầu
          </button>

          {error !== null ? (
            <div role="alert" data-testid="automation-error">
              {error}
            </div>
          ) : null}
        </form>
      ) : (
        <div
          data-testid="automation-job-view"
          aria-label="Automation_Job progress"
        >
          <div data-testid="automation-status">
            Trạng thái: {status}
          </div>

          <div data-testid="automation-controls">
            <button
              type="button"
              data-testid="automation-pause"
              onClick={handlePause}
              disabled={status !== 'running'}
            >
              Tạm dừng
            </button>
            <button
              type="button"
              data-testid="automation-resume"
              onClick={handleResume}
              disabled={status !== 'paused'}
            >
              Tiếp tục
            </button>
            <button
              type="button"
              data-testid="automation-stop"
              onClick={handleStop}
              disabled={status === 'completed' || status === 'failed'}
            >
              Dừng
            </button>
          </div>

          <ul data-testid="automation-progress-list">
            {progress.map((p) => {
              const pct =
                p.chaptersTotal === 0
                  ? 0
                  : Math.min(
                      100,
                      Math.round(
                        (p.chaptersCompleted / p.chaptersTotal) * 100,
                      ),
                    );
              return (
                <li
                  key={p.slot}
                  data-testid={`automation-progress-${p.slot}`}
                >
                  <span data-testid={`automation-progress-label-${p.slot}`}>
                    Truyện {p.slot + 1}: {p.chaptersCompleted}/
                    {p.chaptersTotal} ({p.status})
                  </span>
                  <progress
                    data-testid={`automation-progress-bar-${p.slot}`}
                    value={p.chaptersCompleted}
                    max={p.chaptersTotal}
                  >
                    {pct}%
                  </progress>
                  <button
                    type="button"
                    data-testid={`automation-retry-${p.slot}`}
                    onClick={() => handleRetrySubStory(p.slot)}
                    disabled={p.status === 'completed'}
                  >
                    Thử lại
                  </button>
                </li>
              );
            })}
          </ul>

          {error !== null ? (
            <div role="alert" data-testid="automation-error">
              {error}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default AutomationPanel;
