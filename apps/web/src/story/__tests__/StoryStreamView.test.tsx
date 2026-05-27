/**
 * Unit tests for {@link StoryStreamView}.
 *
 * Covers Requirements 6.4, 6.7, 6.8:
 *   - Three tabs (`Tổng Quan`, `Kế Hoạch`, `Chương`) render and the
 *     active tab tracks the current stage.
 *   - The progress bar advances once per stage event.
 *   - The caption updates per stage (overview → plan → chapter N/10).
 *   - After all 12 stages the progress bar hits 100%.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  StoryStreamView,
  type StoryStreamEvent,
} from '../StoryStreamView';

/**
 * A manually controlled async iterable so the test can step through
 * events one at a time and inspect intermediate component state.
 */
interface ControlledStream {
  stream: AsyncIterable<StoryStreamEvent>;
  push: (event: StoryStreamEvent) => Promise<void>;
  close: () => void;
}

function makeControlledStream(): ControlledStream {
  const buffer: StoryStreamEvent[] = [];
  let pendingResolve:
    | ((v: IteratorResult<StoryStreamEvent>) => void)
    | null = null;
  let closed = false;

  const stream: AsyncIterable<StoryStreamEvent> = {
    [Symbol.asyncIterator](): AsyncIterator<StoryStreamEvent> {
      return {
        next(): Promise<IteratorResult<StoryStreamEvent>> {
          const head = buffer.shift();
          if (head !== undefined) {
            return Promise.resolve({ value: head, done: false });
          }
          if (closed) {
            return Promise.resolve({
              value: undefined as unknown as StoryStreamEvent,
              done: true,
            });
          }
          return new Promise((resolve) => {
            pendingResolve = resolve;
          });
        },
      };
    },
  };

  const push = async (event: StoryStreamEvent): Promise<void> => {
    await act(async () => {
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve({ value: event, done: false });
      } else {
        buffer.push(event);
      }
      // Yield to the microtask queue so React processes the state
      // update triggered by the for-await loop body before the test
      // reads the DOM.
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const close = (): void => {
    closed = true;
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve({
        value: undefined as unknown as StoryStreamEvent,
        done: true,
      });
    }
  };

  return { stream, push, close };
}

function getProgress(): number {
  const bar = screen.getByTestId('progress-bar');
  return Number(bar.getAttribute('aria-valuenow'));
}

describe('StoryStreamView', () => {
  it('renders all three tabs with their Vietnamese labels', () => {
    const { stream, close } = makeControlledStream();
    render(<StoryStreamView streamSource={stream} />);

    expect(screen.getByTestId('tab-overview')).toHaveTextContent('Tổng Quan');
    expect(screen.getByTestId('tab-plan')).toHaveTextContent('Kế Hoạch');
    expect(screen.getByTestId('tab-chapters')).toHaveTextContent('Chương');

    close();
  });

  it('starts with progress 0% and a startup caption', () => {
    const { stream, close } = makeControlledStream();
    render(<StoryStreamView streamSource={stream} />);

    expect(getProgress()).toBe(0);
    expect(screen.getByTestId('caption')).toHaveTextContent('Đang khởi động');
    expect(screen.getByTestId('tab-overview')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    close();
  });

  it('switches active tab and progresses for the overview stage', async () => {
    const { stream, push, close } = makeControlledStream();
    render(<StoryStreamView streamSource={stream} />);

    await push({ stage: 'overview' });

    await waitFor(() => {
      expect(getProgress()).toBe(Math.round((1 / 12) * 100));
    });
    expect(screen.getByTestId('tab-overview')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('caption')).toHaveTextContent(
      'Đang tạo tổng quan',
    );

    close();
  });

  it('switches to the Kế Hoạch tab and updates caption when plan arrives', async () => {
    const { stream, push, close } = makeControlledStream();
    render(<StoryStreamView streamSource={stream} />);

    await push({ stage: 'overview' });
    await push({ stage: 'plan' });

    await waitFor(() => {
      expect(getProgress()).toBe(Math.round((2 / 12) * 100));
    });
    expect(screen.getByTestId('tab-plan')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('caption')).toHaveTextContent(
      'Đang tạo kế hoạch',
    );

    close();
  });

  it('switches to the Chương tab and reports the current chapter index', async () => {
    const { stream, push, close } = makeControlledStream();
    render(<StoryStreamView streamSource={stream} />);

    await push({ stage: 'overview' });
    await push({ stage: 'plan' });
    await push({ stage: 'chapter', chapterIndex: 1 });
    await push({ stage: 'chapter', chapterIndex: 2 });
    await push({ stage: 'chapter', chapterIndex: 3 });

    await waitFor(() => {
      expect(screen.getByTestId('tab-chapters')).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
    expect(screen.getByTestId('caption')).toHaveTextContent(
      'Đang tạo chương 3 / 10',
    );
    expect(getProgress()).toBe(Math.round((5 / 12) * 100));

    close();
  });

  it('advances the progress bar monotonically per stage event', async () => {
    const { stream, push, close } = makeControlledStream();
    render(<StoryStreamView streamSource={stream} />);

    const events: StoryStreamEvent[] = [
      { stage: 'overview' },
      { stage: 'plan' },
      ...Array.from({ length: 10 }, (_, i) => ({
        stage: 'chapter' as const,
        chapterIndex: i + 1,
      })),
    ];

    let previous = 0;
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i]!;
      await push(event);
      const expected = Math.round(((i + 1) / 12) * 100);
      await waitFor(() => {
        expect(getProgress()).toBe(expected);
      });
      expect(getProgress()).toBeGreaterThanOrEqual(previous);
      previous = getProgress();
    }

    close();
  });

  it('reaches 100% after all 12 stage events', async () => {
    const { stream, push, close } = makeControlledStream();
    render(<StoryStreamView streamSource={stream} />);

    await push({ stage: 'overview' });
    await push({ stage: 'plan' });
    for (let i = 1; i <= 10; i += 1) {
      await push({ stage: 'chapter', chapterIndex: i });
    }

    await waitFor(() => {
      expect(getProgress()).toBe(100);
    });
    expect(screen.getByTestId('caption')).toHaveTextContent('Hoàn thành');
    expect(screen.getByTestId('tab-chapters')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    close();
  });

  it('caps progress at 100% if more events arrive than expected', async () => {
    const { stream, push, close } = makeControlledStream();
    render(
      <StoryStreamView streamSource={stream} totalStages={2} />,
    );

    await push({ stage: 'overview' });
    await push({ stage: 'plan' });
    await push({ stage: 'chapter', chapterIndex: 1 });

    await waitFor(() => {
      expect(getProgress()).toBe(100);
    });

    close();
  });
});
