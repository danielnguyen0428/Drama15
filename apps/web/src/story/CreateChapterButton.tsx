/**
 * `CreateChapterButton` — Free_Plan single-chapter creation control.
 *
 * Validates: Requirement 6.3
 *
 *   6.3  WHEN người dùng Free_Plan bấm `Tạo Chương`, THE API_Gateway
 *        SHALL cho phép tạo từng chương riêng lẻ và phải đếm mỗi
 *        chương được tạo vào quota 3 chương mỗi 24 giờ UTC của
 *        Free_Plan.
 *
 * UI contract
 * -----------
 * - Renders a single button labelled "Tạo Chương".
 * - On click, POSTs `{ mode: 'single_chapter', config, fingerprint,
 *   chapterIndex }` to `/stories` via {@link httpFetch} (which carries
 *   `X-Client-Integrity` and `X-Device-Fingerprint` for us).
 * - The `config` is enriched with the user's stored generation
 *   language via {@link withOutputLanguage} (task 16.2), so the
 *   server-side {@link CreateStoryRequest} carries
 *   `config.outputLanguage` regardless of the current UI locale —
 *   this materialises the Requirement 6.12 / 19.3 separation between
 *   `ui_locale` and `outputLanguage` at the call site.
 * - The button is disabled while the request is in flight, so a user
 *   cannot accidentally double-spend their daily quota by
 *   double-clicking. Per Requirement 5.2 the Free_Plan cap is 3
 *   chapters per UTC day; double-counting would make that bound
 *   under-deliver the user.
 *
 * 429 quota-exhausted handling (Requirement 5.3, 6.3)
 * ----------------------------------------------------
 * The gateway maps the Free chapter-cap to HTTP 429 with
 *   `{ error: { code: 'free_chapter_quota_exhausted', resetAt,
 *               retryAfterSeconds }}`
 * and `Retry-After` header. The component renders a Vietnamese
 * message that names the exact reset moment in UTC ("Quota làm mới
 * lúc HH:mm UTC") so the user can plan around it without having to
 * convert from a relative seconds count. UTC is used verbatim because
 * the cap window is defined in UTC by design.md, not in the user's
 * local timezone.
 *
 * Other 4xx/5xx responses fall through to a generic error message
 * carrying the gateway's `error.message`. No retry, no token refresh
 * — those concerns belong to higher layers (`httpClient` will gain
 * those wrappers in later tasks).
 */

import { useState } from 'react';

import { httpFetch } from '../api/httpClient';
import { withOutputLanguage } from './outputLanguage';

/**
 * Subset of the server-side `StorySetupConfig` shape. The contracts
 * package is not yet wired into the web app, so we declare the
 * client-visible surface locally. Extra fields are passed through
 * verbatim by the gateway (Requirement 6.12).
 */
export interface CreateChapterConfigInput {
  niche?: string;
  customNiche?: string;
  seed?: string;
  title?: string;
  intensity?: number;
  dialogueRatio?: number;
  hookDensity?: number;
  presetLine?: string;
  presetStyle?: string;
  /**
   * Caller-supplied output language. Will be overridden by the
   * stored value from {@link withOutputLanguage} so the SPA's
   * single source of truth remains the output-language store.
   */
  outputLanguage?: string;
}

export interface CreateChapterButtonProps {
  /** Story setup config (niche, intensity, etc.). */
  config: CreateChapterConfigInput;
  /** 1-based chapter index to generate. */
  chapterIndex: number;
  /**
   * Hashed Device_Fingerprint to send in the request body
   * (Requirement 4.1). The same value is also attached as a header
   * by {@link httpFetch}; the body copy is what the server-side
   * `CreateStoryRequest` schema requires.
   */
  fingerprint: string;
  /** Endpoint override for tests. Defaults to `/stories`. */
  endpoint?: string;
  /** Visible label override. Defaults to `Tạo Chương`. */
  label?: string;
}

/** Wire-format error envelope returned by the gateway. */
interface ApiErrorEnvelope {
  error: {
    code?: string;
    message?: string;
    retryAfterSeconds?: number;
    resetAt?: string;
  };
}

/** Shape of a successful `POST /stories` response (single-chapter). */
export interface CreateChapterSuccess {
  storyId: string;
  streaming?: boolean;
  /**
   * For single-chapter Free runs the gateway may inline the freshly
   * generated chapter alongside the job id so the client can render
   * it without a follow-up SSE call. The component renders
   * `chapter.content` if present, otherwise falls back to a generic
   * acknowledgement keyed by `storyId`.
   */
  chapter?: {
    index?: number;
    content?: string;
  };
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; data: CreateChapterSuccess }
  | {
      kind: 'quota_exhausted';
      message: string;
      resetAt?: string;
    }
  | { kind: 'error'; message: string };

