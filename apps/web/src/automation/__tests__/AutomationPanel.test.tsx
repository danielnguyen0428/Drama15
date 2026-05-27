/**
 * Unit tests for {@link AutomationPanel} (Task 17.6).
 *
 * Covers Requirements 8.1, 8.6, 8.7:
 *
 *   8.1  The panel renders and lets the user start an Automation_Job
 *        via `POST /automation`.
 *   8.6  Once the job is running the panel exposes Pause / Resume /
 *        Stop buttons that POST to `/automation/:id/pause`,
 *        `.../resume`, `.../stop`.
 *   8.7  Each sub-story has its own `Thử lại` button that POSTs to
 *        `/automation/:id/retry/:storyIndex`.
 *
 * The Requirement 8.3 cap is verified here too because the panel is
 * the user-facing enforcement point: typing `target_count = 3` must
 * surface an error AND disable submission so a user cannot smuggle
 * an over-cap request past the client.
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
import {
  AUTOMATION_TARGET_COUNT_MAX,
  AutomationPanel,
  clampTargetCount,
} from '../AutomationPanel';

// ---------------------------------------------------------------------------
// Test helpers
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

beforeEach(() => {
  __resetDeviceFingerprintCacheForTests();
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn(async () =>
    jsonResponse({ automationJobId: 'auto_1', storyJobIds: ['s_1'] }, 201),
  ) as unknown as Mock<typeof fetch>;
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
// Cap enforcement (Requirement 8.3)
// ---------------------------------------------------------------------------

describe('AutomationPanel — target_count cap (Requirement 8.3)', () => {
  it('clampTargetCount caps at the documented maximum', () => {
    expect(AUTOMATION_TARGET_COUNT_MAX).toBe(2);
    expect(clampTargetCount(3)).toBe(2);
    expect(clampTargetCount(10)).toBe(2);
    expect(clampTargetCount(2)).toBe(2);
    expect(clampTargetCount(1)).toBe(1);
    expect(clampTargetCount(0)).toBe(1);
    expect(clampTargetCount(-5)).toBe(1);
    expect(clampTargetCount(Number.NaN)).toBe(1);
  });

  it('renders one config row per slot up to the cap', () => {
    render(<AutomationPanel initialTargetCount={2} />);
    expect(screen.getByTestId('automation-config-0')).toBeInTheDocument();
    expect(screen.getByTestId('automation-config-1')).toBeInTheDocument();
    expect(screen.queryByTestId('automation-config-2')).toBeNull();
  });

  it('disables submit AND surfaces an error when the user types 3', () => {
    render(<AutomationPanel initialTargetCount={1} />);
    const input = screen.getByTestId(
      'automation-target-count',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3' } });

    const submit = screen.getByTestId(
      'automation-submit',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByTestId('automation-cap-error')).toBeInTheDocument();
    // Even though raw value is 3, the resized configs array must
    // remain at cap so a programmatic submit cannot send 3 configs.
    expect(screen.getByTestId('automation-config-0')).toBeInTheDocument();
    expect(screen.getByTestId('automation-config-1')).toBeInTheDocument();
    expect(screen.queryByTestId('automation-config-2')).toBeNull();
  });

  it('does not call POST /automation when the cap is exceeded', async () => {
    render(<AutomationPanel initialTargetCount={1} />);
    const input = screen.getByTestId(
      'automation-target-count',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.submit(screen.getByTestId('automation-form'));

    // The form's onSubmit short-circuits when canSubmit is false.
    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Create flow (Requirement 8.1)
// ---------------------------------------------------------------------------

describe('AutomationPanel — start flow (Requirement 8.1)', () => {
  it('POSTs to /automation with target_count and configs on submit', async () => {
    render(<AutomationPanel initialTargetCount={2} />);

    fireEvent.change(
      screen.getByTestId('automation-niche-0') as HTMLInputElement,
      { target: { value: 'billionaire' } },
    );

    fireEvent.click(screen.getByTestId('automation-submit'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const call = captureCall(fetchMock.mock.calls[0]!);
    expect(call.url).toBe('/automation');
    expect(call.method).toBe('POST');
    // Vietnamese-only lock: the language picker is hidden, so every
    // sub-story config carries the default `'vi'` (the server then
    // normalises it to `'vietnamese'`). The output-language field is
    // verified explicitly so a future regression that re-exposes the
    // picker without updating the lock would fail this test.
    expect(call.body).toEqual({
      target_count: 2,
      configs: [
        { niche: 'billionaire', outputLanguage: 'vi' },
        { outputLanguage: 'vi' },
      ],
    });

    // Once the job is created the form is replaced by the job view.
    await waitFor(() => {
      expect(screen.getByTestId('automation-job-view')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('automation-form')).toBeNull();
  });

  it('shows an error message when the create call fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'automation_requires_paid', message: 'paid only' } },
        403,
      ),
    );

    render(<AutomationPanel initialTargetCount={1} />);
    fireEvent.click(screen.getByTestId('automation-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('automation-error')).toHaveTextContent(
        'paid only',
      );
    });
    // The form is still rendered, so the user can retry.
    expect(screen.getByTestId('automation-form')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Control flow (Requirement 8.6)
// ---------------------------------------------------------------------------

describe('AutomationPanel — Pause / Resume / Stop (Requirement 8.6)', () => {
  /**
   * Drive the panel from the create form into the running job view.
   * Returns the automation id used for the POST URLs so each test
   * can assert against the same id deterministically.
   */
  async function startJob(automationJobId = 'auto_42'): Promise<string> {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ automationJobId, storyJobIds: ['s_1', 's_2'] }, 201),
    );
    render(<AutomationPanel initialTargetCount={2} />);
    fireEvent.click(screen.getByTestId('automation-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('automation-job-view')).toBeInTheDocument();
    });
    return automationJobId;
  }

  it('Pause POSTs to /automation/:id/pause and updates status', async () => {
    const id = await startJob('auto_pause');

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { automationJobId: id, status: 'paused', version: 1 },
        200,
      ),
    );

    fireEvent.click(screen.getByTestId('automation-pause'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const call = captureCall(fetchMock.mock.calls[1]!);
    expect(call.url).toBe(`/automation/${id}/pause`);
    expect(call.method).toBe('POST');

    await waitFor(() => {
      expect(screen.getByTestId('automation-status')).toHaveTextContent(
        'paused',
      );
    });
  });

  it('Resume POSTs to /automation/:id/resume', async () => {
    const id = await startJob('auto_resume');

    // First, pause so the resume button becomes enabled.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { automationJobId: id, status: 'paused', version: 1 },
        200,
      ),
    );
    fireEvent.click(screen.getByTestId('automation-pause'));
    await waitFor(() =>
      expect(screen.getByTestId('automation-status')).toHaveTextContent(
        'paused',
      ),
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { automationJobId: id, status: 'running', version: 2 },
        200,
      ),
    );
    fireEvent.click(screen.getByTestId('automation-resume'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    const call = captureCall(fetchMock.mock.calls[2]!);
    expect(call.url).toBe(`/automation/${id}/resume`);
    expect(call.method).toBe('POST');

    await waitFor(() => {
      expect(screen.getByTestId('automation-status')).toHaveTextContent(
        'running',
      );
    });
  });

  it('Stop POSTs to /automation/:id/stop', async () => {
    const id = await startJob('auto_stop');

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { automationJobId: id, status: 'failed', version: 1 },
        200,
      ),
    );

    fireEvent.click(screen.getByTestId('automation-stop'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const call = captureCall(fetchMock.mock.calls[1]!);
    expect(call.url).toBe(`/automation/${id}/stop`);
    expect(call.method).toBe('POST');

    await waitFor(() => {
      expect(screen.getByTestId('automation-status')).toHaveTextContent(
        'failed',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Per-sub-story retry (Requirement 8.7)
// ---------------------------------------------------------------------------

describe('AutomationPanel — per-sub-story retry (Requirement 8.7)', () => {
  it('renders a Thử lại button for every slot', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { automationJobId: 'auto_retry', storyJobIds: ['a', 'b'] },
        201,
      ),
    );
    render(<AutomationPanel initialTargetCount={2} />);
    fireEvent.click(screen.getByTestId('automation-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('automation-retry-0')).toBeInTheDocument();
      expect(screen.getByTestId('automation-retry-1')).toBeInTheDocument();
    });
  });

  it('POSTs to /automation/:id/retry/:storyIndex for the chosen slot', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { automationJobId: 'auto_retry', storyJobIds: ['a', 'b'] },
        201,
      ),
    );
    render(<AutomationPanel initialTargetCount={2} />);
    fireEvent.click(screen.getByTestId('automation-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('automation-job-view')).toBeInTheDocument(),
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ storyJobId: 'b', outcome: 'running' }, 200),
    );
    fireEvent.click(screen.getByTestId('automation-retry-1'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const call = captureCall(fetchMock.mock.calls[1]!);
    expect(call.url).toBe('/automation/auto_retry/retry/1');
    expect(call.method).toBe('POST');
  });

  it('uses different paths for slot 0 and slot 1 (no shared mutation)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { automationJobId: 'auto_multi', storyJobIds: ['a', 'b'] },
        201,
      ),
    );
    render(<AutomationPanel initialTargetCount={2} />);
    fireEvent.click(screen.getByTestId('automation-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('automation-job-view')).toBeInTheDocument(),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ outcome: 'running' }, 200));
    fireEvent.click(screen.getByTestId('automation-retry-0'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fetchMock.mockResolvedValueOnce(jsonResponse({ outcome: 'running' }, 200));
    fireEvent.click(screen.getByTestId('automation-retry-1'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(captureCall(fetchMock.mock.calls[1]!).url).toBe(
      '/automation/auto_multi/retry/0',
    );
    expect(captureCall(fetchMock.mock.calls[2]!).url).toBe(
      '/automation/auto_multi/retry/1',
    );
  });
});
