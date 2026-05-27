/**
 * Unit tests for {@link VoicePanel} (Task 17.7).
 *
 * Covers Requirements 9.1, 9.3, 9.4, 9.7, 9.10:
 *
 *   9.1   The panel renders a Voice ID picker and speed / pitch inputs.
 *   9.3   On mount the panel issues `GET /voices` and populates the
 *         dropdown from the response.
 *   9.4   "Bắt đầu Voice" POSTs to `/stories/:storyId/voice` with the
 *         user-selected `voiceId`, `speed`, and `pitch`.
 *   9.7   Pause / Resume / Stop POST to `/voice/:id/pause|resume|stop`,
 *         and each chapter row carries its own "Thử lại" button that
 *         POSTs to `/voice/:id/chapter/:idx/retry`.
 *   9.10  Upstream-host fragments (anything containing `internal`,
 *         `drama15`, or `.local`) are filtered out of any error
 *         message rendered to the DOM. The pattern matches the host
 *         shape stripped by `apps/api/src/gateway/upstreamProxy.ts`,
 *         so a proxy regression cannot leak host info into the SPA.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import { __resetDeviceFingerprintCacheForTests } from '../../api/httpClient';
import { sanitizeUpstreamLeak, VoicePanel } from '../VoicePanel';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

function captureCall(args: Parameters<typeof fetch>): FetchCall {
  const [input, init] = args;
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
  const method = (init?.method ?? 'GET').toUpperCase();
  let body: unknown = undefined;
  if (typeof init?.body === 'string') {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }
  return { url, method, body };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: Mock<typeof fetch>;
let originalFetch: typeof globalThis.fetch | undefined;

const SAMPLE_VOICES = [
  { id: 'voice_alpha', name: 'Alpha' },
  { id: 'voice_beta', name: 'Beta' },
];

beforeEach(() => {
  __resetDeviceFingerprintCacheForTests();
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.endsWith('/voices')) {
      return jsonResponse({ voices: SAMPLE_VOICES }, 200);
    }
    return jsonResponse({}, 200);
  }) as unknown as Mock<typeof fetch>;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
  __resetDeviceFingerprintCacheForTests();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Voice list fetch (Requirement 9.3)
// ---------------------------------------------------------------------------

describe('VoicePanel — voices populate from GET /voices (Requirement 9.3)', () => {
  it('issues GET /voices on mount and renders each voice in the dropdown', async () => {
    render(<VoicePanel storyId="story_1" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const firstCall = captureCall(fetchMock.mock.calls[0]!);
    expect(firstCall.url).toBe('/voices');
    expect(firstCall.method).toBe('GET');

    await waitFor(() => {
      expect(screen.getByTestId('voice-option-voice_alpha')).toBeInTheDocument();
    });
    expect(screen.getByTestId('voice-option-voice_beta')).toBeInTheDocument();
    const select = screen.getByTestId('voice-id-select') as HTMLSelectElement;
    expect(select.value).toBe('voice_alpha');
  });

  it('renders speed and pitch number inputs (Requirement 9.1)', async () => {
    render(<VoicePanel storyId="story_1" />);

    await waitFor(() => {
      expect(screen.getByTestId('voice-id-select')).not.toBeDisabled();
    });

    const speed = screen.getByTestId('voice-speed') as HTMLInputElement;
    const pitch = screen.getByTestId('voice-pitch') as HTMLInputElement;
    expect(speed.type).toBe('number');
    expect(pitch.type).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Create flow (Requirement 9.4)
// ---------------------------------------------------------------------------

describe('VoicePanel — start flow (Requirement 9.4)', () => {
  it('POSTs to /stories/:storyId/voice with voiceId, speed, and pitch', async () => {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url.endsWith('/voices')) {
        return jsonResponse({ voices: SAMPLE_VOICES }, 200);
      }
      if (url === '/stories/story_42/voice') {
        return jsonResponse(
          { voiceJobId: 'voice_job_1', paidQuotaReserved: true },
          201,
        );
      }
      return jsonResponse({}, 200);
    });

    render(<VoicePanel storyId="story_42" />);

    await waitFor(() => {
      expect(screen.getByTestId('voice-option-voice_beta')).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByTestId('voice-id-select') as HTMLSelectElement,
      { target: { value: 'voice_beta' } },
    );
    fireEvent.change(screen.getByTestId('voice-speed') as HTMLInputElement, {
      target: { value: '1.2' },
    });
    fireEvent.change(screen.getByTestId('voice-pitch') as HTMLInputElement, {
      target: { value: '-0.5' },
    });

    fireEvent.click(screen.getByTestId('voice-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('voice-job-view')).toBeInTheDocument();
    });

    // Find the create call (it's the second one after GET /voices).
    const createCall = fetchMock.mock.calls
      .map(captureCall)
      .find((c) => c.url === '/stories/story_42/voice' && c.method === 'POST');
    expect(createCall).toBeDefined();
    expect(createCall!.body).toEqual({
      voiceId: 'voice_beta',
      speed: 1.2,
      pitch: -0.5,
    });

    // The job view replaces the form once the Voice_Job exists.
    expect(screen.queryByTestId('voice-form')).toBeNull();
    // 10 chapter rows exist (Requirement 9.7 — per-chapter progress).
    for (let i = 1; i <= 10; i++) {
      expect(screen.getByTestId(`voice-chapter-${i}`)).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Control plane (Requirement 9.7)
// ---------------------------------------------------------------------------

/**
 * Helper that drives the panel from the create form into the running
 * job view. Returns the `voiceJobId` so each test can assert against
 * the same id deterministically.
 */
