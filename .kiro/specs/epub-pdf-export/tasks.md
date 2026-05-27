# Implementation Plan: EPUB/PDF Export

## Overview

Tasks for implementing EPUB/PDF export feature. The work is organized into 6 groups: markdown-to-XHTML converter, EPUB exporter, PDF exporter upgrade, route registration, web client UI, and end-to-end validation.

## Tasks

- [x] 1. Markdown-to-XHTML Converter
  - [x] 1.1 Create `apps/api/src/export/markdownToXhtml.ts` with a `convertMarkdownToXhtml` function that converts chapter content (plain text with markdown formatting) to valid XHTML fragments
  - [x] 1.2 Implement paragraph splitting in markdownToXhtml: consecutive non-empty lines become a single `<p>`, blank lines separate paragraphs
  - [x] 1.3 Implement scene break detection in markdownToXhtml: lines matching `***`, `---`, or `* * *` (with optional surrounding whitespace) become `<hr class="scene-break"/>`
  - [x] 1.4 Implement emphasis in markdownToXhtml: `*text*` and `_text_` become `<em>text</em>`
  - [x] 1.5 Implement strong emphasis in markdownToXhtml: `**text**` and `__text__` become `<strong>text</strong>`
  - [x] 1.6 Preserve dialogue lines in markdownToXhtml (lines starting with `"`, `"`, `—`, or `–`) as distinct paragraphs
  - [x] 1.7 Write unit tests for markdownToXhtml covering: plain paragraphs, scene breaks, emphasis, strong, dialogue, Vietnamese content, mixed formatting

- [x] 2. EPUB Exporter Core
  - [x] 2.1 Create `apps/api/src/export/epub.ts` with `EpubExporter` class and `EpubExportInput` interface matching the design
  - [x] 2.2 Implement EPUB package structure in EpubExporter: `mimetype` (uncompressed, first entry), `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/toc.ncx`, `OEBPS/nav.xhtml`
  - [x] 2.3 Implement OPF metadata generation with dc:title, dc:creator, dc:language, dc:identifier, dc:publisher, dc:description (when overview present)
  - [x] 2.4 Implement chapter XHTML generation: each chapter becomes `OEBPS/chapter-{index}.xhtml` using `convertMarkdownToXhtml` for body content
  - [x] 2.5 Implement NCX table of contents with navPoints for each chapter
  - [x] 2.6 Implement EPUB Nav document (`nav.xhtml`) with ordered list of chapter links
  - [x] 2.7 Implement CSS stylesheet (`OEBPS/style.css`) with typography defaults (font-size, line-height, margins, scene-break styling, footer watermark)
  - [x] 2.8 Implement title page (`OEBPS/title.xhtml`) with story title, author email, and overview
  - [x] 2.9 Implement EPUB watermark: hidden HTML comment at end of each chapter XHTML + footer CSS class
  - [x] 2.10 Implement empty-content validation in EpubExporter: throw error if story has no chapters or all chapters have empty content
  - [x] 2.11 Write unit tests for EpubExporter: valid ZIP structure, metadata fields, chapter count, TOC entries, watermark presence, empty story rejection, Vietnamese content preservation

- [x] 3. PDF Exporter Upgrade
  - [x] 3.1 Add Noto Serif font files (Regular + Bold) to `apps/api/src/export/fonts/` directory (download from Google Fonts, OFL license)
  - [x] 3.2 Modify `PdfExporter` to register and use Noto Serif as the primary font (replacing Helvetica for body text)
  - [x] 3.3 Implement font embedding in PdfExporter: register `NotoSerif-Regular.ttf` for body text (11pt) and `NotoSerif-Bold.ttf` for headings (18pt)
  - [x] 3.4 Set line spacing to 1.5× font size for body text in PdfExporter
  - [x] 3.5 Implement page numbers in PDF footer (centered, all pages except title page)
  - [x] 3.6 Implement running header with story title in PDF (top of page, all pages except title page and chapter opening pages)
  - [x] 3.7 Implement scene break rendering in PDF: detect `***`, `---`, `* * *` in content and render as centered ornamental separator
  - [x] 3.8 Implement paragraph formatting in PDF: first-line indentation (1em) for body paragraphs after the first paragraph in each section
  - [x] 3.9 Adjust PDF watermark positioning to render below page number in footer
  - [x] 3.10 Update `PdfExportStory` interface to include optional `language` field
  - [x] 3.11 Write unit tests for upgraded PdfExporter: Vietnamese text rendering, page count, font embedding verification, scene break detection, page number presence

