// Story exporters (client-side, zero runtime dependencies).
//
// The Markdown export already lives inline in StoryWorkspace; this module adds
// EPUB and PDF for the finished manuscript. Per product decision the exports
// contain ONLY the story itself — the title and the chapters — not the concept,
// outline, bible, or quality reports.
//
// EPUB: we assemble a valid EPUB2 container by hand and zip it with a tiny
// store-only (no compression) ZIP writer. Store mode keeps the writer ~60 lines
// and still produces a spec-valid archive that Apple Books, Calibre, Google Play
// Books, and KOReader all open. XHTML is UTF-8, so Vietnamese diacritics survive
// exactly.
//
// PDF: rendering a real PDF client-side with correct Vietnamese diacritics would
// require bundling a Unicode TrueType font (~300KB+) into jsPDF. Instead we open
// a clean print window and let the browser's native "Save as PDF" handle text
// shaping and fonts — perfect diacritics, zero bundle cost.

export type ExportChapter = { index: number; title?: string; content: string };

export function slugifyForFilename(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'drama15-story'
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Split a chapter's plain-text body into paragraphs on blank lines, matching how
// the reader renders prose (see TypewriterProse). Single newlines inside a
// paragraph become <br/> so intentional line breaks survive.
function renderChapterBodyHtml(content: string): string {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    return '<p></p>';
  }
  return paragraphs
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

function chapterHeading(chapter: ExportChapter, chapterWord: string): string {
  const title = chapter.title?.trim();
  return title
    ? `${chapterWord} ${chapter.index}: ${title}`
    : `${chapterWord} ${chapter.index}`;
}

// ─── EPUB ────────────────────────────────────────────────────────────────────

type EpubLabels = { chapterWord: string; untitled: string };

export function buildEpubBlob(
  title: string,
  chapters: ExportChapter[],
  labels: EpubLabels,
): Blob {
  const safeTitle = title.trim() || labels.untitled;
  const bookId = `urn:uuid:${cryptoRandomUuid()}`;
  const lang = 'vi';

  const chapterFiles = chapters.map((chapter, order) => {
    const id = `chapter-${order + 1}`;
    const href = `${id}.xhtml`;
    const heading = chapterHeading(chapter, labels.chapterWord);
    const xhtml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE html>',
      '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="' + lang + '" lang="' + lang + '">',
      '<head>',
      `<title>${escapeHtml(heading)}</title>`,
      '<meta charset="UTF-8"/>',
      '<link rel="stylesheet" type="text/css" href="style.css"/>',
      '</head>',
      '<body>',
      `<h2>${escapeHtml(heading)}</h2>`,
      renderChapterBodyHtml(chapter.content),
      '</body>',
      '</html>',
    ].join('\n');
    return { id, href, heading, xhtml };
  });

  const files: ZipEntry[] = [];

  // mimetype MUST be the first entry and stored uncompressed.
  files.push({ path: 'mimetype', data: textBytes('application/epub+zip') });

  files.push({
    path: 'META-INF/container.xml',
    data: textBytes(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
        '  <rootfiles>',
        '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>',
        '  </rootfiles>',
        '</container>',
      ].join('\n'),
    ),
  });

  files.push({
    path: 'OEBPS/style.css',
    data: textBytes(
      [
        'body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; margin: 5%; }',
        'h1 { text-align: center; font-size: 1.8em; margin: 2em 0 1em; }',
        'h2 { font-size: 1.3em; margin: 1.5em 0 1em; page-break-before: always; }',
        'p { margin: 0 0 1em; text-indent: 1.4em; text-align: justify; }',
        'p:first-of-type { text-indent: 0; }',
      ].join('\n'),
    ),
  });

  const titleXhtml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE html>',
    '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="' + lang + '" lang="' + lang + '">',
    '<head>',
    `<title>${escapeHtml(safeTitle)}</title>`,
    '<meta charset="UTF-8"/>',
    '<link rel="stylesheet" type="text/css" href="style.css"/>',
    '</head>',
    '<body>',
    `<h1>${escapeHtml(safeTitle)}</h1>`,
    '</body>',
    '</html>',
  ].join('\n');
  files.push({ path: 'OEBPS/title.xhtml', data: textBytes(titleXhtml) });

  for (const chapter of chapterFiles) {
    files.push({ path: `OEBPS/${chapter.href}`, data: textBytes(chapter.xhtml) });
  }

  const manifestItems = [
    '<item id="style" href="style.css" media-type="text/css"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>',
    ...chapterFiles.map(
      (chapter) =>
        `<item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml"/>`,
    ),
  ].join('\n    ');

  const spineItems = [
    '<itemref idref="title"/>',
    ...chapterFiles.map((chapter) => `<itemref idref="${chapter.id}"/>`),
  ].join('\n    ');

  const contentOpf = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">',
    '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">',
    `    <dc:title>${escapeHtml(safeTitle)}</dc:title>`,
    `    <dc:language>${lang}</dc:language>`,
    `    <dc:identifier id="BookId">${escapeHtml(bookId)}</dc:identifier>`,
    '    <dc:creator>Drama15</dc:creator>',
    '  </metadata>',
    '  <manifest>',
    `    ${manifestItems}`,
    '  </manifest>',
    '  <spine toc="ncx">',
    `    ${spineItems}`,
    '  </spine>',
    '</package>',
  ].join('\n');
  files.push({ path: 'OEBPS/content.opf', data: textBytes(contentOpf) });

  const navPoints = chapterFiles
    .map(
      (chapter, order) =>
        [
          `    <navPoint id="nav-${order + 1}" playOrder="${order + 1}">`,
          `      <navLabel><text>${escapeHtml(chapter.heading)}</text></navLabel>`,
          `      <content src="${chapter.href}"/>`,
          '    </navPoint>',
        ].join('\n'),
    )
    .join('\n');

  const tocNcx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">',
    '  <head>',
    `    <meta name="dtb:uid" content="${escapeHtml(bookId)}"/>`,
    '  </head>',
    `  <docTitle><text>${escapeHtml(safeTitle)}</text></docTitle>`,
    '  <navMap>',
    navPoints,
    '  </navMap>',
    '</ncx>',
  ].join('\n');
  files.push({ path: 'OEBPS/toc.ncx', data: textBytes(tocNcx) });

  const archive = zipStore(files);
  // Copy into a fresh ArrayBuffer-backed view so the Blob part type is exactly
  // Uint8Array<ArrayBuffer> (not ArrayBufferLike, which may be SharedArrayBuffer).
  return new Blob([archive.slice()], { type: 'application/epub+zip' });
}

