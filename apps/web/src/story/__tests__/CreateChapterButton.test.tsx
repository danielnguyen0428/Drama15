/**
 * Unit tests for `CreateChapterButton` (Requirement 6.3).
 *
 * Covered cases:
 *   - Success path: 200 with `{ storyId, chapter }` renders the
 *     chapter body so the user sees the new content.
 *   - 429 + `error.code === 'free_chapter_quota_exhausted'` renders
 *     a Vietnamese reset-time hint built from `resetAt` (UTC).
 *   - The button is disabled while the request is in flight, so a
 *     user cannot double-spend their daily Free quota by
 *     double-clicking.
 *
 * The `httpClient` is stubbed at the module boundary because its
 * own behaviour (header attachment, fingerprint computation) is
 * already covered by `apps/web/src/api/__tests__/httpClient.test.ts`.
 */

import {
  act,
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
  type Mock,
} from 'vitest';

import { CreateChapterButton } from '../CreateChapterButton';
import { OUTPUT_LANGUAGE_STORAGE_KEY } from '../outputLanguage';

vi.mock('../../api/httpClient', () => ({
  httpFetch: vi.fn(),
}));

import { httpFetch } from '../../api/httpClient';

const httpFetchMock = httpFetch as unknown as Mock;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const baseProps = {
  config: { niche: 'billionaire', intensity: 0.7 },
  chapterIndex: 1,
  fingerprint: 'fp-test',
} as const;

describe('CreateChapterButton', () => {
  beforeEach(() => {
    httpFetchMock.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders the "Tạo Chương" button by default', () => {
    httpFetchMock.mockResolvedValue(jsonResponse(200, { storyId: 's1' }));
    render(<CreateChapterButton {...baseProps} />);
    const button = screen.getByTestId('create-chapter-button');
    expect(button).toHaveTextContent('Tạo Chương');
    expect(button).not.toBeDisabled();
  });

  it('posts mode=single_chapter with the locked output language and renders chapter content on success', async () => {
    // Vietnamese-only lock: even if a previous app version persisted
    // `'en'` to localStorage, the request body MUST carry
    // `outputLanguage: 'vietnamese'` so the server's
    // Vietnamese-tuned prompt pipeline is preserved.
    window.localStorage.setItem(OUTPUT_LANGUAGE_STORAGE_KEY, 'en');
    httpFetchMock.mockResolvedValue(
      jsonResponse(200, {
        storyId: 'story-123',
        streaming: false,
        chapter: { index: 1, content: 'Once upon a time…' },
      }),
    );

    render(<CreateChapterButton {...baseProps} />);
    fireEvent.click(screen.getByTestId('create-chapter-button'));

    await waitFor(() =>
      expect(screen.getByTestId('create-chapter-success')).toBeInTheDocument(),
    );

    expect(screen.getByTestId('create-chapter-content')).toHaveTextContent(
      'Once upon a time…',
    );

    // Verify request shape.
    expect(httpFetchMock).toHaveBeenCalledTimes(1);
    const call = httpFetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/stories');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      mode: 'single_chapter',
      config: {
        niche: 'billionaire',
        intensity: 0.7,
        outputLanguage: 'vietnamese',
      },
      fingerprint: 'fp-test',
      chapterIndex: 1,
    });
  });

  it('renders the reset-time hint when the gateway returns 429 free_chapter_quota_exhausted', async () => {
    httpFetchMock.mockResolvedValue(
      jsonResponse(429, {
        error: {
          code: 'free_chapter_quota_exhausted',
          message: 'Bạn đã hết quota chương Free hôm nay.',
          retryAfterSeconds: 3600,
          resetAt: '2025-01-02T00:00:00.000Z',
        },
      }),
    );

    render(<CreateChapterButton {...baseProps} />);
    fireEvent.click(screen.getByTestId('create-chapter-button'));

    await waitFor(() =>
      expect(
        screen.getByTestId('create-chapter-quota-message'),
      ).toBeInTheDocument(),
    );

    const msg = screen.getByTestId('create-chapter-quota-message');
    expect(msg).toHaveTextContent('Bạn đã hết quota chương Free hôm nay.');
    expect(msg).toHaveTextContent('Quota làm mới lúc 00:00 UTC');
    expect(msg).toHaveAttribute('role', 'alert');
  });

  it('disables the button while a request is in flight', async () => {
    let resolveFetch: ((res: Response) => void) | undefined;
    httpFetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<CreateChapterButton {...baseProps} />);
    const button = screen.getByTestId('create-chapter-button');
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    // After click but before the fetch resolves, the button must be
    // disabled so a user cannot double-spend Free quota by
    // double-clicking.
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Đang tạo chương…');

    // A second click while in flight must NOT issue a second request.
    fireEvent.click(button);
    expect(httpFetchMock).toHaveBeenCalledTimes(1);

    // Resolve the in-flight request and confirm the button re-enables.
    await act(async () => {
      resolveFetch?.(jsonResponse(200, { storyId: 'story-late' }));
    });

    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'false');
  });
});
