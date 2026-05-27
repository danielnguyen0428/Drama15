/**
 * Unit tests for `<AppShell>` (Validates: Requirement 18.3).
 *
 * Covered cases:
 *   - At 1024px viewport width, the shell exposes `data-viewport="wide"`.
 *   - At 600px viewport width, the shell exposes `data-viewport="compact"`.
 *   - The shell registers a `resize` listener and reacts to it, so a
 *     viewport change flips the layout between `wide` and `compact`
 *     without remounting.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../AppShell';

function setInnerWidth(value: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  // Restore jsdom's default 1024 width so we don't bleed state between
  // tests in the same file.
  setInnerWidth(1024);
});

describe('AppShell', () => {
  it('renders a <main> element with data-testid="app-shell"', () => {
    setInnerWidth(1024);
    render(<AppShell />);

    const shell = screen.getByTestId('app-shell');
    expect(shell.tagName).toBe('MAIN');
  });

  it('exposes data-viewport="wide" at 1024px width', () => {
    setInnerWidth(1024);
    render(<AppShell />);

    const shell = screen.getByTestId('app-shell');
    expect(shell).toHaveAttribute('data-viewport', 'wide');
  });

  it('exposes data-viewport="compact" at 600px width', () => {
    setInnerWidth(600);
    render(<AppShell />);

    const shell = screen.getByTestId('app-shell');
    expect(shell).toHaveAttribute('data-viewport', 'compact');
  });

  it('registers a resize listener and flips the viewport flag when the window is resized', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    setInnerWidth(1024);
    const { unmount } = render(<AppShell />);

    // Confirm the resize listener was registered.
    const resizeRegistration = addSpy.mock.calls.find(
      (call) => call[0] === 'resize',
    );
    expect(resizeRegistration).toBeDefined();

    const shell = screen.getByTestId('app-shell');
    expect(shell).toHaveAttribute('data-viewport', 'wide');

    // Shrink below the 768px breakpoint and dispatch a real resize
    // event. The shell must observe the change and flip to compact.
    act(() => {
      setInnerWidth(500);
      window.dispatchEvent(new Event('resize'));
    });
    expect(shell).toHaveAttribute('data-viewport', 'compact');

    // Grow back above the breakpoint and confirm the flag flips back.
    act(() => {
      setInnerWidth(1280);
      window.dispatchEvent(new Event('resize'));
    });
    expect(shell).toHaveAttribute('data-viewport', 'wide');

    // Cleanup must remove the same listener it added.
    unmount();
    const resizeRemoval = removeSpy.mock.calls.find(
      (call) => call[0] === 'resize',
    );
    expect(resizeRemoval).toBeDefined();

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