- [x] 4. Route Registration and Export Pipeline
  - [x] 4.1 Add `'epub'` to the `ExportKind` type union in `apps/api/src/storage/index.ts`
  - [x] 4.2 Update `putExport` in Object_Storage service to handle `epub` kind (file extension `.epub`, content-type `application/epub+zip`)
  - [x] 4.3 Add EPUB branch to `runExportPipeline` in `apps/api/src/export/route.ts`: construct `EpubExportInput` from story detail (include language from story config)
  - [x] 4.4 Register `POST /stories/:id/export/epub` endpoint in `createExportRoutePlugin` using the shared `handler('epub')` pattern
  - [x] 4.5 Add empty-content validation in the export pipeline: if `EpubExporter` throws a validation error, map it to 400 `invalid_request`
  - [x] 4.6 Write integration tests for EPUB route: auth checks (401, 403), not-found (404), empty story (400), successful export (200 with url + expiresAt)

- [x] 5. Web Client UI
  - [x] 5.1 Add "Xuất EPUB" button to `ExportButtons.tsx` component, positioned between the markdown and PDF buttons
  - [x] 5.2 Implement EPUB export handler in ExportButtons: POST to `/stories/:id/export/epub`, trigger download via `triggerDownload(url)` on success
  - [x] 5.3 Ensure all three export buttons share the `inFlightRef` mutex (only one export at a time)
  - [x] 5.4 Update loading state to show which format is being exported (e.g., "Đang xuất EPUB…")
  - [x] 5.5 Write unit tests for ExportButtons: EPUB button renders, click triggers POST, download triggered on success, error state displayed, buttons disabled during flight

- [x] 6. End-to-End Validation (manual)
  - [x] 6.1 Manually test EPUB export with a Vietnamese story: download, open in Calibre/Apple Books, verify chapter navigation and text rendering
    - _optional_
  - [x] 6.2 Manually test PDF export with a Vietnamese story: download, verify font rendering, page numbers, headers, scene breaks, watermark
    - _optional_
  - [x] 6.3 Verify signed URL TTL compliance: confirm `expiresAt` is within 60 minutes of request time for EPUB endpoint
    - _optional_
  - [x] 6.4 Verify EPUB validates against epubcheck (W3C EPUB validator) without errors
    - _optional_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "3.1"] },
    { "id": 1, "tasks": ["1.7", "2.1", "2.2", "2.3", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "3.2", "3.3", "4.1"] },
    { "id": 2, "tasks": ["2.4", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "4.2"] },
    { "id": 3, "tasks": ["2.11", "3.11", "4.3", "4.4", "4.5", "5.1", "5.2", "5.3", "5.4"] },
    { "id": 4, "tasks": ["4.6", "5.5"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.3", "6.4"] }
  ]
}
```
retry

## Notes

- Task 3.1 (font files) requires downloading Noto Serif from Google Fonts. The files are ~300KB each and covered by the Open Font License.
- The existing `PdfExporter` tests will need updating after the font change (Task 3.11) since the output bytes will differ.
- Tasks 6.1-6.4 are manual validation steps that should be performed before merging.
- The `jszip` package is already a dependency (used by `MarkdownZipExporter`), so no new dependencies are needed for EPUB generation.
