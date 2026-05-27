/**
 * `ExportButtons` — "Lưu Từng Chương .md" + "Xuất PDF Cả Truyện".
 *
 * Validates: Requirements 11.1, 11.2
 *
 *   11.1  WHEN người dùng bấm `Lưu Từng Chương .md`, THE Web_Client
 *         SHALL tải về một file .zip chứa từng chương ở định dạng
 *         Markdown.
 *   11.2  WHEN người dùng bấm `Xuất PDF Cả Truyện`, THE API_Gateway
 *         SHALL sinh PDF của 10 chương kèm tổng quan và phải trả về
 *         URL có chữ ký với thời hạn tối đa 60 phút.
 *
 * Wire contract (matches `apps/api/src/export/route.ts`)
 * ------------------------------------------------------
 *   - `POST /stories/:id/export/markdown` → `{ url, expiresAt }`
 *   - `POST /stories/:id/export/pdf`      → `{ url, expiresAt }`
 *
 * The signed `url` is the artefact location in Object_Storage; TTL is
 * enforced server-side (≤ 60 minutes per Requirement 11.2). The
 * Web_Client only needs to hand the URL to the browser.
 *
 * Behaviour
 * ---------
 *   - "Lưu Từng Chương .md" — POSTs the markdown endpoint, then
 *     triggers a download by clicking a hidden anchor with the
 *     `download` attribute. We prefer the anchor strategy over
 *     mutating `window.location.href` because:
 *       a) `download` keeps the user on the page (no full navigation),
 *       b) the browser still falls back to a navigation if the
 *          server emits a `Content-Disposition: inline` header.
 *     The `download` attribute is honoured for same-origin URLs; for
 *     cross-origin signed URLs the browser may strip it, in which case
 *     the file streams via `Content-Disposition` from the storage
 *     bucket — both paths produce a download.
 *   - "Xuất PDF Cả Truyện" — POSTs the pdf endpoint and opens the
 *     signed URL in a new tab with `noopener,noreferrer` so the
 *     opened tab cannot reach back into the SPA via `window.opener`
 *     (Requirement 12.4 spirit: the upstream/signed URL must not
 *     gain access to the SPA context).
 *
 * Both buttons disable themselves while a request is in flight to
 * avoid double-spending storage signing operations and to prevent a
 * second click from racing with the first download. Errors are
 * surfaced inline via `role="alert"` with a generic Vietnamese
 * message; the gateway-supplied `error.message` is preferred when
 * present.
 */

import { useCallback, useRef, useState } from 'react';

import { httpFetch } from '../api/httpClient';

/** Wire-format response for both export endpoints. */
interface ExportResponse {
  url?: string;
  expiresAt?: string;
  error?: { code?: string; message?: string };
}

export interface ExportButtonsProps {
  /** Story_Job id; becomes the `:id` path param. */
  storyId: string;
  /**
   * Optional override of `window.open`. Tests inject a spy here so
   * we never actually try to open a popup in jsdom.
   */
  windowOpen?: (
    url: string,
    target: string,
    features: string,
  ) => Window | null;
  /** Stable id prefix for the rendered buttons (E2E selectors). */
  id?: string;
}

type RequestState =
  | { kind: 'idle' }
  | { kind: 'loading'; which: 'markdown' | 'epub' | 'pdf' }
  | { kind: 'error'; message: string };

const FALLBACK_ERROR_MESSAGE = 'Không thể xuất truyện. Vui lòng thử lại.';
const NETWORK_ERROR_MESSAGE =
  'Không thể kết nối tới máy chủ. Vui lòng thử lại.';

/**
 * Trigger a browser download of `url` by synthesising a hidden
 * anchor with `download`. Falls back to `window.location.href = url`
 * when `document` is unavailable (defensive: tests run under jsdom
 * so this should always succeed in practice).
 *
 * Exported for unit tests so they can assert on the chosen strategy
 * without rendering the component.
 */
