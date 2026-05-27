# Requirements Document

## Introduction

This feature adds professional EPUB and PDF export capabilities to Drama15 Lite Studio's web application. Currently, the web client offers a basic markdown download and a `window.print()` PDF fallback. The API already has a server-side PDF exporter using PDFKit (with Helvetica fonts) and a markdown ZIP exporter. This feature extends the export system with:

1. A new EPUB export endpoint that produces standard ebook files readable on Kindle, Apple Books, Kobo, and other e-readers.
2. An upgraded PDF export that produces a professional book-like layout with proper Vietnamese typography, page numbers, headers/footers, and scene break formatting.
3. Updated web UI buttons that trigger both new export formats via the existing signed-URL download flow.

## Glossary

- **API_Gateway**: The Fastify-based backend server that handles authentication, authorization, and request routing.
- **Web_Client**: The React single-page application that users interact with in the browser.
- **EPUB_Exporter**: The server-side module responsible for generating EPUB files from story data.
- **PDF_Exporter**: The server-side module responsible for generating PDF files with professional book layout from story data.
- **Object_Storage**: The S3-compatible storage service where generated export files are persisted.
- **Story_Job**: A database record representing a generated story, including metadata and chapter references.
- **Export_Pipeline**: The existing server-side flow that renders export bytes, persists them to Object_Storage, and returns a signed URL.
- **Signed_URL**: A time-limited URL granting temporary read access to an object in Object_Storage (TTL ≤ 60 minutes per existing Requirement 11.2).
- **Scene_Break**: A visual separator within a chapter indicating a change in time, location, or point of view (typically rendered as `***` or `---` in markdown).
- **EPUB**: Electronic Publication format, an open standard for digital books defined by the W3C/IDPF.

## Requirements

### Requirement 1: EPUB Export Endpoint

**User Story:** As a user, I want to export my completed story as an EPUB file, so that I can read it on e-readers like Kindle, Apple Books, or Kobo.

#### Acceptance Criteria

1. WHEN a user requests EPUB export for a story, THE API_Gateway SHALL generate a valid EPUB 3.0 file containing all chapters of the story.
2. WHEN the EPUB file is generated, THE API_Gateway SHALL persist the file to Object_Storage at the path `users/{userId}/exports/{storyId}.epub` and return a Signed_URL with TTL ≤ 60 minutes.
3. THE EPUB_Exporter SHALL include a title page containing the story title and author email.
4. THE EPUB_Exporter SHALL render each chapter as a separate XHTML document within the EPUB package, with the chapter title as a heading.
5. THE EPUB_Exporter SHALL generate a table of contents (NCX and EPUB Nav) listing all chapters by title.
6. IF the story has no chapters or all chapters have empty content, THEN THE API_Gateway SHALL return a 400 response with error code `invalid_request` and a descriptive message.

### Requirement 2: EPUB Metadata

**User Story:** As a user, I want my exported EPUB to contain proper metadata, so that e-reader applications display correct book information.

#### Acceptance Criteria

1. THE EPUB_Exporter SHALL set the `dc:title` metadata field to the story title.
2. THE EPUB_Exporter SHALL set the `dc:creator` metadata field to the user's email address.
3. THE EPUB_Exporter SHALL set the `dc:language` metadata field to the story's output language code (e.g., `vi` for Vietnamese, `en` for English).
4. THE EPUB_Exporter SHALL set the `dc:identifier` metadata field to the Story_Job id.
5. THE EPUB_Exporter SHALL set the `dc:publisher` metadata field to `Drama15 Lite Studio`.
6. WHEN the story has an overview, THE EPUB_Exporter SHALL set the `dc:description` metadata field to the story overview text.

### Requirement 3: EPUB Content Formatting

**User Story:** As a user, I want my EPUB chapters to preserve dialogue, emphasis, and scene breaks, so that the reading experience matches the original story structure.

#### Acceptance Criteria

1. THE EPUB_Exporter SHALL render paragraph breaks in chapter content as separate `<p>` elements in the XHTML output.
2. WHEN chapter content contains dialogue lines (text enclosed in quotation marks or Vietnamese dialogue markers), THE EPUB_Exporter SHALL preserve the dialogue formatting in the XHTML output.
3. WHEN chapter content contains scene break markers (`***`, `---`, or `* * *`), THE EPUB_Exporter SHALL render a visual scene break element (an `<hr/>` with appropriate CSS styling).
4. WHEN chapter content contains emphasis markers (`*text*` or `_text_`), THE EPUB_Exporter SHALL render the text with `<em>` tags.
5. WHEN chapter content contains strong emphasis markers (`**text**` or `__text__`), THE EPUB_Exporter SHALL render the text with `<strong>` tags.
6. THE EPUB_Exporter SHALL embed a CSS stylesheet that provides readable typography defaults (font size, line height, margins) for the EPUB content.

### Requirement 4: PDF Export with Professional Typography

**User Story:** As a user, I want my exported PDF to have professional book-like typography with proper Vietnamese font support, so that the PDF looks polished and is readable.

#### Acceptance Criteria

