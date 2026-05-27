/**
 * Unit tests for `RewritePanel`.
 *
 * Validates: Requirements 7.1, 7.2, 7.3 (and 7.6 for the reset-time hint).
 *
 *   7.1 / 7.2  All six closed-set rewrite modes are rendered in the
 *              dropdown so the user can pick any of them.
 *   7.3        Submitting the form posts the request to
 *              `/stories/:id/rewrite` with `mode`, `chapterIndex`, and
 *              the optional `instruction`, and the new chapter
 *              `content` is rendered when the gateway responds 200.
 *   7.6        On HTTP 429 with `error.code === 'rewrite_quota_exhausted'`,
 *              the panel surfaces the `resetAt` hint from the canonical
 *              error envelope.
 *
 * The tests stub the global `fetch()` so `httpFetch` runs end-to-end
 * (including its `X-Client-Integrity` and `X-Device-Fingerprint`
 * header attachment), and we inspect the captured request to assert
 * the body contract.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import {
  __resetDeviceFingerprintCacheForTests,
} from '../../api/httpClient';
import { REWRITE_MODES, RewritePanel } from '../RewritePanel';

type FetchMock = ReturnType<typeof vi.fn>;

interface FetchCallInit extends RequestInit {
  body?: BodyInit | null;
}

function lastFetchCall(fetchMock: FetchMock): {
  url: string;
  init: FetchCallInit;
} {
  const calls = fetchMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const [url, init] = calls[calls.length - 1] as [
    RequestInfo | URL,
    FetchCallInit | undefined,
  ];
  return {
    url: typeof url === 'string' ? url : url.toString(),
    init: init ?? {},
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RewritePanel', () => {
  let fetchMock: FetchMock;
  let originalFetch: typeof globalThis.fetch | undefined;
  let consoleErrorSpy: MockInstance | undefined;

  beforeEach(() => {
    __resetDeviceFingerprintCacheForTests();
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    // Keep test output clean if React logs an act() warning during async updates.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    __resetDeviceFingerprintCacheForTests();
    consoleErrorSpy?.mockRestore();
  });

  it('renders all six closed-set rewrite modes (Requirement 7.2)', () => {
    render(<RewritePanel storyId="story-abc" />);

    const select = screen.getByTestId('rewrite-mode') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((opt) => opt.value);

    expect(optionValues).toEqual([
      'full_chapter',
      'opening_hook',
      'closing_beat',
      'dialogue_tone',
      'class_humiliation',
      'retaliation_sharpness',
    ]);
    expect(optionValues).toHaveLength(REWRITE_MODES.length);
    for (const mode of REWRITE_MODES) {
      expect(
        screen.getByTestId(`rewrite-mode-option-${mode}`),
      ).toBeInTheDocument();
    }
  });

  it('renders chapter indices 1..10', () => {
    render(<RewritePanel storyId="story-abc" />);
    const select = screen.getByTestId(
      'rewrite-chapter-index',
    ) as HTMLSelectElement;
    const values = Array.from(select.options).map((opt) => opt.value);
    expect(values).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('submits the chosen mode, chapter, and instruction to /stories/:id/rewrite (Requirement 7.3)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        storyId: 'story-abc',
        chapterIndex: 4,
        content: 'New chapter body.',
        updatedAt: '2025-01-15T10:00:00.000Z',
      }),
    );

    render(<RewritePanel storyId="story-abc" />);

    fireEvent.change(screen.getByTestId('rewrite-mode'), {
      target: { value: 'class_humiliation' },
    });
    fireEvent.change(screen.getByTestId('rewrite-chapter-index'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByTestId('rewrite-instruction'), {
      target: { value: '  Sharper dialogue.  ' },
    });

    fireEvent.click(screen.getByTestId('rewrite-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const { url, init } = lastFetchCall(fetchMock);
    expect(url).toBe('/stories/story-abc/rewrite');
    expect(init.method).toBe('POST');

    const headers = init.headers as Headers;
    expect(headers).toBeInstanceOf(Headers);
    expect(headers.get('Content-Type')).toBe('application/json');

    expect(typeof init.body).toBe('string');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      mode: 'class_humiliation',
      chapterIndex: 4,
      // The component trims whitespace before forwarding.
      instruction: 'Sharper dialogue.',
    });
  });

  it('omits `instruction` when the textarea is blank or whitespace-only', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        storyId: 'story-xyz',
        chapterIndex: 1,
        content: 'Body.',
        updatedAt: '2025-01-15T10:00:00.000Z',
      }),
    );

    render(<RewritePanel storyId="story-xyz" />);

    fireEvent.change(screen.getByTestId('rewrite-instruction'), {
      target: { value: '   \n  ' },
    });
    fireEvent.click(screen.getByTestId('rewrite-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const { init } = lastFetchCall(fetchMock);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ mode: 'full_chapter', chapterIndex: 1 });
    expect(body).not.toHaveProperty('instruction');
  });

  it('renders the new chapter content on a 200 response (Requirement 7.3)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        storyId: 'story-abc',
        chapterIndex: 2,
        content: 'A brand new chapter body, freshly rewritten.',
        updatedAt: '2025-01-15T10:00:00.000Z',
      }),
    );

    render(<RewritePanel storyId="story-abc" />);

    fireEvent.change(screen.getByTestId('rewrite-chapter-index'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByTestId('rewrite-submit'));

    const content = await screen.findByTestId('rewrite-result-content');
    expect(content).toHaveTextContent(
      'A brand new chapter body, freshly rewritten.',
    );
    expect(screen.getByTestId('rewrite-result-title')).toHaveTextContent(
      'Chương 2',
    );
    expect(screen.getByTestId('rewrite-result-updated-at')).toHaveTextContent(
      '2025-01-15T10:00:00.000Z',
    );
    // No error block should be visible on a successful rewrite.
    expect(screen.queryByTestId('rewrite-error')).not.toBeInTheDocument();
  });

  it('surfaces the reset-time hint on 429 rewrite_quota_exhausted (Requirement 7.6)', async () => {
    const resetAt = '2025-01-16T00:00:00.000Z';
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, {
        error: {
          code: 'rewrite_quota_exhausted',
          message: 'Daily rewrite quota exhausted.',
          retryAfterSeconds: 3600,
          resetAt,
          requestId: 'req-1',
        },
      }),
    );

    render(<RewritePanel storyId="story-abc" />);
    fireEvent.click(screen.getByTestId('rewrite-submit'));

    const hint = await screen.findByTestId('rewrite-quota-reset-hint');
    expect(hint).toHaveTextContent(resetAt);
    expect(screen.getByTestId('rewrite-error-message')).toHaveTextContent(
      'Daily rewrite quota exhausted.',
    );
    // No success body should appear when the request fails.
    expect(screen.queryByTestId('rewrite-result')).not.toBeInTheDocument();
  });

  it('does not show the reset-time hint for non-quota errors', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, {
        error: {
          code: 'rate_limited',
          message: 'Slow down.',
          retryAfterSeconds: 5,
        },
      }),
    );

    render(<RewritePanel storyId="story-abc" />);
    fireEvent.click(screen.getByTestId('rewrite-submit'));

    await screen.findByTestId('rewrite-error-message');
    expect(
      screen.queryByTestId('rewrite-quota-reset-hint'),
    ).not.toBeInTheDocument();
  });

  it('encodes the storyId in the URL path', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        storyId: 'a/b c',
        chapterIndex: 1,
        content: '',
        updatedAt: '2025-01-15T10:00:00.000Z',
      }),
    );

    render(<RewritePanel storyId="a/b c" />);
    fireEvent.click(screen.getByTestId('rewrite-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const { url } = lastFetchCall(fetchMock);
    expect(url).toBe('/stories/a%2Fb%20c/rewrite');
  });
});
