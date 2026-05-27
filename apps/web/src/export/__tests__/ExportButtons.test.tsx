/**
 * Unit tests for `ExportButtons`.
 *
 * Validates: Requirements 11.1, 11.2
 *
 * Coverage:
 *   - Each button POSTs the correct endpoint
 *     (`/stories/:id/export/markdown` and `/stories/:id/export/pdf`).
 *   - Markdown success triggers a download via a synthesised anchor
 *     with `download` (Requirement 11.1: file `.zip` is downloaded).
 *   - PDF success opens the signed URL in a new tab with
 *     `noopener,noreferrer` (Requirement 11.2: signed URL is the
 *     download target).
 *   - Error responses surface the gateway message via `role="alert"`.
 *   - Network failure surfaces a generic Vietnamese message.
 *
 * The test stubs `globalThis.fetch` (which `httpFetch` wraps) so the
 * real header-attachment path runs while the test stays hermetic.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetDeviceFingerprintCacheForTests } from '../../api/httpClient';
import { ExportButtons, triggerDownload } from '../ExportButtons';

const STORY_ID = 'story_abc123';
const SIGNED_MD_URL =
  'https://storage.example/exports/story_abc123.zip?sig=abc';
const SIGNED_EPUB_URL =
  'https://storage.example/exports/story_abc123.epub?sig=ghi';
const SIGNED_PDF_URL =
  'https://storage.example/exports/story_abc123.pdf?sig=def';

/**
 * Helper: extract the pathname from a fetch call URL. `httpFetch`
 * may prepend the API base URL (e.g. `https://api.vibify.work`) when
 * `VITE_API_URL` is set, so we normalise to just the path for
 * assertions.
 */
function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