1. THE PDF_Exporter SHALL embed a Unicode-compatible font that supports the full Vietnamese character set (all diacritical marks and tone marks).
2. THE PDF_Exporter SHALL use a serif font for chapter body text at a readable size (11–12pt).
3. THE PDF_Exporter SHALL use a distinct font weight or style for chapter titles (bold, 16–18pt).
4. THE PDF_Exporter SHALL set line spacing to at least 1.4× the font size for body text to ensure readability.
5. THE PDF_Exporter SHALL use A4 page size with margins of at least 20mm on all sides.

### Requirement 5: PDF Page Layout

**User Story:** As a user, I want my exported PDF to have proper page breaks, page numbers, and headers, so that it reads like a professionally formatted book.

#### Acceptance Criteria

1. THE PDF_Exporter SHALL start each chapter on a new page.
2. THE PDF_Exporter SHALL render page numbers in the footer of every page except the title page.
3. THE PDF_Exporter SHALL render the story title as a running header on every page except the title page and chapter opening pages.
4. THE PDF_Exporter SHALL render a title page containing the story title, author email, and story overview (when present).
5. WHEN chapter content contains scene break markers (`***`, `---`, or `* * *`), THE PDF_Exporter SHALL render a visual separator (centered ornamental break or whitespace gap) between scenes.
6. THE PDF_Exporter SHALL render paragraph breaks in chapter content with appropriate paragraph spacing or first-line indentation.

### Requirement 6: PDF Watermark Preservation

**User Story:** As a user, I understand that exported PDFs carry a watermark for traceability, so that leaked documents can be traced back to the originating account.

#### Acceptance Criteria

1. THE PDF_Exporter SHALL render the watermark text `Drama15Lite SaaS · {email} · story:{storyId}` in the footer of every page (preserving existing Requirement 11.3 behavior).
2. THE PDF_Exporter SHALL render the watermark in a small font size (8pt) with muted color so it does not interfere with reading.
3. THE PDF_Exporter SHALL position the watermark below the page number in the footer area.

### Requirement 7: EPUB Watermark

**User Story:** As a user, I understand that exported EPUBs carry a watermark for traceability, so that leaked documents can be traced back to the originating account.

#### Acceptance Criteria

1. THE EPUB_Exporter SHALL embed a hidden metadata comment in each chapter XHTML file in the format `<!-- Drama15Lite SaaS export | account: {email} | storyId: {storyId} -->`.
2. THE EPUB_Exporter SHALL include the watermark text `Drama15Lite SaaS · {email} · story:{storyId}` as a footer element in the EPUB CSS stylesheet, rendered in small muted text.

### Requirement 8: Web Client Export UI

**User Story:** As a user, I want to trigger EPUB and PDF exports from the story workspace, so that I can download my story in my preferred format without leaving the application.

#### Acceptance Criteria

1. WHEN a story generation is complete, THE Web_Client SHALL display an "Xuất EPUB" button in the export section.
2. WHEN the user clicks the "Xuất EPUB" button, THE Web_Client SHALL POST to `/stories/:id/export/epub` and trigger a file download using the returned Signed_URL.
3. WHEN a story generation is complete, THE Web_Client SHALL display an "Xuất PDF" button in the export section (replacing or upgrading the existing "In / Xuất PDF" button).
4. WHEN the user clicks the "Xuất PDF" button, THE Web_Client SHALL POST to `/stories/:id/export/pdf` and open the returned Signed_URL in a new browser tab.
5. WHILE an export request is in flight, THE Web_Client SHALL disable all export buttons and display a loading indicator on the active button.
6. IF an export request fails, THEN THE Web_Client SHALL display an inline error message with `role="alert"` containing the server error message or a fallback Vietnamese error message.

### Requirement 9: Export API Route Registration

**User Story:** As a developer, I want the EPUB export endpoint registered alongside the existing export routes, so that the export pipeline is consistent across all formats.

#### Acceptance Criteria

1. THE API_Gateway SHALL register a `POST /stories/:id/export/epub` endpoint that follows the same authentication, authorization, and ownership checks as the existing markdown and PDF export endpoints.
2. THE API_Gateway SHALL return the response envelope `{ url: string, expiresAt: string }` for the EPUB endpoint, matching the existing export response format.
3. IF the requested story does not exist, THEN THE API_Gateway SHALL return a 404 response with error code `not_found`.
4. IF the requesting user does not own the story, THEN THE API_Gateway SHALL return a 403 response with error code `forbidden`.
5. IF the requesting user is not authenticated, THEN THE API_Gateway SHALL return a 401 response with error code `unauthenticated`.

### Requirement 10: Vietnamese Text Handling

**User Story:** As a Vietnamese-speaking user, I want both EPUB and PDF exports to correctly render all Vietnamese characters, so that my stories are readable without encoding issues.

#### Acceptance Criteria

1. THE EPUB_Exporter SHALL declare UTF-8 encoding in all XHTML content documents and set the `xml:lang` attribute to the story's language code.
2. THE PDF_Exporter SHALL embed font subsets that include all Vietnamese Unicode code points used in the story content (U+0000–U+024F Latin Extended, U+1E00–U+1EFF Latin Extended Additional).
3. THE EPUB_Exporter SHALL produce valid UTF-8 encoded content that preserves all Vietnamese diacritical combinations without mojibake.
4. THE PDF_Exporter SHALL render combined Vietnamese diacritical marks (e.g., ệ, ở, ữ) as single glyphs without decomposition artifacts.
