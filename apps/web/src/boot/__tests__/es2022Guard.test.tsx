import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectEs2022, requireEs2022OrAbort } from '../es2022Guard';

/**
 * Helper: create a fresh `#root`-style container attached to the test
 * document. Returned element is detached on cleanup.
 */
function createContainer(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'root';
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('detectEs2022', () => {
  it('reports supported=true under modern jsdom', () => {
    const result = detectEs2022();
    expect(result.supported).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('reports supported=false when Object.hasOwn is missing', () => {
    const original = Object.hasOwn;
    try {
      // Stub the capability away to simulate a stale engine.
      // `as unknown as undefined` keeps TS happy while we tear out
      // the static method.
      (Object as unknown as { hasOwn: unknown }).hasOwn =
        undefined as unknown as typeof Object.hasOwn;

      const result = detectEs2022();
      expect(result.supported).toBe(false);
      expect(result.missing).toContain('Object.hasOwn');
    } finally {
      (Object as unknown as { hasOwn: typeof Object.hasOwn }).hasOwn = original;
    }
  });

  it('reports supported=false when Array.prototype.at is missing', () => {
    const proto = Array.prototype as unknown as { at?: unknown };
    const original = proto.at;
    try {
      proto.at = undefined;
      const result = detectEs2022();
      expect(result.supported).toBe(false);
      expect(result.missing).toContain('Array.prototype.at');
    } finally {
      proto.at = original;
    }
  });

  it('reports supported=false when String.prototype.replaceAll is missing', () => {
    const proto = String.prototype as unknown as { replaceAll?: unknown };
    const original = proto.replaceAll;
    try {
      proto.replaceAll = undefined;
      const result = detectEs2022();
      expect(result.supported).toBe(false);
      expect(result.missing).toContain('String.prototype.replaceAll');
    } finally {
      proto.replaceAll = original;
    }
  });

  it('lists every capability stubbed away simultaneously', () => {
    const objAny = Object as unknown as { hasOwn: unknown };
    const arrProto = Array.prototype as unknown as {
      at?: unknown;
      findLast?: unknown;
    };
    const strProto = String.prototype as unknown as { replaceAll?: unknown };

    const originals = {
      hasOwn: objAny.hasOwn,
      at: arrProto.at,
      findLast: arrProto.findLast,
      replaceAll: strProto.replaceAll,
    };

    try {
      objAny.hasOwn = undefined;
      arrProto.at = undefined;
      arrProto.findLast = undefined;
      strProto.replaceAll = undefined;

      const result = detectEs2022();
      expect(result.supported).toBe(false);
      expect(result.missing).toEqual(
        expect.arrayContaining([
          'Object.hasOwn',
          'Array.prototype.at',
          'Array.prototype.findLast',
          'String.prototype.replaceAll',
        ]),
      );
    } finally {
      objAny.hasOwn = originals.hasOwn;
      arrProto.at = originals.at;
      arrProto.findLast = originals.findLast;
      strProto.replaceAll = originals.replaceAll;
    }
  });
});

describe('requireEs2022OrAbort', () => {
  it('returns true and leaves the container untouched when supported', () => {
    const root = createContainer();
    const placeholder = document.createElement('span');
    placeholder.textContent = 'placeholder';
    root.appendChild(placeholder);

    const result = requireEs2022OrAbort(root, 'vi');

    expect(result).toBe(true);
    // Existing children must remain so the SPA can mount onto them.
    expect(root.contains(placeholder)).toBe(true);
    expect(
      root.querySelector('[data-testid="es2022-upgrade-notice"]'),
    ).toBeNull();
  });

  it('renders the Vietnamese upgrade notice and returns false', () => {
    const root = createContainer();
    const objAny = Object as unknown as { hasOwn: unknown };
    const original = objAny.hasOwn;
    try {
      objAny.hasOwn = undefined;
      const result = requireEs2022OrAbort(root, 'vi');
      expect(result).toBe(false);

      const notice = root.querySelector(
        '[data-testid="es2022-upgrade-notice"]',
      );
      expect(notice).not.toBeNull();
      expect(notice?.getAttribute('lang')).toBe('vi');
      expect(notice?.textContent).toContain('Trình duyệt của bạn đã quá cũ');
      expect(notice?.textContent).toContain('ECMAScript 2022');

      const missing = root.querySelector(
        '[data-testid="es2022-missing-list"]',
      );
      expect(missing?.textContent).toContain('Tính năng còn thiếu');
      expect(missing?.textContent).toContain('Object.hasOwn');
    } finally {
      (objAny as { hasOwn: unknown }).hasOwn = original;
    }
  });

  it('renders the English upgrade notice and returns false', () => {
    const root = createContainer();
    const objAny = Object as unknown as { hasOwn: unknown };
    const original = objAny.hasOwn;
    try {
      objAny.hasOwn = undefined;
      const result = requireEs2022OrAbort(root, 'en');
      expect(result).toBe(false);

      const notice = root.querySelector(
        '[data-testid="es2022-upgrade-notice"]',
      );
      expect(notice).not.toBeNull();
      expect(notice?.getAttribute('lang')).toBe('en');
      expect(notice?.textContent).toContain('Your browser is too old');
      expect(notice?.textContent).toContain('ECMAScript 2022');

      const missing = root.querySelector(
        '[data-testid="es2022-missing-list"]',
      );
      expect(missing?.textContent).toContain('Missing capabilities');
      expect(missing?.textContent).toContain('Object.hasOwn');
    } finally {
      (objAny as { hasOwn: unknown }).hasOwn = original;
    }
  });

  it('clears existing children before rendering the notice', () => {
    const root = createContainer();
    const stale = document.createElement('div');
    stale.textContent = 'stale-content';
    root.appendChild(stale);

    const objAny = Object as unknown as { hasOwn: unknown };
    const original = objAny.hasOwn;
    try {
      objAny.hasOwn = undefined;
      requireEs2022OrAbort(root, 'vi');
      expect(root.contains(stale)).toBe(false);
      expect(root.textContent).not.toContain('stale-content');
    } finally {
      (objAny as { hasOwn: unknown }).hasOwn = original;
    }
  });

  it('does not invoke a SPA bootstrap callback when guard returns false', () => {
    // Models the call site in `main.tsx`:
    //   if (requireEs2022OrAbort(container, locale)) {
    //     createRoot(container).render(...);
    //   }
    // When `requireEs2022OrAbort` returns false, the bootstrap MUST NOT run.
    const root = createContainer();
    const bootstrap = vi.fn();

    const objAny = Object as unknown as { hasOwn: unknown };
    const original = objAny.hasOwn;
    try {
      objAny.hasOwn = undefined;
      if (requireEs2022OrAbort(root, 'vi')) {
        bootstrap();
      }
      expect(bootstrap).not.toHaveBeenCalled();
    } finally {
      (objAny as { hasOwn: unknown }).hasOwn = original;
    }
  });

  it('invokes the SPA bootstrap callback when guard returns true', () => {
    const root = createContainer();
    const bootstrap = vi.fn();

    if (requireEs2022OrAbort(root, 'vi')) {
      bootstrap();
    }

    expect(bootstrap).toHaveBeenCalledTimes(1);
  });
});
