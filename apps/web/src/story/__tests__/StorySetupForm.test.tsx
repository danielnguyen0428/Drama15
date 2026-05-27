/**
 * Unit tests for `StorySetupForm` (Task 17.1).
 *
 * Validates: Requirements 6.1, 6.2, 6.10, 6.11.
 *
 * Coverage matrix:
 *   - Requirement 6.10 — every curated niche key (`billionaire`,
 *     `humiliation_revenge`, `hidden_identity`, `toxic_family`, `affair`,
 *     `single_mother`, `social_injustice`) is rendered as a `<select>`
 *     option, with its corresponding Vietnamese label.
 *   - Requirement 6.11 — typing a custom niche clears the curated
 *     selection (mutual exclusion); selecting a curated niche clears the
 *     custom-niche text input.
 *   - Requirement 6.2 — clicking "Tự tạo" POSTs to `/story/setup-suggest`
 *     via `httpFetch`, fills the form fields from the success payload,
 *     and surfaces a localised error message on failure.
 *
 * `httpFetch` is the layer under test for the niche/suggest behaviour;
 * the device-fingerprint and integrity headers it appends are covered by
 * `apps/web/src/api/__tests__/httpClient.test.ts` and not re-asserted
 * here.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { __resetDeviceFingerprintCacheForTests } from '../../api/httpClient';
import {
  CURATED_NICHES,
  SETUP_SUGGEST_ENDPOINT,
  StorySetupForm,
} from '../StorySetupForm';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch | undefined;

beforeEach(() => {
  __resetDeviceFingerprintCacheForTests();
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
  __resetDeviceFingerprintCacheForTests();
  window.localStorage.clear();
});

function lastFetchInit(): RequestInit {
  expect(fetchMock).toHaveBeenCalled();
  const args = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  expect(args).toBeDefined();
  return args![1] as RequestInit;
}

function lastFetchUrl(): string {
  const args = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  expect(args).toBeDefined();
  const target = args![0];
  return typeof target === 'string'
    ? target
    : target instanceof URL
      ? target.toString()
      : (target as Request).url;
}

// ---------------------------------------------------------------------------
// Curated niches (Requirement 6.10)
// ---------------------------------------------------------------------------

describe('StorySetupForm — curated niches (Requirement 6.10)', () => {
  it('renders all 7 curated niche options with stable keys', () => {
    render(<StorySetupForm />);

    const select = screen.getByTestId(
      'story-setup-niche',
    ) as HTMLSelectElement;
    // Each curated niche must appear as an option whose `value` is the
    // canonical preset key. Filter out the placeholder option (value="").
    const optionValues = Array.from(select.options)
      .map((opt) => opt.value)
      .filter((v) => v.length > 0);

    expect(optionValues).toEqual([
      'billionaire',
      'humiliation_revenge',
      'hidden_identity',
      'toxic_family',
      'affair',
      'single_mother',
      'social_injustice',
    ]);
  });

  it('renders each curated niche with its Vietnamese label', () => {
    render(<StorySetupForm />);
    const select = screen.getByTestId(
      'story-setup-niche',
    ) as HTMLSelectElement;
    const labels = Array.from(select.options)
      .filter((opt) => opt.value.length > 0)
      .map((opt) => opt.textContent);

    expect(labels).toEqual([
      'Tỷ phú',
      'Sỉ nhục lật kèo',
      'Che giấu thân phận',
      'Gia đình độc hại',
      'Ngoại tình',
      'Mẹ đơn thân',
      'Bất công xã hội',
    ]);
  });

  it('exports a CURATED_NICHES catalog mirroring the dropdown', () => {
    expect(CURATED_NICHES.map((n) => n.key)).toEqual([
      'billionaire',
      'humiliation_revenge',
      'hidden_identity',
      'toxic_family',
      'affair',
      'single_mother',
      'social_injustice',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Mutual exclusion (Requirement 6.11)
// ---------------------------------------------------------------------------

describe('StorySetupForm — niche vs customNiche mutual exclusion (Requirement 6.11)', () => {
  it('clears the curated selection when a custom niche is typed', () => {
    render(<StorySetupForm />);
    const select = screen.getByTestId(
      'story-setup-niche',
    ) as HTMLSelectElement;
    const custom = screen.getByTestId(
      'story-setup-custom-niche',
    ) as HTMLInputElement;

    // Initial state has a curated niche pre-selected for convenience.
    expect(select.value).toBe('billionaire');

    fireEvent.change(custom, { target: { value: 'time-loop romance' } });

    expect(custom.value).toBe('time-loop romance');
    expect(select.value).toBe('');
  });

  it('clears the custom niche when a curated niche is picked', () => {
    render(<StorySetupForm />);
    const select = screen.getByTestId(
      'story-setup-niche',
    ) as HTMLSelectElement;
    const custom = screen.getByTestId(
      'story-setup-custom-niche',
    ) as HTMLInputElement;

    fireEvent.change(custom, { target: { value: 'time-loop romance' } });
    expect(select.value).toBe('');
    expect(custom.value).toBe('time-loop romance');

    fireEvent.change(select, { target: { value: 'social_injustice' } });
    expect(select.value).toBe('social_injustice');
    expect(custom.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// "Tự tạo" → POST /story/setup-suggest (Requirement 6.2)
// ---------------------------------------------------------------------------

describe('StorySetupForm — "Tự tạo" POSTs to /story/setup-suggest (Requirement 6.2)', () => {
  it('POSTs the form state to the setup-suggest endpoint', async () => {
    render(<StorySetupForm />);
    const select = screen.getByTestId(
      'story-setup-niche',
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'billionaire' } });

    fireEvent.click(screen.getByTestId('story-setup-suggest'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(lastFetchUrl()).toBe(SETUP_SUGGEST_ENDPOINT);
    const init = lastFetchInit();
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.niche).toBe('billionaire');
    expect(body.outputLanguage).toBeDefined();
  });

  it('includes the customNiche field instead of niche when one is typed', async () => {
    render(<StorySetupForm />);
    const custom = screen.getByTestId(
      'story-setup-custom-niche',
    ) as HTMLInputElement;
    fireEvent.change(custom, { target: { value: 'space opera coup' } });

    fireEvent.click(screen.getByTestId('story-setup-suggest'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(lastFetchInit().body as string) as Record<
      string,
      unknown
    >;
    expect(body.customNiche).toBe('space opera coup');
    expect(body.niche).toBeUndefined();
  });

  it('fills the form fields from the upstream success payload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          title: 'Cô bé bán hoa và tỷ phú',
          seed: 'một mùa hè ở Sapa',
          config: {
            intensity: 0.9,
            dialogueRatio: 0.4,
            hookDensity: 0.8,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    render(<StorySetupForm />);
    fireEvent.click(screen.getByTestId('story-setup-suggest'));

    await waitFor(() => {
      const title = screen.getByTestId(
        'story-setup-title',
      ) as HTMLInputElement;
      expect(title.value).toBe('Cô bé bán hoa và tỷ phú');
    });

    const seed = screen.getByTestId('story-setup-seed') as HTMLTextAreaElement;
    expect(seed.value).toBe('một mùa hè ở Sapa');

    const intensity = screen.getByTestId(
      'story-setup-intensity',
    ) as HTMLInputElement;
    expect(Number(intensity.value)).toBeCloseTo(0.9);

    const dialogue = screen.getByTestId(
      'story-setup-dialogue-ratio',
    ) as HTMLInputElement;
    expect(Number(dialogue.value)).toBeCloseTo(0.4);

    const hook = screen.getByTestId(
      'story-setup-hook-density',
    ) as HTMLInputElement;
    expect(Number(hook.value)).toBeCloseTo(0.8);

    // No error rendered on success.
    expect(screen.queryByTestId('story-setup-error')).toBeNull();
  });

  it('shows a localised error message when the upstream returns 5xx', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'upstream_error' } }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      ),
    );

    render(<StorySetupForm />);
    fireEvent.click(screen.getByTestId('story-setup-suggest'));

    await waitFor(() =>
      expect(screen.getByTestId('story-setup-error')).toBeInTheDocument(),
    );

    // Title is unchanged because the call failed.
    const title = screen.getByTestId('story-setup-title') as HTMLInputElement;
    expect(title.value).toBe('');
  });

  it('shows a localised error message when fetch rejects (network failure)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    render(<StorySetupForm />);
    fireEvent.click(screen.getByTestId('story-setup-suggest'));

    await waitFor(() =>
      expect(screen.getByTestId('story-setup-error')).toBeInTheDocument(),
    );
  });
});