async function startJob(voiceJobId: string): Promise<string> {
  fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.endsWith('/voices')) {
      return jsonResponse({ voices: SAMPLE_VOICES }, 200);
    }
    if (url === '/stories/story_x/voice') {
      return jsonResponse(
        { voiceJobId, paidQuotaReserved: true },
        201,
      );
    }
    return jsonResponse({}, 200);
  });

  render(<VoicePanel storyId="story_x" />);
  await waitFor(() => {
    expect(screen.getByTestId('voice-option-voice_alpha')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId('voice-submit'));
  await waitFor(() => {
    expect(screen.getByTestId('voice-job-view')).toBeInTheDocument();
  });
  return voiceJobId;
}

describe('VoicePanel — control buttons fire correct endpoints (Requirement 9.7)', () => {
  it('Pause POSTs to /voice/:id/pause and updates status', async () => {
    const id = await startJob('voice_pause');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'paused', version: 1 }, 200),
    );
    fireEvent.click(screen.getByTestId('voice-pause'));

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .map(captureCall)
        .find(
          (c) => c.url === `/voice/${id}/pause` && c.method === 'POST',
        );
      expect(call).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByTestId('voice-status')).toHaveTextContent('paused');
    });
  });

  it('Resume POSTs to /voice/:id/resume', async () => {
    const id = await startJob('voice_resume');

    // Pause first so the resume button is enabled.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'paused', version: 1 }, 200),
    );
    fireEvent.click(screen.getByTestId('voice-pause'));
    await waitFor(() =>
      expect(screen.getByTestId('voice-status')).toHaveTextContent('paused'),
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'running', version: 2 }, 200),
    );
    fireEvent.click(screen.getByTestId('voice-resume'));

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .map(captureCall)
        .find(
          (c) => c.url === `/voice/${id}/resume` && c.method === 'POST',
        );
      expect(call).toBeDefined();
    });
    await waitFor(() => {
      expect(screen.getByTestId('voice-status')).toHaveTextContent('running');
    });
  });

  it('Stop POSTs to /voice/:id/stop', async () => {
    const id = await startJob('voice_stop');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'failed', version: 1 }, 200),
    );
    fireEvent.click(screen.getByTestId('voice-stop'));

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .map(captureCall)
        .find(
          (c) => c.url === `/voice/${id}/stop` && c.method === 'POST',
        );
      expect(call).toBeDefined();
    });
    await waitFor(() => {
      expect(screen.getByTestId('voice-status')).toHaveTextContent('failed');
    });
  });
});

// ---------------------------------------------------------------------------
// Per-chapter retry (Requirement 9.7 / 9.9)
// ---------------------------------------------------------------------------

