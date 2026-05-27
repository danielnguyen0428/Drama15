/**
 * Unit tests for `MarkdownZipExporter` (Task 14.1).
 *
 * Validates: Requirements 11.1, 11.4.
 *
 * Coverage:
 *  - The produced ZIP byte stream is a valid archive (parses via JSZip).
 *  - It contains exactly one file per chapter, named `chapter-{NN}.md`.
 *  - Every file ends with the literal hidden comment carrying the user's
 *    email and the story id (Requirement 11.4).
 *  - Special characters in email and storyId are written verbatim — no
 *    HTML or Markdown escaping inside the watermark line.
 *  - Empty-content chapters still produce a file ending with the comment.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';

import {
  MarkdownZipExporter,
  buildHiddenComment,
  buildChapterFileName,
  type MarkdownExportChapter,
  type MarkdownExportInput
} from '../../src/export/markdownZip.js';

function makeChapter(
  index: number,
  title: string,
  content: string
): MarkdownExportChapter {
  return { index, title, content };
}

function buildBaseInput(overrides?: Partial<MarkdownExportInput>): MarkdownExportInput {
  const story = overrides?.story ?? {
    id: 'story-abc-123',
    title: 'Sample Drama',
    chapters: Array.from({ length: 10 }, (_, i) =>
      makeChapter(i + 1, `Chapter ${i + 1}`, `Body of chapter ${i + 1}.`)
    )
  };
  const account = overrides?.account ?? { email: 'user@example.com' };
  return { story, account };
}

/** Load a zip archive from raw bytes for assertion. */
async function loadZip(bytes: Uint8Array): Promise<JSZip> {
  return JSZip.loadAsync(bytes);
}

/** Read every file as text, sorted by file name for deterministic iteration. */
async function readAllFiles(
  zip: JSZip
): Promise<ReadonlyArray<{ name: string; content: string }>> {
  const entries: Array<{ name: string; content: string }> = [];
  const files = Object.values(zip.files);
  for (const file of files) {
    if (file.dir) continue;
    const content = await file.async('string');
    entries.push({ name: file.name, content });
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return entries;
}

describe('MarkdownZipExporter', () => {
  it('produces ZIP bytes that JSZip can parse back', async () => {
    const exporter = new MarkdownZipExporter();
    const bytes = await exporter.exportStory(buildBaseInput());

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);

    // PK\x03\x04 is the standard local-file-header magic for a ZIP archive.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    // And it round-trips through JSZip.loadAsync (the canonical parser).
    const zip = await loadZip(bytes);
    expect(zip).toBeInstanceOf(JSZip);
  });

  it('contains exactly one file per chapter, named chapter-{index}.md with zero-padding', async () => {
    const exporter = new MarkdownZipExporter();
    const input = buildBaseInput();
    const bytes = await exporter.exportStory(input);
    const zip = await loadZip(bytes);
    const files = await readAllFiles(zip);

    expect(files).toHaveLength(input.story.chapters.length);

    const expectedNames = input.story.chapters.map((c) =>
      buildChapterFileName(c.index, 2)
    );
    expectedNames.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(files.map((f) => f.name)).toEqual(expectedNames);

    // Sanity: the canonical 10-chapter story uses a 2-digit pad so a
    // lexicographic listing matches the numeric chapter order.
    expect(files[0]?.name).toBe('chapter-01.md');
    expect(files[files.length - 1]?.name).toBe('chapter-10.md');
  });

  it('appends the hidden tracing comment to every file as the final line', async () => {
    const exporter = new MarkdownZipExporter();
    const input = buildBaseInput();
    const bytes = await exporter.exportStory(input);
    const zip = await loadZip(bytes);
    const files = await readAllFiles(zip);

    const expectedComment = buildHiddenComment(
      input.account.email,
      input.story.id
    );

    expect(expectedComment).toBe(
      '<!-- Drama15Lite SaaS export | account: user@example.com | storyId: story-abc-123 -->'
    );

    for (const file of files) {
      expect(
        file.content,
        `file ${file.name} should end with the hidden comment`
      ).toMatch(new RegExp(`${escapeRegex(expectedComment)}$`));

      // The comment must appear on its own final line — i.e. nothing follows
      // it (no trailing whitespace, no extra newlines).
      expect(file.content.endsWith(expectedComment)).toBe(true);
    }
  });

  it('renders special characters in email and storyId verbatim (no HTML or Markdown escaping)', async () => {
    const exporter = new MarkdownZipExporter();
    // Use characters that a naive HTML escaper would mangle (`&`, `<`, `>`),
    // along with Markdown-significant characters (`_`, `*`, backtick) and a
    // couple of multi-byte sequences. None of these may be transformed
    // inside the hidden comment.
    const email = 'user.name+tag&<weird>@sub.example.co.uk';
    const storyId = 'story_id*with`backticks`-42&<x>';

    const input: MarkdownExportInput = {
      story: {
        id: storyId,
        title: 'Edge cases',
        chapters: [
          makeChapter(1, 'Chương 1: Mở đầu', 'Nội dung chương 1.'),
          makeChapter(2, 'Chương 2: Cao trào', 'Nội dung *chương* 2.')
        ]
      },
      account: { email }
    };

    const bytes = await exporter.exportStory(input);
    const zip = await loadZip(bytes);
    const files = await readAllFiles(zip);

    const expectedComment = buildHiddenComment(email, storyId);
    expect(expectedComment).toContain(email);
    expect(expectedComment).toContain(storyId);
    // Sanity: nothing in the helper has touched these substrings.
    expect(expectedComment).toContain('&<weird>');
    expect(expectedComment).toContain('*with`backticks`');

    expect(files).toHaveLength(input.story.chapters.length);
    for (const file of files) {
      expect(file.content.endsWith(expectedComment)).toBe(true);
      expect(file.content).toContain(email);
      expect(file.content).toContain(storyId);
    }
  });

  it('still writes the hidden comment for empty-content chapters', async () => {
    const exporter = new MarkdownZipExporter();
    const input: MarkdownExportInput = {
      story: {
        id: 'empty-bodies-story',
        title: 'Empty bodies',
        chapters: [
          makeChapter(1, 'Empty one', ''),
          makeChapter(2, 'Empty two', '   \n\n   '),
          makeChapter(3, 'Filled', 'Has body text.')
        ]
      },
      account: { email: 'empty@example.com' }
    };

    const bytes = await exporter.exportStory(input);
    const zip = await loadZip(bytes);
    const files = await readAllFiles(zip);

    const expectedComment = buildHiddenComment(
      input.account.email,
      input.story.id
    );

    expect(files).toHaveLength(input.story.chapters.length);
    for (const file of files) {
      expect(file.content.endsWith(expectedComment)).toBe(true);
      // The comment must be the literal final line — never empty.
      const lines = file.content.split('\n');
      expect(lines[lines.length - 1]).toBe(expectedComment);
    }
  });
});

/** Escape a string so it can be used inside a `RegExp` literal. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
