/**
 * `ResumeButton` — "Tiếp tục từ chương còn thiếu".
 *
 * Validates: Requirements 6.9, 7.7
 *
 *   6.9  IF Story_Job dừng giữa chừng do lỗi mạng hoặc lỗi server,
 *        THEN THE Web_Client SHALL hiển thị nút `Tiếp tục từ chương
 *        còn thiếu` và khi người dùng bấm nút này, THE API_Gateway
 *        SHALL tiếp tục Story_Job từ chương đầu tiên chưa có nội
 *        dung mà không trừ thêm quota.
 *   7.7  WHEN người dùng bấm `Tiếp tục từ chương còn thiếu`, THE
 *        API_Gateway SHALL kiểm tra Story_Job và phải sinh ra các
 *        chương còn trống mà không tạo lại các chương đã hoàn tất.
 *
 * Visibility rule (Requirement 6.9): the button is rendered ONLY
 * when the parent Story_Job's status is `'partial'` or `'failed'`.
 * For `'running'`, `'paused'`, or `'completed'` the component
 * renders nothing — there is nothing to resume.
 *
 * Behaviour:
 *   - On click, POST `/stories/:storyId/resume` via `httpFetch`
 *     (which already attaches `X-Client-Integrity` and
 *     `X-Device-Fingerprint`).
 *   - On 2xx, surfaces the chapter indices the upstream re-queued.
 *     The success message is announced via `role="status"` so it is
 *     visible to assistive technologies and to E2E tests.
 *   - On non-2xx or network failure, surfaces a Vietnamese error
 *     message via `role="alert"` and re-enables the button.
 *
 * The component does not know about quota; the backend is solely
 * responsible for the no-quota-on-resume rule (see
 * `apps/api/src/stories/resume.ts`). The UI just consumes whichever
 * indices the gateway re-queues.
 */

import { useCallback, useState } from 'react';

import { httpFetch } from '../api/httpClient';

/** Same status enum as `StoryDetail.status` in `@drama15/contracts`. */
export type StoryStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'partial';

/** A status that warrants showing the resume button. */
const RESUMABLE_STATUSES: ReadonlySet<StoryStatus> = new Set([
  'partial',
  'failed',
]);

/**
 * Resume endpoint response. The canonical contract names the field
 * `resumingIndices` (see `packages/contracts/src/stories.ts`); the
 * Fastify handler currently emits `{ jobId, resumed }`. Accept both
 * so the component is forward-compatible whichever shape the
 * gateway settles on.
 */
interface ResumeResponseBody {
  storyId?: string;
  jobId?: string;
  resumingIndices?: number[];
  resumed?: number[];
  error?: { code?: string; message?: string };
}

export interface ResumeButtonProps {
  /** Story_Job id, used as the `:id` path param. */
  storyId: string;
  /**
   * Current story status. The button is hidden unless this is
   * `'partial'` or `'failed'`.
   */
  status: StoryStatus;
  /**
   * Optional callback invoked with the chapter indices the gateway
   * re-queued. Lets the parent refresh its progress UI.
   */
  onResumed?: (indices: number[]) => void;
  /** Stable id for the button; useful for E2E selectors. */
  id?: string;
}

type RequestState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; resumedIndices: number[] }
  | { kind: 'error'; message: string };

/**
 * Pull the resumed indices out of a heterogeneous response body.
 * Returns `[]` when neither field is present.
 */
function pickResumedIndices(body: ResumeResponseBody): number[] {
  const raw = body.resumingIndices ?? body.resumed ?? [];
  // Defensive: tolerate stringified numbers but reject non-finite junk.
  const cleaned = raw
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((n) => Number.isFinite(n));
  // Sort ascending for a stable display order. The gateway already
  // does this, but the UI re-sorts so we never depend on it.
  return [...cleaned].sort((a, b) => a - b);
}

export function ResumeButton({
  storyId,
  status,
  onResumed,
  id = 'resume-button',
}: ResumeButtonProps): JSX.Element | null {
  const [state, setState] = useState<RequestState>({ kind: 'idle' });

  const handleClick = useCallback(async () => {
    if (state.kind === 'loading') return;
    setState({ kind: 'loading' });

    try {
      const response = await httpFetch(
        `/stories/${encodeURIComponent(storyId)}/resume`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId }),
        },
      );

      let body: ResumeResponseBody = {};
      try {
        body = (await response.json()) as ResumeResponseBody;
      } catch {
        // Non-JSON body is acceptable on transport errors; fall through.
      }

      if (!response.ok) {
        const message =
          body.error?.message ?? 'Không thể tiếp tục truyện. Vui lòng thử lại.';
        setState({ kind: 'error', message });
        return;
      }

      const resumedIndices = pickResumedIndices(body);
      setState({ kind: 'success', resumedIndices });
      onResumed?.(resumedIndices);
    } catch {
      setState({
        kind: 'error',
        message: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
      });
    }
  }, [state.kind, storyId, onResumed]);

  if (!RESUMABLE_STATUSES.has(status)) {
    return null;
  }

  const isLoading = state.kind === 'loading';

  return (
    <div data-testid="resume-button-root">
      <button
        id={id}
        type="button"
        data-testid="resume-button"
        onClick={handleClick}
        disabled={isLoading}
        aria-busy={isLoading || undefined}
      >
        Tiếp tục từ chương còn thiếu
      </button>

      {state.kind === 'success' ? (
        <div role="status" data-testid="resume-button-success">
          {state.resumedIndices.length === 0 ? (
            <span>Không còn chương nào cần tạo lại.</span>
          ) : (
            <>
              <span>Đã đưa các chương sau vào hàng đợi:</span>
              <ul data-testid="resume-button-indices">
                {state.resumedIndices.map((idx) => (
                  <li key={idx} data-testid={`resume-index-${idx}`}>
                    Chương {idx}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div role="alert" data-testid="resume-button-error">
          {state.message}
        </div>
      ) : null}
    </div>
  );
}

export default ResumeButton;
