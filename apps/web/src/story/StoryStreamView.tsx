/**
 * StoryStreamView
 *
 * Renders the three story tabs (`Tổng Quan`, `Kế Hoạch`, `Chương`)
 * and a progress bar driven by an injected stream source. The
 * `streamSource` prop is an `AsyncIterable` of stage events emitted
 * by the API_Gateway SSE endpoint (`POST /story/full-stream`).
 *
 * Wire model — exactly 12 stage events make up a full Story_Job:
 *   1. `{ stage: 'overview' }`             → switches to tab 1
 *   2. `{ stage: 'plan' }`                 → switches to tab 2
 *   3..12. `{ stage: 'chapter', chapterIndex: 1..10 }` → tab 3
 *
 * Each event advances the progress bar by one twelfth and updates a
 * caption describing the current step (e.g. `Đang tạo chương 3 / 10`).
 *
 * The component intentionally consumes a generic `AsyncIterable` so
 * tests can inject a synthetic source. In production wiring the
 * caller adapts an `EventSource` or `fetch` ReadableStream into an
 * async iterable of `StoryStreamEvent`.
 *
 * Validates: Requirements 6.4, 6.7, 6.8.
 */

import { useEffect, useState } from 'react';

/** Stage label for one streaming event from the upstream Story_Job. */
export type StoryStreamStage = 'overview' | 'plan' | 'chapter';

/**
 * One stage event. Mirrors the server-side `StoryStreamEvent` in
 * `apps/api/src/stories/stream.ts`. `chapterIndex` is required when
 * `stage === 'chapter'` (1..10) and is otherwise unset.
 */
export interface StoryStreamEvent {
  stage: StoryStreamStage;
  chapterIndex?: number;
}

/**
 * Identifier for the active tab. Distinct from `StoryStreamStage`
 * because the third tab spans all 10 chapter events.
 */
export type StoryStreamTab = 'overview' | 'plan' | 'chapters';

export interface StoryStreamViewProps {
  /**
   * Source of stage events. Tests inject a synthetic async iterable;
   * production code adapts the SSE stream from `/story/full-stream`.
   */
  streamSource: AsyncIterable<StoryStreamEvent>;
  /**
   * Total number of stage events expected. Defaults to 12 (overview
   * + plan + 10 chapters), matching Requirement 6.4.
   */
  totalStages?: number;
  /**
   * Total chapters in the Story_Job. Defaults to 10, matching the
   * desktop parity contract (Requirement 6.4).
   */
  totalChapters?: number;
}

const TAB_LABELS = {
  overview: 'Tổng Quan',
  plan: 'Kế Hoạch',
  chapters: 'Chương',
} as const;

export function StoryStreamView({
  streamSource,
  totalStages = 12,
  totalChapters = 10,
}: StoryStreamViewProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<StoryStreamTab>('overview');
  const [stagesDone, setStagesDone] = useState<number>(0);
  const [currentChapter, setCurrentChapter] = useState<number>(0);
  const [lastStage, setLastStage] = useState<StoryStreamStage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const consume = async (): Promise<void> => {
      for await (const event of streamSource) {
        if (cancelled) {
          break;
        }
        setLastStage(event.stage);
        setStagesDone((n) => Math.min(n + 1, totalStages));
        if (event.stage === 'overview') {
          setActiveTab('overview');
        } else if (event.stage === 'plan') {
          setActiveTab('plan');
        } else {
          setActiveTab('chapters');
          if (typeof event.chapterIndex === 'number') {
            setCurrentChapter(event.chapterIndex);
          }
        }
      }
    };
    void consume().catch(() => {
      // Stream errors are surfaced by leaving the bar at its
      // last-known state; the parent panel renders the resume CTA
      // (Requirement 6.9) and is responsible for retry UX.
    });
    return () => {
      cancelled = true;
    };
  }, [streamSource, totalStages]);

  const progress = Math.min(
    100,
    Math.round((stagesDone / totalStages) * 100),
  );

  const caption = computeCaption({
    stagesDone,
    totalStages,
    lastStage,
    currentChapter,
    totalChapters,
  });

  return (
    <div data-testid="story-stream-view">
      <div role="tablist" aria-label="Story sections">
        <button
          type="button"
          role="tab"
          data-testid="tab-overview"
          aria-selected={activeTab === 'overview'}
          aria-controls="panel-overview"
          onClick={() => setActiveTab('overview')}
        >
          {TAB_LABELS.overview}
        </button>
        <button
          type="button"
          role="tab"
          data-testid="tab-plan"
          aria-selected={activeTab === 'plan'}
          aria-controls="panel-plan"
          onClick={() => setActiveTab('plan')}
        >
          {TAB_LABELS.plan}
        </button>
        <button
          type="button"
          role="tab"
          data-testid="tab-chapters"
          aria-selected={activeTab === 'chapters'}
          aria-controls="panel-chapters"
          onClick={() => setActiveTab('chapters')}
        >
          {TAB_LABELS.chapters}
        </button>
      </div>

      <section
        id="panel-overview"
        role="tabpanel"
        hidden={activeTab !== 'overview'}
        data-testid="panel-overview"
        aria-labelledby="tab-overview"
      >
        {TAB_LABELS.overview}
      </section>
      <section
        id="panel-plan"
        role="tabpanel"
        hidden={activeTab !== 'plan'}
        data-testid="panel-plan"
        aria-labelledby="tab-plan"
      >
        {TAB_LABELS.plan}
      </section>
      <section
        id="panel-chapters"
        role="tabpanel"
        hidden={activeTab !== 'chapters'}
        data-testid="panel-chapters"
        aria-labelledby="tab-chapters"
      >
        {TAB_LABELS.chapters} {currentChapter} / {totalChapters}
      </section>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Story generation progress"
        data-testid="progress-bar"
      >
        <div
          data-testid="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p data-testid="caption">{caption}</p>
    </div>
  );
}

interface CaptionInput {
  stagesDone: number;
  totalStages: number;
  lastStage: StoryStreamStage | null;
  currentChapter: number;
  totalChapters: number;
}

function computeCaption({
  stagesDone,
  totalStages,
  lastStage,
  currentChapter,
  totalChapters,
}: CaptionInput): string {
  if (stagesDone >= totalStages) {
    return 'Hoàn thành';
  }
  if (stagesDone === 0 || lastStage === null) {
    return 'Đang khởi động';
  }
  if (lastStage === 'overview') {
    return 'Đang tạo tổng quan';
  }
  if (lastStage === 'plan') {
    return 'Đang tạo kế hoạch';
  }
  return `Đang tạo chương ${currentChapter} / ${totalChapters}`;
}

export default StoryStreamView;
