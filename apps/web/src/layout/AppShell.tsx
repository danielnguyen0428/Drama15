import { useEffect, useState, type ReactNode } from 'react';

import './responsive.css';

/**
 * Breakpoint at which the layout flips from `wide` to `compact`.
 *
 * Aligns with Requirement 18.3: viewports < 768px get the compact
 * layout that still permits full create-story and gen-voice flows.
 */
export const COMPACT_BREAKPOINT_PX = 768;

export type ViewportMode = 'compact' | 'wide';

export interface AppShellProps {
  readonly children?: ReactNode;
}

/**
 * Compute the viewport mode from a measured inner width.
 *
 * Anything strictly below `COMPACT_BREAKPOINT_PX` is `compact`; the
 * 768px boundary itself is `wide` so the design.md threshold matches
 * the requirement's "dưới 768 pixel" phrasing.
 */
export function computeViewportMode(innerWidth: number): ViewportMode {
  return innerWidth < COMPACT_BREAKPOINT_PX ? 'compact' : 'wide';
}

function readInitialViewport(): ViewportMode {
  if (typeof window === 'undefined') {
    // SSR / non-DOM environments: default to wide so server-rendered
    // markup matches the desktop-first baseline.
    return 'wide';
  }
  return computeViewportMode(window.innerWidth);
}

/**
 * Top-level layout shell for the Web_Client SPA.
 *
 * Validates: Requirement 18.3 — renders a `<main>` element that
 * exposes a `data-viewport` attribute (`compact` for < 768px,
 * `wide` otherwise). The attribute is recomputed on every
 * `resize` event so rotating a phone or resizing a desktop window
 * immediately flips the layout, while the imported `responsive.css`
 * applies the matching compact rules.
 *
 * The shell intentionally renders `children`, so callers can mount
 * the create-story form, voice generation panel, history page, etc.
 * inside it without losing the responsive contract.
 */
export function AppShell({ children }: AppShellProps): JSX.Element {
  const [viewport, setViewport] = useState<ViewportMode>(readInitialViewport);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = (): void => {
      setViewport(computeViewportMode(window.innerWidth));
    };

    // Sync once on mount in case `window.innerWidth` has changed
    // between the lazy `useState` initialiser running and the effect
    // firing (e.g. fast viewport change during hydration).
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <main data-testid="app-shell" data-viewport={viewport}>
      {children}
    </main>
  );
}

export default AppShell;
