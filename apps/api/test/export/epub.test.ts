/**
 * Unit tests for `EpubExporter` (Task 2.11).
 *
 * Validates: Requirements 1.1, 1.4, 1.5, 1.6, 2.1–2.6, 7.1, 10.1, 10.3.
 *
 * Coverage:
 *  - Valid ZIP structure: mimetype, META-INF/container.xml, OEBPS/content.opf.
 *  - Metadata fields: dc:title, dc:creator, dc:language, dc:identifier, dc:publisher, dc:description.
 *  - Chapter count: number of chapter-XX.xhtml files equals input chapters.
 *  - TOC entries: toc.ncx navPoints and nav.xhtml links for each chapter.
 *  - Watermark presence: hidden comment in each chapter XHTML.
 *  - Empty story rejection: throws on no chapters or all-empty chapters.
 *  - Vietnamese content preservation: diacriticals preserved without corruption.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';

import {
  EpubExporter,
  type EpubExportInput,
  type EpubExportStory,
  type EpubExportAccount,
} from '../../src/export/epub.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStory(overrides: Partial<EpubExportStory> = {}): EpubExportStory {
  return {
    id: 'story-abc-123',
    title: 'Truyện Thử Nghiệm',
    overview: 'Một câu chuyện thử nghiệm.',
    language: 'vi',
    chapters: [
      { index: 1, title: 'Chương Một', content: 'Nội dung chương một.' },
      { index: 2, title: 'Chương Hai', content: 'Nội dung chương hai.' },
    ],
    ...overrides,
  };
}

function makeAccount(overrides: Partial<EpubExportAccount> = {}): EpubExportAccount {
  return {
    email: 'user@example.com',
    ...overrides,
  };
}

function makeInput(
  storyOverrides: Partial<EpubExportStory> = {},
  accountOverrides: Partial<EpubExportAccount> = {}
): EpubExportInput {
  return {
    story: makeStory(storyOverrides),
    account: makeAccount(accountOverrides),
  };
}

async function generateAndUnzip(input: EpubExportInput): Promise<JSZip> {
  const exporter = new EpubExporter();
  const bytes = await exporter.exportStory(input);
  return JSZip.loadAsync(bytes);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EpubExporter', () => {
  // -------------------------------------------------------------------------
  // 1. Valid ZIP structure
  // -------------------------------------------------------------------------
  describe('valid ZIP structure', () => {
    it('mimetype file exists and contains "application/epub+zip"', async () => {
      const zip = await generateAndUnzip(makeInput());
      const mimetype = zip.file('mimetype');
      expect(mimetype).not.toBeNull();
      const content = await mimetype!.async('string');
      expect(content).toBe('application/epub+zip');
    });

    it('META-INF/container.xml exists', async () => {
      const zip = await generateAndUnzip(makeInput());
      const container = zip.file('META-INF/container.xml');
      expect(container).not.toBeNull();
      const content = await container!.async('string');
      expect(content).toContain('rootfile');
      expect(content).toContain('OEBPS/content.opf');
    });

    it('OEBPS/content.opf exists', async () => {
      const zip = await generateAndUnzip(makeInput());
      const opf = zip.file('OEBPS/content.opf');
      expect(opf).not.toBeNull();
      const content = await opf!.async('string');
      expect(content).toContain('<package');
      expect(content).toContain('version="3.0"');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Metadata fields
  // -------------------------------------------------------------------------
  describe('metadata fields', () => {
    it('dc:title is set to the story title', async () => {
      const zip = await generateAndUnzip(makeInput({ title: 'Câu Chuyện Của Tôi' }));
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      expect(opf).toContain('<dc:title>Câu Chuyện Của Tôi</dc:title>');
    });

    it('dc:creator is set to the account email', async () => {
      const zip = await generateAndUnzip(makeInput({}, { email: 'author@drama15.com' }));
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      expect(opf).toContain('<dc:creator>author@drama15.com</dc:creator>');
    });

    it('dc:language is set to the story language code', async () => {
      const zip = await generateAndUnzip(makeInput({ language: 'en' }));
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      expect(opf).toContain('<dc:language>en</dc:language>');
    });

    it('dc:language defaults to vi when not specified', async () => {
      const zip = await generateAndUnzip(makeInput({ language: undefined }));
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      expect(opf).toContain('<dc:language>vi</dc:language>');
    });

    it('dc:identifier is set to the story id', async () => {
      const zip = await generateAndUnzip(makeInput({ id: 'my-story-id-456' }));
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      expect(opf).toContain('<dc:identifier>urn:uuid:my-story-id-456</dc:identifier>');
    });

    it('dc:publisher is set to Drama15 Lite Studio', async () => {
      const zip = await generateAndUnzip(makeInput());
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      expect(opf).toContain('<dc:publisher>Drama15 Lite Studio</dc:publisher>');
    });

    it('dc:description is present when overview is provided', async () => {
      const zip = await generateAndUnzip(makeInput({ overview: 'Tóm tắt câu chuyện.' }));
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      expect(opf).toContain('<dc:description>Tóm tắt câu chuyện.</dc:description>');
    });

    it('dc:description is absent when overview is not provided', async () => {
      const zip = await generateAndUnzip(makeInput({ overview: undefined }));
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      expect(opf).not.toContain('<dc:description');
    });

    it('dc:description is absent when overview is empty string', async () => {
      const zip = await generateAndUnzip(makeInput({ overview: '   ' }));
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      expect(opf).not.toContain('<dc:description');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Chapter count
  // -------------------------------------------------------------------------
  describe('chapter count', () => {
    it('number of chapter XHTML files equals number of input chapters (2 chapters)', async () => {
      const zip = await generateAndUnzip(makeInput());
      const chapterFiles = Object.keys(zip.files).filter(
        (name) => name.startsWith('OEBPS/chapter-') && name.endsWith('.xhtml')
      );
      expect(chapterFiles).toHaveLength(2);
    });

    it('number of chapter XHTML files equals number of input chapters (5 chapters)', async () => {
      const chapters = Array.from({ length: 5 }, (_, i) => ({
        index: i + 1,
        title: `Chapter ${i + 1}`,
        content: `Content for chapter ${i + 1}.`,
      }));
      const zip = await generateAndUnzip(makeInput({ chapters }));
      const chapterFiles = Object.keys(zip.files).filter(
        (name) => name.startsWith('OEBPS/chapter-') && name.endsWith('.xhtml')
      );
      expect(chapterFiles).toHaveLength(5);
    });

    it('single chapter produces exactly one chapter file', async () => {
      const chapters = [{ index: 1, title: 'Solo', content: 'Only chapter.' }];
      const zip = await generateAndUnzip(makeInput({ chapters }));
      const chapterFiles = Object.keys(zip.files).filter(
        (name) => name.startsWith('OEBPS/chapter-') && name.endsWith('.xhtml')
      );
      expect(chapterFiles).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 4. TOC entries
  // -------------------------------------------------------------------------
  describe('TOC entries', () => {
    it('toc.ncx contains navPoints for each chapter', async () => {
      const chapters = [
        { index: 1, title: 'Mở Đầu', content: 'Content 1.' },
        { index: 2, title: 'Phát Triển', content: 'Content 2.' },
        { index: 3, title: 'Kết Thúc', content: 'Content 3.' },
      ];
      const zip = await generateAndUnzip(makeInput({ chapters }));
      const ncx = await zip.file('OEBPS/toc.ncx')!.async('string');

      expect(ncx).toContain('navPoint');
      // Should have 3 navPoints
      const navPointMatches = ncx.match(/<navPoint/g);
      expect(navPointMatches).toHaveLength(3);

      // Each chapter title should appear
      expect(ncx).toContain('Mở Đầu');
      expect(ncx).toContain('Phát Triển');
      expect(ncx).toContain('Kết Thúc');
    });

    it('nav.xhtml contains links for each chapter', async () => {
      const chapters = [
        { index: 1, title: 'Chương 1', content: 'Content 1.' },
        { index: 2, title: 'Chương 2', content: 'Content 2.' },
      ];
      const zip = await generateAndUnzip(makeInput({ chapters }));
      const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');

      // Should contain links to chapter files
      expect(nav).toContain('chapter-01.xhtml');
      expect(nav).toContain('chapter-02.xhtml');

      // Should contain chapter titles
      expect(nav).toContain('Chương 1');
      expect(nav).toContain('Chương 2');

      // Should have <a> elements for each chapter
      const linkMatches = nav.match(/<a href="chapter-/g);
      expect(linkMatches).toHaveLength(2);
    });

    it('toc.ncx uses fallback title when chapter title is missing', async () => {
      const chapters = [
        { index: 1, content: 'Content without title.' },
      ];
      const zip = await generateAndUnzip(makeInput({ chapters }));
      const ncx = await zip.file('OEBPS/toc.ncx')!.async('string');
      expect(ncx).toContain('Chapter 1');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Watermark presence
  // -------------------------------------------------------------------------
  describe('watermark presence', () => {
    it('each chapter XHTML contains the hidden watermark comment', async () => {
      const input = makeInput(
        {
          id: 'wm-story-id',
          chapters: [
            { index: 1, title: 'Ch1', content: 'Content 1.' },
            { index: 2, title: 'Ch2', content: 'Content 2.' },
          ],
        },
        { email: 'watermark@test.com' }
      );
      const zip = await generateAndUnzip(input);

      const expectedComment = '<!-- Drama15Lite SaaS export | account: watermark@test.com | storyId: wm-story-id -->';

      const ch1 = await zip.file('OEBPS/chapter-01.xhtml')!.async('string');
      const ch2 = await zip.file('OEBPS/chapter-02.xhtml')!.async('string');

      expect(ch1).toContain(expectedComment);
      expect(ch2).toContain(expectedComment);
    });

    it('watermark comment contains the correct email and storyId', async () => {
      const input = makeInput(
        { id: 'unique-id-xyz' },
        { email: 'specific@user.vn' }
      );
      const zip = await generateAndUnzip(input);

      const ch1 = await zip.file('OEBPS/chapter-01.xhtml')!.async('string');
      expect(ch1).toContain('account: specific@user.vn');
      expect(ch1).toContain('storyId: unique-id-xyz');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Empty story rejection
  // -------------------------------------------------------------------------
  describe('empty story rejection', () => {
    it('throws error when story has no chapters', async () => {
      const exporter = new EpubExporter();
      const input = makeInput({ chapters: [] });

      await expect(exporter.exportStory(input)).rejects.toThrow(
        'Story has no exportable content'
      );
    });

    it('throws error when all chapters have empty content', async () => {
      const exporter = new EpubExporter();
      const input = makeInput({
        chapters: [
          { index: 1, title: 'Empty', content: '' },
          { index: 2, title: 'Also Empty', content: '   ' },
        ],
      });

      await expect(exporter.exportStory(input)).rejects.toThrow(
        'Story has no exportable content'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. Vietnamese content preservation
  // -------------------------------------------------------------------------
  describe('Vietnamese content preservation', () => {
    it('Vietnamese text with diacriticals (ệ, ở, ữ) appears in chapter XHTML without corruption', async () => {
      const vietnameseContent =
        'Việt Nam là đất nước xinh đẹp. Người dân ở đây rất thân thiện và hiếu khách. ' +
        'Những kỷ niệm khó quên sẽ ở mãi trong trái tim tôi. ' +
        'Cô giáo dạy chữ Nôm rất giỏi.';

      const input = makeInput({
        chapters: [
          { index: 1, title: 'Chương Việt Nam', content: vietnameseContent },
        ],
      });

      const zip = await generateAndUnzip(input);
      const chapterXhtml = await zip.file('OEBPS/chapter-01.xhtml')!.async('string');

      // Verify specific Vietnamese characters with complex diacriticals
      expect(chapterXhtml).toContain('Việt Nam');
      expect(chapterXhtml).toContain('ở đây');
      expect(chapterXhtml).toContain('kỷ niệm');
      expect(chapterXhtml).toContain('hiếu khách');
      expect(chapterXhtml).toContain('Những');
      expect(chapterXhtml).toContain('giỏi');
    });

    it('preserves combined diacritical marks (ệ, ở, ữ) specifically', async () => {
      const content = 'Hệ thống hoạt động tốt ở mọi nơi, giữ gìn truyền thống.';
      const input = makeInput({
        chapters: [{ index: 1, title: 'Test', content }],
      });

      const zip = await generateAndUnzip(input);
      const chapterXhtml = await zip.file('OEBPS/chapter-01.xhtml')!.async('string');

      // These characters have combined diacriticals
      expect(chapterXhtml).toContain('Hệ');   // e + hook below + circumflex
      expect(chapterXhtml).toContain('ở');     // o + horn + hook above
      expect(chapterXhtml).toContain('giữ');   // u + horn + tilde
    });

    it('chapter XHTML declares UTF-8 encoding', async () => {
      const input = makeInput({
        chapters: [{ index: 1, title: 'UTF8', content: 'Nội dung.' }],
      });

      const zip = await generateAndUnzip(input);
      const chapterXhtml = await zip.file('OEBPS/chapter-01.xhtml')!.async('string');

      expect(chapterXhtml).toContain('encoding="UTF-8"');
    });
  });
});