// ─── PDF (via browser print) ───────────────────────────────────────────────

export function openPrintablePdf(
  title: string,
  chapters: ExportChapter[],
  labels: EpubLabels,
): boolean {
  const safeTitle = title.trim() || labels.untitled;
  const body = chapters
    .map(
      (chapter) =>
        `<section class="chapter"><h2>${escapeHtml(
          chapterHeading(chapter, labels.chapterWord),
        )}</h2>${renderChapterBodyHtml(chapter.content)}</section>`,
    )
    .join('\n');

  const doc = [
    '<!DOCTYPE html>',
    '<html lang="vi">',
    '<head>',
    '<meta charset="UTF-8"/>',
    `<title>${escapeHtml(safeTitle)}</title>`,
    '<style>',
    '@page { margin: 2cm; }',
    'body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; color: #111; }',
    'h1 { text-align: center; font-size: 2em; margin: 20vh 0 1em; }',
    'h2 { font-size: 1.4em; margin: 1.5em 0 1em; page-break-before: always; }',
    '.title-page + .chapter h2 { page-break-before: avoid; }',
    'p { margin: 0 0 1em; text-indent: 1.4em; text-align: justify; }',
    'section.chapter p:first-of-type { text-indent: 0; }',
    '</style>',
    '</head>',
    '<body>',
    `<div class="title-page"><h1>${escapeHtml(safeTitle)}</h1></div>`,
    body,
    '</body>',
    '</html>',
  ].join('\n');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return false;
  }
  printWindow.document.open();
  printWindow.document.write(doc);
  printWindow.document.close();
  // Give the new document a tick to lay out before invoking print.
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
  return true;
}

// ─── Minimal store-only ZIP writer ───────────────────────────────────────────

type ZipEntry = { path: string; data: Uint8Array };

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function cryptoRandomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: RFC4122-ish from Math.random (only used if crypto is unavailable).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (CRC_TABLE[(crc ^ bytes[i]!) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Build a ZIP archive with all entries stored (compression method 0). Returns
// the raw archive bytes. Sufficient and spec-valid for EPUB.
function zipStore(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = textBytes(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true); // local file header signature
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, 0, true); // method = store
    localView.setUint16(10, 0, true); // mod time
    localView.setUint16(12, 0, true); // mod date
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true); // compressed size
    localView.setUint32(22, size, true); // uncompressed size
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true); // extra length
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true); // central dir signature
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0, true); // flags
    centralView.setUint16(10, 0, true); // method
    centralView.setUint16(12, 0, true); // mod time
    centralView.setUint16(14, 0, true); // mod date
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true); // extra length
    centralView.setUint16(32, 0, true); // comment length
    centralView.setUint16(34, 0, true); // disk number
    centralView.setUint16(36, 0, true); // internal attrs
    centralView.setUint32(38, 0, true); // external attrs
    centralView.setUint32(42, offset, true); // local header offset
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);

    offset += localHeader.length + entry.data.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const centralOffset = offset;

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); // end of central dir signature
  endView.setUint16(4, 0, true); // disk number
  endView.setUint16(6, 0, true); // central dir start disk
  endView.setUint16(8, entries.length, true); // entries on this disk
  endView.setUint16(10, entries.length, true); // total entries
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true); // comment length

  const total =
    chunks.reduce((sum, chunk) => sum + chunk.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of [...chunks, ...central, end]) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
