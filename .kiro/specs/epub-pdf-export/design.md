# Implementation Plan

## Overview

This design extends the existing export pipeline with EPUB generation and upgrades the PDF exporter to support professional Vietnamese typography. The architecture follows the established pattern: a format-specific exporter class produces bytes → the export route persists them to Object_Storage → a signed URL is returned to the client.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Web_Client (React SPA)                                          │
│                                                                 │
│  ExportButtons.tsx                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │ Lưu .md      │ │ Xuất EPUB    │ │ Xuất PDF Cả Truyện   │    │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘    │
│         │                │                     │                │
└─────────┼────────────────┼─────────────────────┼────────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ API_Gateway (Fastify)                                           │
│                                                                 │
│  POST /stories/:id/export/markdown  (existing)                  │
│  POST /stories/:id/export/epub      (NEW)                       │
│  POST /stories/:id/export/pdf       (existing, upgraded)        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Export Pipeline (runExportPipeline)                      │    │
│  │  1. Auth check → 2. Story lookup → 3. Ownership gate    │    │
│  │  4. Render bytes → 5. putExport → 6. signGet            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ EpubExporter     │  │ PdfExporter      │                    │
│  │ (NEW)            │  │ (UPGRADED)       │                    │
│  │                  │  │                  │                    │
│  │ - epub metadata  │  │ - embedded font  │                    │
│  │ - XHTML chapters │  │ - page numbers   │                    │
│  │ - TOC/NCX/Nav    │  │ - running header │                    │
│  │ - CSS stylesheet │  │ - scene breaks   │                    │
│  │ - watermark      │  │ - Vietnamese     │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Object_Storage (S3-compatible)                                  │
│  users/{userId}/exports/{storyId}.epub                          │
│  users/{userId}/exports/{storyId}.pdf                           │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **EPUB library**: Use `jszip` (already a dependency) to manually construct the EPUB archive. This avoids adding a heavy EPUB library and gives full control over the XHTML output, metadata, and structure. EPUB is just a ZIP with a specific layout.

2. **PDF font strategy**: Bundle Noto Serif (Google Fonts, OFL license) as the embedded font. Noto Serif has complete Vietnamese coverage and is freely redistributable. The font file is loaded once at module initialization and reused across exports.

3. **Markdown-to-XHTML conversion**: A custom lightweight converter handles the subset of markdown used in story content (paragraphs, emphasis, strong, scene breaks). This avoids pulling in a full markdown parser for a narrow use case.

4. **Export pipeline reuse**: The new EPUB endpoint plugs into the existing `runExportPipeline` by adding `'epub'` to the `ExportKind` union type. The pipeline's auth/ownership/persist/sign flow remains unchanged.

5. **PDF upgrade is backward-compatible**: The existing `/stories/:id/export/pdf` endpoint continues to work. The `PdfExporter` class is upgraded in-place with the new font, layout features, and scene break handling.

## Components and Interfaces

### EpubExporter (NEW)

```typescript
// apps/api/src/export/epub.ts

export interface EpubExportChapter {
  index: number;
  title?: string;
  content: string;
}

export interface EpubExportStory {
  id: string;
  title?: string;
  overview?: string;
  language?: string;  // ISO 639-1 code, defaults to 'vi'
  chapters: EpubExportChapter[];
}

export interface EpubExportAccount {
  email: string;
}

export interface EpubExportInput {
  story: EpubExportStory;
  account: EpubExportAccount;
}

export class EpubExporter {
  async exportStory(input: EpubExportInput): Promise<Uint8Array>;
}
```

### MarkdownToXhtml Converter (NEW)

```typescript
// apps/api/src/export/markdownToXhtml.ts

/**
 * Converts chapter content (plain text with limited markdown) to
 * XHTML fragment suitable for embedding in EPUB chapter documents.
 */
export function convertMarkdownToXhtml(content: string): string;
```

### PdfExporter (UPGRADED)

```typescript
// apps/api/src/export/pdf.ts (additions to existing interface)

export interface PdfExportStory {
  id: string;
  title?: string;
  overview?: string;
  language?: string;  // ISO 639-1 code for font selection
  chapters: PdfExportChapter[];
}
```

### ExportKind Extension

```typescript
// apps/api/src/storage/index.ts
export type ExportKind = 'markdown_zip' | 'pdf' | 'epub';
```

### Export Route Extension

```typescript
// apps/api/src/export/route.ts — additions to runExportPipeline
// New branch for kind === 'epub' constructs EpubExportInput and calls epubExporter.exportStory
```

### ExportButtons (MODIFIED)

```typescript
// apps/web/src/export/ExportButtons.tsx
// Adds 'epub' to the RequestState.which union
// Adds handleEpub callback following same pattern as handleMarkdown
// Renders "Xuất EPUB" button between markdown and PDF buttons
```

## Data Models

### EPUB File Structure

```
story.epub (ZIP archive)
├── mimetype                    (uncompressed, "application/epub+zip")
├── META-INF/
│   └── container.xml           (points to OEBPS/content.opf)
├── OEBPS/
│   ├── content.opf             (package document with metadata + manifest + spine)
│   ├── toc.ncx                 (NCX table of contents for EPUB 2 readers)
│   ├── nav.xhtml               (EPUB 3 navigation document)
│   ├── style.css               (typography + scene-break + watermark styles)
│   ├── title.xhtml             (title page)
│   └── chapter-01.xhtml        (one per chapter)
│   └── chapter-02.xhtml
│   └── ...
```