export function triggerDownload(
  url: string,
  doc: Document = document,
): void {
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener noreferrer';
  // The empty string asks the browser to pick the filename from the
  // server-side `Content-Disposition` header. Storage backends
  // (S3/MinIO) set this when the object was uploaded with a filename.
  anchor.setAttribute('download', '');
  // Keep the anchor out of the layout but still in the DOM so the
  // synthetic click is a trusted user gesture continuation.
  anchor.style.display = 'none';
  doc.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    doc.body.removeChild(anchor);
  }
}

async function readEnvelope(res: Response): Promise<ExportResponse> {
  try {
    return (await res.json()) as ExportResponse;
  } catch {
    return {};
  }
}

export function ExportButtons(props: ExportButtonsProps): JSX.Element {
  const { storyId, windowOpen, id = 'export' } = props;
  const [state, setState] = useState<RequestState>({ kind: 'idle' });
  // `useRef` keeps the disabled flag stable across renders so two
  // simultaneous handlers (markdown + pdf) cannot both pass the
  // in-flight gate.
  const inFlightRef = useRef(false);

  const inFlight = state.kind === 'loading';

  const runExport = useCallback(
    async (
      which: 'markdown' | 'epub' | 'pdf',
      onSuccess: (url: string) => void,
    ): Promise<void> => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setState({ kind: 'loading', which });

      const endpoint = `/stories/${encodeURIComponent(storyId)}/export/${which}`;

      let res: Response;
      try {
        res = await httpFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch {
        inFlightRef.current = false;
        setState({ kind: 'error', message: NETWORK_ERROR_MESSAGE });
        return;
      }

      const body = await readEnvelope(res);

      if (!res.ok || typeof body.url !== 'string' || body.url.length === 0) {
        const message =
          body.error?.message ?? FALLBACK_ERROR_MESSAGE;
        inFlightRef.current = false;
        setState({ kind: 'error', message });
        return;
      }

      try {
        onSuccess(body.url);
        setState({ kind: 'idle' });
      } catch {
        setState({ kind: 'error', message: FALLBACK_ERROR_MESSAGE });
      } finally {
        inFlightRef.current = false;
      }
    },
    [storyId],
  );

  const handleMarkdown = useCallback((): void => {
    void runExport('markdown', (url) => {
      triggerDownload(url);
    });
  }, [runExport]);

  const handleEpub = useCallback((): void => {
    void runExport('epub', (url) => {
      triggerDownload(url);
    });
  }, [runExport]);

  const handlePdf = useCallback((): void => {
    const open = windowOpen ?? window.open.bind(window);
    void runExport('pdf', (url) => {
      open(url, '_blank', 'noopener,noreferrer');
    });
  }, [runExport, windowOpen]);

  return (
    <div data-testid="export-buttons-root">
      <button
        id={`${id}-markdown`}
        type="button"
        data-testid="export-markdown-button"
        onClick={handleMarkdown}
        disabled={inFlight}
        aria-busy={
          state.kind === 'loading' && state.which === 'markdown' ? true : undefined
        }
      >
        {state.kind === 'loading' && state.which === 'markdown'
          ? 'Đang xuất Markdown…'
          : 'Lưu Từng Chương .md'}
      </button>

      <button
        id={`${id}-epub`}
        type="button"
        data-testid="export-epub-button"
        onClick={handleEpub}
        disabled={inFlight}
        aria-busy={
          state.kind === 'loading' && state.which === 'epub' ? true : undefined
        }
      >
        {state.kind === 'loading' && state.which === 'epub'
          ? 'Đang xuất EPUB…'
          : 'Xuất EPUB'}
      </button>

      <button
        id={`${id}-pdf`}
        type="button"
        data-testid="export-pdf-button"
        onClick={handlePdf}
        disabled={inFlight}
        aria-busy={
          state.kind === 'loading' && state.which === 'pdf' ? true : undefined
        }
      >
        {state.kind === 'loading' && state.which === 'pdf'
          ? 'Đang xuất PDF…'
          : 'Xuất PDF Cả Truyện'}
      </button>

      {state.kind === 'error' ? (
        <p role="alert" data-testid="export-error">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export default ExportButtons;
