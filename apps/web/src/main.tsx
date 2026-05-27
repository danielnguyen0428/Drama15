import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { requireEs2022OrAbort } from './boot/es2022Guard';
import { DEFAULT_LOCALE } from './i18n/types';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found in index.html');
}

// Requirement 18.2: feature-detect ES2022 before booting React. When the
// runtime is too old, `requireEs2022OrAbort` swaps the container with a
// localized upgrade notice and returns `false`; we must NOT call
// `createRoot` in that case because React itself may rely on ES2022
// surface area we just declared missing.
if (requireEs2022OrAbort(container, DEFAULT_LOCALE)) {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