describe('VoicePanel — per-chapter retry (Requirement 9.7)', () => {
  it('renders 10 retry buttons and POSTs to chapter/:idx/retry for the chosen chapter', async () => {
    const id = await startJob('voice_retry');

    for (let i = 1; i <= 10; i++) {
      expect(screen.getByTestId(`voice-retry-${i}`)).toBeInTheDocument();
    }

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ chaptersCompleted: 0 }, 200),
    );
    fireEvent.click(screen.getByTestId('voice-retry-7'));

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .map(captureCall)
        .find(
          (c) =>
            c.url === `/voice/${id}/chapter/7/retry` && c.method === 'POST',
        );
      expect(call).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Upstream host filtering (Requirement 9.10)
// ---------------------------------------------------------------------------

describe('VoicePanel — leaky upstream messages are filtered (Requirement 9.10)', () => {
  it('redacts host fragments containing internal/drama15/.local before rendering', () => {
    const cases = [
      {
        raw: 'Could not reach omnivoice.drama15.internal:9443 backend',
        leaks: ['omnivoice', 'drama15', 'internal'],
      },
      {
        raw: 'TTS host tts-01.drama15-internal.local timed out',
        leaks: ['drama15', 'internal', '.local'],
      },
      {
        raw: 'connect ECONNREFUSED 10.0.0.1 router-internal-vpc',
        leaks: ['internal'],
      },
    ];

    for (const { raw, leaks } of cases) {
      const cleaned = sanitizeUpstreamLeak(raw);
      for (const leak of leaks) {
        expect(cleaned.toLowerCase()).not.toContain(leak.toLowerCase());
      }
      expect(cleaned).toContain('[redacted]');
    }
  });

  it('passes through messages that do not contain upstream host fragments', () => {
    expect(sanitizeUpstreamLeak('Quota exhausted. Try again later.')).toBe(
      'Quota exhausted. Try again later.',
    );
    expect(sanitizeUpstreamLeak('Free_Plan cannot start a Voice_Job')).toBe(
      'Free_Plan cannot start a Voice_Job',
    );
  });

  it('does not display an upstream host string when /voices errors with a leak', async () => {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url.endsWith('/voices')) {
        return jsonResponse(
          {
            error: {
              code: 'upstream_error',
              message:
                'Upstream omnivoice.drama15.internal returned 502 from drama15-tts.local',
            },
          },
          502,
        );
      }
      return jsonResponse({}, 200);
    });

    render(<VoicePanel storyId="story_leak" />);

    const errorEl = await screen.findByTestId('voice-error-message');
    const text = errorEl.textContent ?? '';
    expect(text.toLowerCase()).not.toContain('internal');
    expect(text.toLowerCase()).not.toContain('drama15');
    expect(text.toLowerCase()).not.toContain('.local');
    expect(text).toContain('[redacted]');
    // The error code MUST still surface so the user can act on it.
    expect(screen.getByTestId('voice-error-code')).toHaveTextContent(
      'upstream_error',
    );
  });

  it('also filters leaks from create-flow error messages', async () => {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url.endsWith('/voices')) {
        return jsonResponse({ voices: SAMPLE_VOICES }, 200);
      }
      if (url === '/stories/story_leak2/voice') {
        return jsonResponse(
          {
            error: {
              code: 'upstream_error',
              message:
                'Failed to call drama15.internal:9443/tts/chapter — connection refused',
            },
          },
          502,
        );
      }
      return jsonResponse({}, 200);
    });

    render(<VoicePanel storyId="story_leak2" />);
    await waitFor(() => {
      expect(screen.getByTestId('voice-option-voice_alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('voice-submit'));

    const errorEl = await screen.findByTestId('voice-error-message');
    const text = errorEl.textContent ?? '';
    expect(text.toLowerCase()).not.toContain('drama15');
    expect(text.toLowerCase()).not.toContain('internal');
    expect(text.toLowerCase()).not.toContain('.local');
    expect(text).toContain('[redacted]');
    expect(screen.getByTestId('voice-error-code')).toHaveTextContent(
      'upstream_error',
    );
  });
});
