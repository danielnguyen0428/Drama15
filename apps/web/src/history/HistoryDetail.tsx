/**
 * `HistoryDetail` — render a single Story_Job from history (Task 17.8).
 *
 * Validates: Requirements 10.2.
 *
 *   10.2  WHEN người dùng chọn một mục trong lịch sử, THE Web_Client
 *         SHALL gọi API_Gateway để lấy nội dung tổng quan, kế hoạch
 *         và chương tương ứng và phải hiển thị lại trên giao diện.
 *
 * The component fetches `GET /stories/:id` via `httpFetch` so the
 * `X-Client-Integrity` and `X-Device-Fingerprint` headers are
 * attached automatically (Requirements 4.1, 13.3). The response is
 * rendered in three tabs that mirror the live-streaming view used
 * during creation (`StoryStreamView`):
 *
 *   - `Tổng Quan` — `overview` text.
 *   - `Kế Hoạch`  — `plan` JSON pretty-printed.
 *   - `Chương`    — list of chapters with index / status / content.
 *
 * Rendering is presentation-only: there is no client-side mutation
 * of the detail payload. The "Xóa" interaction lives on the parent
 * `HistoryList` so list-level state (the row removal) and the
 * confirmation modal stay co-located with the row.
 */

import { useEffect, useState } from 'react';

import { httpFetch } from '../api/httpClient';

/** Tab identifier; mirrors the live `StoryStreamView` tabs. */
export type HistoryDetailTab = 'overview' | 'plan' | 'chapters';

/** Chapter projection within the detail payload. */
export interface HistoryChapter {
  storyId: string;
  /** 1..10 */
  index: number;
  status: 'pending' | 'streaming' | 'done' | 'failed';
  /** May be absent for chapters that have not yet been generated. */
  content?: string;
  updatedAt: string;
}

/**
 * Wire payload returned by `GET /stories/:id`. Mirrors the response
 * built in `apps/api/src/stories/history.ts#getOwnStoryDetail`. The
 * `userId` field is intentionally absent from the wire contract — the
 * gateway strips it before serialising.
 */
export interface HistoryDetailPayload {
  id: string;
  title: string | null;
  overview: string | null;
  plan: unknown;
  chapters: HistoryChapter[];
  status: string;
  createdAt: string;
}

const TAB_LABELS: Record<HistoryDetailTab, string> = {
  overview: 'Tổng Quan',
  plan: 'Kế Hoạch',
  chapters: 'Chương',
};

const TAB_ORDER: ReadonlyArray<HistoryDetailTab> = [
  'overview',
  'plan',
  'chapters',
];

export interface HistoryDetailProps {
  /** Story_Job id to fetch and render. */
  storyId: string;
  /** Optional callback invoked when the user clicks "Quay lại". */
  onBack?: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: HistoryDetailPayload }
  | { kind: 'error'; message: string };

/**
 * Render the `plan` JSON payload. The backend stores it as an opaque
 * JSONB blob so we cannot rely on a fixed shape. Pretty-print it via
 * `JSON.stringify` with 2-space indent for readability and surface a
 * placeholder when the field is absent.
 */
function renderPlan(plan: unknown): string {
  if (plan === null || plan === undefined) {
    return 'Chưa có kế hoạch.';
  }
  if (typeof plan === 'string') {
    return plan;
  }
  try {
    return JSON.stringify(plan, null, 2);
  } catch {
    return String(plan);
  }
}

export function HistoryDetail({
  storyId,
  onBack,
}: HistoryDetailProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<HistoryDetailTab>('overview');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    const load = async (): Promise<void> => {
      try {
        const response = await httpFetch(
          `/stories/${encodeURIComponent(storyId)}`,
          { method: 'GET' },
        );
        if (cancelled) return;
        if (!response.ok) {
          let message = 'Không thể tải truyện. Vui lòng thử lại.';
          try {
            const body = (await response.json()) as {
              error?: { message?: string };
            };
            if (body.error && typeof body.error.message === 'string') {
              message = body.error.message;
            }
          } catch {
            // non-JSON body: keep the default message.
          }
          if (!cancelled) setState({ kind: 'error', message });
          return;
        }
        const data = (await response.json()) as HistoryDetailPayload;
        if (!cancelled) setState({ kind: 'ready', data });
      } catch {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
          });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  return (
    <section data-testid="history-detail" aria-label="Chi tiết truyện">
      {onBack !== undefined ? (
        <button
          type="button"
          data-testid="history-detail-back"
          onClick={onBack}
        >
          ← Quay lại
        </button>
      ) : null}

      {state.kind === 'loading' ? (
        <p data-testid="history-detail-loading" role="status">
          Đang tải truyện…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p data-testid="history-detail-error" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.kind === 'ready' ? (
        <>
          <h2 data-testid="history-detail-title">
            {state.data.title ?? 'Truyện chưa có tiêu đề'}
          </h2>

          <div role="tablist" aria-label="Story sections">
            {TAB_ORDER.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                data-testid={`history-detail-tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`history-detail-panel-${tab}`}
                id={`history-detail-tab-${tab}-btn`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          <section
            id="history-detail-panel-overview"
            role="tabpanel"
            hidden={activeTab !== 'overview'}
            data-testid="history-detail-panel-overview"
            aria-labelledby="history-detail-tab-overview-btn"
          >
            <p>
              {state.data.overview !== null && state.data.overview.length > 0
                ? state.data.overview
                : 'Truyện chưa có tổng quan.'}
            </p>
          </section>

          <section
            id="history-detail-panel-plan"
            role="tabpanel"
            hidden={activeTab !== 'plan'}
            data-testid="history-detail-panel-plan"
            aria-labelledby="history-detail-tab-plan-btn"
          >
            <pre data-testid="history-detail-plan-content">
              {renderPlan(state.data.plan)}
            </pre>
          </section>

          <section
            id="history-detail-panel-chapters"
            role="tabpanel"
            hidden={activeTab !== 'chapters'}
            data-testid="history-detail-panel-chapters"
            aria-labelledby="history-detail-tab-chapters-btn"
          >
            {state.data.chapters.length === 0 ? (
              <p>Truyện chưa có chương nào.</p>
            ) : (
              <ol data-testid="history-detail-chapters">
                {state.data.chapters.map((chapter) => (
                  <li
                    key={chapter.index}
                    data-testid={`history-detail-chapter-${chapter.index}`}
                  >
                    <strong>Chương {chapter.index}</strong> — {chapter.status}
                    {chapter.content !== undefined &&
                    chapter.content.length > 0 ? (
                      <p
                        data-testid={`history-detail-chapter-${chapter.index}-content`}
                      >
                        {chapter.content}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

export default HistoryDetail;