describe('ExportButtons', () => {
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

  describe('rendering', () => {
    it('renders both buttons with the spec-mandated Vietnamese labels', () => {
      render(<ExportButtons storyId={STORY_ID} />);

      const md = screen.getByTestId('export-markdown-button');
      const pdf = screen.getByTestId('export-pdf-button');

      expect(md).toHaveTextContent('Lưu Từng Chương .md');
      expect(pdf).toHaveTextContent('Xuất PDF Cả Truyện');

      // No error visible by default.
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('Markdown export (Requirement 11.1)', () => {
    it('POSTs /stories/:id/export/markdown and triggers a download via a hidden anchor', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: SIGNED_MD_URL,
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      // Spy on the anchor click that `triggerDownload` synthesises
      // and capture the `this` it was bound to so we can inspect the
      // anchor element after the click resolved (the helper removes
      // it from the DOM in `finally`).
      let clickedAnchor: HTMLAnchorElement | null = null;
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
          clickedAnchor = this;
        });

      render(<ExportButtons storyId={STORY_ID} />);
      fireEvent.click(screen.getByTestId('export-markdown-button'));

      await waitFor(() => {
        expect(clickSpy).toHaveBeenCalledTimes(1);
      });

      // Verifies the URL and method.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(extractPath(url as string)).toBe(`/stories/${STORY_ID}/export/markdown`);
      expect((init as RequestInit).method).toBe('POST');

      // The anchor that was clicked must point at the signed URL and
      // carry `download` (Requirement 11.1: file is downloaded, not
      // navigated to).
      expect(clickedAnchor).not.toBeNull();
      const lastAnchor = clickedAnchor as unknown as HTMLAnchorElement;
      expect(lastAnchor.getAttribute('href')).toBe(SIGNED_MD_URL);
      expect(lastAnchor.hasAttribute('download')).toBe(true);

      // No popup attempted for the markdown flow.
      // (We do not pass `windowOpen`; rely on the absence of any error.)
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows the gateway error message when the markdown export fails', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'forbidden', message: 'Không có quyền xuất truyện' },
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      render(<ExportButtons storyId={STORY_ID} />);
      fireEvent.click(screen.getByTestId('export-markdown-button'));

      await waitFor(() => {
        expect(screen.getByTestId('export-error')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Không có quyền xuất truyện',
      );
    });
  });

  describe('PDF export (Requirement 11.2)', () => {
    it('POSTs /stories/:id/export/pdf and opens the signed URL in a new tab', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: SIGNED_PDF_URL,
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const windowOpen = vi.fn().mockReturnValue(null);

      render(<ExportButtons storyId={STORY_ID} windowOpen={windowOpen} />);
      fireEvent.click(screen.getByTestId('export-pdf-button'));

      await waitFor(() => {
        expect(windowOpen).toHaveBeenCalledTimes(1);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(extractPath(url as string)).toBe(`/stories/${STORY_ID}/export/pdf`);
      expect((init as RequestInit).method).toBe('POST');

      // Verify the popup target and the security flags. The third arg
      // must include `noopener` and `noreferrer` so the opened tab
      // cannot reach back into the SPA via `window.opener`.
      const [openedUrl, target, features] = windowOpen.mock.calls[0]!;
      expect(openedUrl).toBe(SIGNED_PDF_URL);
      expect(target).toBe('_blank');
      expect(features).toContain('noopener');
      expect(features).toContain('noreferrer');
    });

    it('shows a generic error when the PDF export fetch rejects', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('network down'));
      const windowOpen = vi.fn();

      render(<ExportButtons storyId={STORY_ID} windowOpen={windowOpen} />);
      fireEvent.click(screen.getByTestId('export-pdf-button'));

      await waitFor(() => {
        expect(screen.getByTestId('export-error')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
      );

      // Network failure must not have triggered the popup path.
      expect(windowOpen).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when the body has no error.message', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('{}', {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      render(<ExportButtons storyId={STORY_ID} windowOpen={vi.fn()} />);
      fireEvent.click(screen.getByTestId('export-pdf-button'));

      await waitFor(() => {
        expect(screen.getByTestId('export-error')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Không thể xuất truyện. Vui lòng thử lại.',
      );
    });
  });

  describe('EPUB export (Requirement 8)', () => {
    it('renders the EPUB button with text "Xuất EPUB"', () => {
      render(<ExportButtons storyId={STORY_ID} />);

      const epub = screen.getByTestId('export-epub-button');
      expect(epub).toHaveTextContent('Xuất EPUB');
    });

    it('POSTs /stories/:id/export/epub and triggers a download on success', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: SIGNED_EPUB_URL,
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      // Spy on the anchor click that `triggerDownload` synthesises.
      let clickedAnchor: HTMLAnchorElement | null = null;
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
          clickedAnchor = this;
        });

      render(<ExportButtons storyId={STORY_ID} />);
      fireEvent.click(screen.getByTestId('export-epub-button'));

      await waitFor(() => {
        expect(clickSpy).toHaveBeenCalledTimes(1);
      });

      // Verifies the URL and method.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(extractPath(url as string)).toBe(`/stories/${STORY_ID}/export/epub`);
      expect((init as RequestInit).method).toBe('POST');

      // The anchor that was clicked must point at the signed URL and
      // carry `download` (EPUB is downloaded, not opened in a tab).
      expect(clickedAnchor).not.toBeNull();
      const lastAnchor = clickedAnchor as unknown as HTMLAnchorElement;
      expect(lastAnchor.getAttribute('href')).toBe(SIGNED_EPUB_URL);
      expect(lastAnchor.hasAttribute('download')).toBe(true);

      // No error visible.
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows the gateway error message when the EPUB export fails', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'invalid_request', message: 'Story has no exportable content' },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      render(<ExportButtons storyId={STORY_ID} />);
      fireEvent.click(screen.getByTestId('export-epub-button'));

      await waitFor(() => {
        expect(screen.getByTestId('export-error')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Story has no exportable content',
      );
    });

    it('shows a generic error when the EPUB export fetch rejects (network failure)', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('network down'));

      render(<ExportButtons storyId={STORY_ID} />);
      fireEvent.click(screen.getByTestId('export-epub-button'));

      await waitFor(() => {
        expect(screen.getByTestId('export-error')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
      );
    });

    it('shows loading state "Đang xuất EPUB…" on the EPUB button during export', async () => {
      // Use a deferred promise so we can inspect the loading state
      // before the fetch resolves.
      let resolveFetch!: (value: Response) => void;
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      );

      render(<ExportButtons storyId={STORY_ID} />);
      fireEvent.click(screen.getByTestId('export-epub-button'));

      // While in flight, the button text should change.
      await waitFor(() => {
        expect(screen.getByTestId('export-epub-button')).toHaveTextContent(
          'Đang xuất EPUB…',
        );
      });

      // Resolve the fetch to clean up.
      resolveFetch(
        new Response(
          JSON.stringify({
            url: SIGNED_EPUB_URL,
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      // After resolution, the button text reverts.
      await waitFor(() => {
        expect(screen.getByTestId('export-epub-button')).toHaveTextContent(
          'Xuất EPUB',
        );
      });
    });

    it('disables all buttons while the EPUB export is in flight', async () => {
      let resolveFetch!: (value: Response) => void;
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      );

      render(<ExportButtons storyId={STORY_ID} />);
      fireEvent.click(screen.getByTestId('export-epub-button'));

      // All three buttons should be disabled while in flight.
      await waitFor(() => {
        expect(screen.getByTestId('export-markdown-button')).toBeDisabled();
        expect(screen.getByTestId('export-epub-button')).toBeDisabled();
        expect(screen.getByTestId('export-pdf-button')).toBeDisabled();
      });

      // Resolve the fetch to clean up.
      resolveFetch(
        new Response(
          JSON.stringify({
            url: SIGNED_EPUB_URL,
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      // After resolution, buttons should be re-enabled.
      await waitFor(() => {
        expect(screen.getByTestId('export-markdown-button')).not.toBeDisabled();
        expect(screen.getByTestId('export-epub-button')).not.toBeDisabled();
        expect(screen.getByTestId('export-pdf-button')).not.toBeDisabled();
      });
    });
  });

  describe('triggerDownload helper', () => {
    it('appends an anchor with download set, clicks it, then removes it', () => {
      const append = vi.spyOn(document.body, 'appendChild');
      const remove = vi.spyOn(document.body, 'removeChild');
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');

      triggerDownload('https://storage.example/file.zip');

      expect(click).toHaveBeenCalledTimes(1);
      expect(append).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);

      // The anchor passed to `appendChild` carries the URL + download.
      const anchor = append.mock.calls[0]![0] as HTMLAnchorElement;
      expect(anchor.tagName).toBe('A');
      expect(anchor.getAttribute('href')).toBe(
        'https://storage.example/file.zip',
      );
      expect(anchor.hasAttribute('download')).toBe(true);
    });
  });
});
