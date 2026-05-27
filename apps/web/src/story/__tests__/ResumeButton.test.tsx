/**
 * Unit tests for `ResumeButton`.
 *
 * Validates: Requirements 6.9, 7.7
 *
 * Coverage:
 *   - Hidden when story status is `running` / `paused` / `completed`
 *     (Requirement 6.9: button only appears after partial failure).
 *   - Visible when status is `partial` / `failed`.
 *   - Click POSTs `/stories/:id/resume` and the resumed chapter
 *     indices are surfaced via `role="status"` (Requirement 7.7 —
 *     resume only re-queues missing chapters).
 *   - Error response surfaces a Vietnamese message via `role="alert"`.
 *
 * The test stubs `globalThis.fetch` (which `httpFetch` wraps) so we
 * exercise the real header attachment path while keeping the test
 * hermetic.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetDeviceFingerprintCacheForTests } from '../../api/httpClient';
import { ResumeButton, type StoryStatus } from '../ResumeButton';

const STORY_ID = 'story_abc123';

describe('ResumeButton', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    __resetDeviceFingerprintCacheForTests();
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    __resetDeviceFingerprintCacheForTests();
    vi.restoreAllMocks();
  });

  describe('visibility (Requirement 6.9)', () => {
    const HIDDEN: ReadonlyArray<StoryStatus> = [
      'running',
      'paused',
      'completed',
    ];
    const VISIBLE: ReadonlyArray<StoryStatus> = ['partial', 'failed'];

    for (const status of HIDDEN) {
      it(`is hidden when status="${status}"`, () => {
        render(<ResumeButton storyId={STORY_ID} status={status} />);
        expect(screen.queryByTestId('resume-button')).toBeNull();
      });
    }

    for (const status of VISIBLE) {
      it(`is visible when status="${status}"`, () => {
        render(<ResumeButton storyId={STORY_ID} status={status} />);
        const btn = screen.getByTestId('resume-button');
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveTextContent('Tiếp tục từ chương còn thiếu');
      });
    }
  });

  describe('click triggers resume POST (Requirement 7.7)', () => {
    it('POSTs to /stories/:id/resume and shows resumed chapter indices', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storyId: STORY_ID,
            resumingIndices: [4, 7, 9],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const onResumed = vi.fn();
      render(
        <ResumeButton
          storyId={STORY_ID}
          status="partial"
          onResumed={onResumed}
        />,
      );

      fireEvent.click(screen.getByTestId('resume-button'));

      await waitFor(() => {
        expect(screen.getByTestId('resume-button-success')).toBeInTheDocument();
      });

      // Verifies the URL and method.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`/stories/${STORY_ID}/resume`);
      expect((init as RequestInit).method).toBe('POST');

      // Verifies the resumed indices are rendered, sorted ascending.
      const successRegion = screen.getByRole('status');
      expect(successRegion).toHaveTextContent('Chương 4');
      expect(successRegion).toHaveTextContent('Chương 7');
      expect(successRegion).toHaveTextContent('Chương 9');

      // Verifies the parent callback is fired with the same indices.
      expect(onResumed).toHaveBeenCalledWith([4, 7, 9]);

      // No error region rendered on a successful response.
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('also accepts the legacy `resumed` field name', async () => {
      // The Fastify handler currently emits `{ jobId, resumed }`.
      // The component must surface those indices as well.
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jobId: STORY_ID, resumed: [2, 1, 3] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      render(<ResumeButton storyId={STORY_ID} status="failed" />);
      fireEvent.click(screen.getByTestId('resume-button'));

      await waitFor(() => {
        expect(screen.getByTestId('resume-button-success')).toBeInTheDocument();
      });

      // Sorted ascending by the component, not the upstream order.
      const items = screen.getAllByRole('listitem').map((li) => li.textContent);
      expect(items).toEqual(['Chương 1', 'Chương 2', 'Chương 3']);
    });

    it('renders a friendly message when no chapters need re-queueing', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ storyId: STORY_ID, resumingIndices: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      render(<ResumeButton storyId={STORY_ID} status="partial" />);
      fireEvent.click(screen.getByTestId('resume-button'));

      await waitFor(() => {
        expect(screen.getByTestId('resume-button-success')).toBeInTheDocument();
      });

      expect(screen.getByRole('status')).toHaveTextContent(
        'Không còn chương nào cần tạo lại.',
      );
    });
  });

  describe('error path', () => {
    it('shows the error message returned by the gateway', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'conflict', message: 'Story_Job đang chạy' },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      render(<ResumeButton storyId={STORY_ID} status="failed" />);
      fireEvent.click(screen.getByTestId('resume-button'));

      await waitFor(() => {
        expect(screen.getByTestId('resume-button-error')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent('Story_Job đang chạy');
      // The success region must not appear after an error.
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('shows a generic error when fetch rejects', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('network down'));

      render(<ResumeButton storyId={STORY_ID} status="partial" />);
      fireEvent.click(screen.getByTestId('resume-button'));

      await waitFor(() => {
        expect(screen.getByTestId('resume-button-error')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
      );
    });

    it('falls back to a generic message when the body has no error.message', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('{}', {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      render(<ResumeButton storyId={STORY_ID} status="failed" />);
      fireEvent.click(screen.getByTestId('resume-button'));

      await waitFor(() => {
        expect(screen.getByTestId('resume-button-error')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Không thể tiếp tục truyện. Vui lòng thử lại.',
      );
    });
  });
});