const QUOTA_CODE = 'free_chapter_quota_exhausted';
const FALLBACK_QUOTA_MESSAGE =
  'Bạn đã dùng hết quota chương miễn phí trong ngày hôm nay.';
const FALLBACK_ERROR_MESSAGE = 'Không thể tạo chương lúc này.';

/**
 * Render an ISO-UTC reset timestamp as a human-readable hint,
 * e.g. `Quota làm mới lúc 00:00 UTC`. Returns an empty string when
 * the input is missing or unparseable so the caller can decide
 * whether to render the suffix at all.
 */
export function formatResetAtHint(iso: string | undefined): string {
  if (typeof iso !== 'string' || iso.length === 0) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `Quota làm mới lúc ${hh}:${mm} UTC`;
}

async function readErrorEnvelope(
  res: Response,
): Promise<ApiErrorEnvelope | null> {
  try {
    const json = (await res.json()) as unknown;
    if (
      json !== null &&
      typeof json === 'object' &&
      'error' in json &&
      typeof (json as { error: unknown }).error === 'object' &&
      (json as { error: unknown }).error !== null
    ) {
      return json as ApiErrorEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

export function CreateChapterButton(
  props: CreateChapterButtonProps,
): JSX.Element {
  const {
    config,
    chapterIndex,
    fingerprint,
    endpoint = '/stories',
    label = 'Tạo Chương',
  } = props;
  const [state, setState] = useState<ViewState>({ kind: 'idle' });
  const inFlight = state.kind === 'loading';

  const handleClick = async (): Promise<void> => {
    if (inFlight) {
      return;
    }
    setState({ kind: 'loading' });

    // Attach the user's stored output language to the config so the
    // request always carries `config.outputLanguage`, regardless of
    // ui_locale. `withOutputLanguage` is the single source of truth.
    const enrichedConfig = withOutputLanguage(config);
    const body = {
      mode: 'single_chapter' as const,
      config: enrichedConfig,
      fingerprint,
      chapterIndex,
    };

    let res: Response;
    try {
      res = await httpFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      setState({ kind: 'error', message: FALLBACK_ERROR_MESSAGE });
      return;
    }

    if (res.status === 429) {
      const envelope = await readErrorEnvelope(res);
      const code = envelope?.error.code;
      if (code === QUOTA_CODE) {
        const resetAt = envelope?.error.resetAt;
        const baseMessage = envelope?.error.message ?? FALLBACK_QUOTA_MESSAGE;
        const next: ViewState = {
          kind: 'quota_exhausted',
          message: baseMessage,
        };
        if (typeof resetAt === 'string') {
          next.resetAt = resetAt;
        }
        setState(next);
        return;
      }
      // Other 429 codes (rate_limited, etc.) collapse to a generic error.
      setState({
        kind: 'error',
        message: envelope?.error.message ?? FALLBACK_ERROR_MESSAGE,
      });
      return;
    }

    if (!res.ok) {
      const envelope = await readErrorEnvelope(res);
      setState({
        kind: 'error',
        message: envelope?.error.message ?? FALLBACK_ERROR_MESSAGE,
      });
      return;
    }

    let data: CreateChapterSuccess;
    try {
      data = (await res.json()) as CreateChapterSuccess;
    } catch {
      setState({ kind: 'error', message: FALLBACK_ERROR_MESSAGE });
      return;
    }
    setState({ kind: 'success', data });
  };

  return (
    <div data-testid="create-chapter-root">
      <button
        type="button"
        data-testid="create-chapter-button"
        onClick={() => {
          void handleClick();
        }}
        disabled={inFlight}
        aria-busy={inFlight}
      >
        {inFlight ? 'Đang tạo chương…' : label}
      </button>

      {state.kind === 'success' && (
        <section
          data-testid="create-chapter-success"
          aria-live="polite"
        >
          {state.data.chapter?.content ? (
            <article data-testid="create-chapter-content">
              {state.data.chapter.content}
            </article>
          ) : (
            <p data-testid="create-chapter-content">
              Đã tạo chương (story id: {state.data.storyId}).
            </p>
          )}
        </section>
      )}

      {state.kind === 'quota_exhausted' && (
        <p
          data-testid="create-chapter-quota-message"
          role="alert"
        >
          {state.message}
          {(() => {
            const hint = formatResetAtHint(state.resetAt);
            return hint.length > 0 ? ` ${hint}` : '';
          })()}
        </p>
      )}

      {state.kind === 'error' && (
        <p data-testid="create-chapter-error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}

export default CreateChapterButton;