### Object Storage Keys

| Format | Key Pattern | Content-Type |
|--------|-------------|--------------|
| Markdown ZIP | `users/{userId}/exports/{storyId}.zip` | `application/zip` |
| PDF | `users/{userId}/exports/{storyId}.pdf` | `application/pdf` |
| EPUB | `users/{userId}/exports/{storyId}.epub` | `application/epub+zip` |

### API Response Envelope (shared across all export formats)

```typescript
interface ExportResponse {
  url: string;        // Signed URL to download the file
  expiresAt: string;  // ISO-8601 UTC timestamp (≤ 60 min from now)
}
```

## Error Handling

| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Missing/invalid auth token | 401 | `unauthenticated` | Authentication required. |
| User does not own the story | 403 | `forbidden` | forbidden |
| Story not found | 404 | `not_found` | story {id} not found |
| Story has no exportable content | 400 | `invalid_request` | Story has no exportable content |
| EPUB generation fails | 500 | `internal_error` | Internal server error. |
| PDF generation fails | 500 | `internal_error` | Internal server error. |
| Object_Storage write fails | 500 | `internal_error` | Internal server error. |
| Signed URL TTL exceeds ceiling | 500 | `internal_error` | signed URL TTL exceeds export ceiling |

All error responses follow the existing envelope: `{ error: { code: string, message: string } }`.

The Web_Client displays the server-provided `error.message` when available, falling back to `"Không thể xuất truyện. Vui lòng thử lại."` for network errors or missing messages.

## Correctness Properties

### Property 1: EPUB Structure Validity

**Validates: Requirements 1.1, 1.4, 1.5**

For all valid story inputs with at least one non-empty chapter:
- The generated EPUB is a valid ZIP archive
- The ZIP contains `mimetype` as the first entry (uncompressed, value `application/epub+zip`)
- The ZIP contains `META-INF/container.xml`
- The ZIP contains a `.opf` package file
- The number of chapter XHTML files equals the number of chapters in the input
- The OPF spine lists all chapter documents in order

### Property 2: EPUB Metadata Completeness

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

For all valid story inputs:
- `dc:title` in the OPF equals the story title
- `dc:creator` equals the account email
- `dc:language` equals the story language code
- `dc:identifier` equals the story id
- `dc:publisher` equals `Drama15 Lite Studio`
- When overview is present, `dc:description` contains the overview text
- When overview is absent, `dc:description` is not present

### Property 3: EPUB Content Round-Trip

**Validates: Requirements 3.1, 10.1, 10.3**

For all chapter content strings containing Vietnamese text:
- Parsing the generated EPUB and extracting the text content of each chapter XHTML produces output that contains all original text (whitespace-normalized)
- No Unicode code points are lost or replaced during the conversion
- All XHTML files declare UTF-8 encoding

### Property 4: Scene Break Preservation

**Validates: Requirements 3.3, 5.5**

For all chapter content containing N scene break markers (`***`, `---`, or `* * *`):
- The EPUB XHTML output contains exactly N `<hr` elements
- The PDF output contains at least N visual separator renderings

### Property 5: Watermark Invariant

**Validates: Requirements 6.1, 7.1**

For all valid exports:
- Every chapter XHTML in the EPUB contains exactly one HTML comment matching the format `<!-- Drama15Lite SaaS export | account: {email} | storyId: {id} -->`
- The PDF watermark text `Drama15Lite SaaS · {email} · story:{id}` appears on every page of the generated document

### Property 6: Chapter Count Invariant

**Validates: Requirements 1.4, 5.1**

For all stories with N chapters (N ≥ 1):
- The EPUB contains exactly N chapter XHTML documents
- The PDF contains at least N+1 pages (1 title page + at least 1 page per chapter)

### Property 7: Markdown Formatting Round-Trip

**Validates: Requirements 3.4, 3.5**

For all chapter content containing emphasis (`*text*`) and strong (`**text**`) markers:
- The EPUB XHTML output contains `<em>` tags for single-asterisk emphasis
- The EPUB XHTML output contains `<strong>` tags for double-asterisk emphasis
- The text content within the tags matches the original marked text

### Property 8: Export Response Envelope Consistency

**Validates: Requirements 9.1, 9.2**

For all successful export requests (markdown, epub, pdf):
- The response body contains `url` (non-empty string starting with `http`)
- The response body contains `expiresAt` (valid ISO-8601 timestamp)
- The `expiresAt` timestamp is within 60 minutes of the request time

## Testing Strategy

- **Unit tests for EpubExporter**: Generate EPUB from sample stories, unzip the result, validate structure (mimetype, container.xml, OPF, chapter XHTML files, TOC).
- **Unit tests for markdownToXhtml**: Test paragraph splitting, emphasis, strong, scene breaks, dialogue preservation with Vietnamese content.
- **Unit tests for upgraded PdfExporter**: Generate PDF, verify page count ≥ N+1, verify embedded font presence, verify watermark on all pages.
- **Property-based tests**: Use fast-check to generate random story content (including Vietnamese characters, scene breaks, emphasis markers) and verify structural invariants hold.
- **Integration tests for export route**: Test the full pipeline with mocked Object_Storage to verify auth checks, error responses, and response envelope format.
- **Web client tests**: Test ExportButtons renders EPUB button, handles click → POST → download flow, error states.
