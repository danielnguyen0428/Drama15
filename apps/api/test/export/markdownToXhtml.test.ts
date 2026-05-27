/**
 * Unit tests for `convertMarkdownToXhtml` (Tasks 1.1–1.6).
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 10.1, 10.3.
 *
 * Coverage:
 *  - Plain paragraphs: consecutive lines merge, blank lines separate.
 *  - Scene breaks: `***`, `---`, `* * *` become `<hr class="scene-break"/>`.
 *  - Emphasis: `*text*` and `_text_` become `<em>text</em>`.
 *  - Strong emphasis: `**text**` and `__text__` become `<strong>text</strong>`.
 *  - Dialogue preservation: lines starting with `"`, `\u201C`, `\u2014`, `\u2013`.
 *  - Vietnamese content: UTF-8 diacritical marks preserved without mojibake.
 *  - Mixed formatting: combinations of the above in a single input.
 */

import { describe, it, expect } from 'vitest';

import { convertMarkdownToXhtml } from '../../src/export/markdownToXhtml.js';

describe('convertMarkdownToXhtml', () => {
  // -------------------------------------------------------------------------
  // Paragraph splitting (Task 1.2)
  // -------------------------------------------------------------------------
  describe('paragraph splitting', () => {
    it('wraps a single line in <p> tags', () => {
      const result = convertMarkdownToXhtml('Hello world');
      expect(result).toBe('<p>Hello world</p>');
    });

    it('merges consecutive non-empty lines into a single <p>', () => {
      const input = 'Line one\nLine two\nLine three';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe('<p>Line one Line two Line three</p>');
    });

    it('separates paragraphs on blank lines', () => {
      const input = 'First paragraph\n\nSecond paragraph';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe('<p>First paragraph</p>\n<p>Second paragraph</p>');
    });

    it('handles multiple blank lines between paragraphs', () => {
      const input = 'Para one\n\n\n\nPara two';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe('<p>Para one</p>\n<p>Para two</p>');
    });

    it('returns empty string for empty input', () => {
      expect(convertMarkdownToXhtml('')).toBe('');
      expect(convertMarkdownToXhtml('   ')).toBe('');
      expect(convertMarkdownToXhtml('\n\n')).toBe('');
    });

    it('handles Windows-style line endings (CRLF)', () => {
      const input = 'Line one\r\nLine two\r\n\r\nNew paragraph';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe('<p>Line one Line two</p>\n<p>New paragraph</p>');
    });
  });

  // -------------------------------------------------------------------------
  // Scene breaks (Task 1.3)
  // -------------------------------------------------------------------------
  describe('scene breaks', () => {
    it('converts *** to <hr class="scene-break"/>', () => {
      const input = 'Before\n\n***\n\nAfter';
      const result = convertMarkdownToXhtml(input);
      expect(result).toContain('<hr class="scene-break"/>');
      expect(result).toBe(
        '<p>Before</p>\n<hr class="scene-break"/>\n<p>After</p>'
      );
    });

    it('converts --- to <hr class="scene-break"/>', () => {
      const input = 'Before\n\n---\n\nAfter';
      const result = convertMarkdownToXhtml(input);
      expect(result).toContain('<hr class="scene-break"/>');
    });

    it('converts * * * to <hr class="scene-break"/>', () => {
      const input = 'Before\n\n* * *\n\nAfter';
      const result = convertMarkdownToXhtml(input);
      expect(result).toContain('<hr class="scene-break"/>');
    });

    it('handles scene breaks with surrounding whitespace', () => {
      const input = 'Before\n\n   ***   \n\nAfter';
      const result = convertMarkdownToXhtml(input);
      expect(result).toContain('<hr class="scene-break"/>');
    });

    it('scene break without surrounding blank lines still works', () => {
      const input = 'Before\n***\nAfter';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe(
        '<p>Before</p>\n<hr class="scene-break"/>\n<p>After</p>'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Emphasis (Task 1.4)
  // -------------------------------------------------------------------------
  describe('emphasis', () => {
    it('converts *text* to <em>text</em>', () => {
      const result = convertMarkdownToXhtml('This is *important* text');
      expect(result).toBe('<p>This is <em>important</em> text</p>');
    });

    it('converts _text_ to <em>text</em>', () => {
      const result = convertMarkdownToXhtml('This is _important_ text');
      expect(result).toBe('<p>This is <em>important</em> text</p>');
    });

    it('handles multiple emphasis in one line', () => {
      const result = convertMarkdownToXhtml('*one* and *two*');
      expect(result).toBe('<p><em>one</em> and <em>two</em></p>');
    });
  });

  // -------------------------------------------------------------------------
  // Strong emphasis (Task 1.5)
  // -------------------------------------------------------------------------
  describe('strong emphasis', () => {
    it('converts **text** to <strong>text</strong>', () => {
      const result = convertMarkdownToXhtml('This is **bold** text');
      expect(result).toBe('<p>This is <strong>bold</strong> text</p>');
    });

    it('converts __text__ to <strong>text</strong>', () => {
      const result = convertMarkdownToXhtml('This is __bold__ text');
      expect(result).toBe('<p>This is <strong>bold</strong> text</p>');
    });

    it('handles strong and emphasis together', () => {
      const result = convertMarkdownToXhtml('**bold** and *italic*');
      expect(result).toBe('<p><strong>bold</strong> and <em>italic</em></p>');
    });
  });

  // -------------------------------------------------------------------------
  // Dialogue preservation (Task 1.6)
  // -------------------------------------------------------------------------
  describe('dialogue preservation', () => {
    it('preserves lines starting with " as distinct paragraphs', () => {
      const input = 'Narration line\n"Hello," she said.\n"Goodbye," he replied.';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe(
        '<p>Narration line</p>\n' +
        '<p>"Hello," she said.</p>\n' +
        '<p>"Goodbye," he replied.</p>'
      );
    });

    it('preserves lines starting with \u201C (left double quote) as distinct paragraphs', () => {
      const input = 'Narration\n\u201CTôi đi rồi,\u201D cô nói.';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe(
        '<p>Narration</p>\n<p>\u201CTôi đi rồi,\u201D cô nói.</p>'
      );
    });

    it('preserves lines starting with \u2014 (em dash) as distinct paragraphs', () => {
      const input = 'Narration\n\u2014 Anh đi đâu vậy?';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe(
        '<p>Narration</p>\n<p>\u2014 Anh đi đâu vậy?</p>'
      );
    });

    it('preserves lines starting with \u2013 (en dash) as distinct paragraphs', () => {
      const input = 'Narration\n\u2013 Tôi không biết.';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe(
        '<p>Narration</p>\n<p>\u2013 Tôi không biết.</p>'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Vietnamese content (Requirement 10.1, 10.3)
  // -------------------------------------------------------------------------
  describe('Vietnamese content', () => {
    it('preserves Vietnamese diacritical marks', () => {
      const input = 'Cô ấy nói: "Tôi yêu anh." Rồi cô ấy bỏ đi.';
      const result = convertMarkdownToXhtml(input);
      expect(result).toContain('Cô ấy nói');
      expect(result).toContain('Tôi yêu anh');
      expect(result).toContain('bỏ đi');
    });

    it('handles complex Vietnamese characters (ệ, ở, ữ)', () => {
      const input = 'Việt Nam có nhiều nơi đẹp để ở và những kỷ niệm khó quên.';
      const result = convertMarkdownToXhtml(input);
      expect(result).toContain('Việt Nam');
      expect(result).toContain('để ở');
      expect(result).toContain('kỷ niệm');
    });

    it('handles Vietnamese with emphasis markers', () => {
      const input = 'Cô ấy *rất đẹp* và **rất thông minh**';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe(
        '<p>Cô ấy <em>rất đẹp</em> và <strong>rất thông minh</strong></p>'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Mixed formatting
  // -------------------------------------------------------------------------
  describe('mixed formatting', () => {
    it('handles a full chapter with paragraphs, scene breaks, dialogue, and emphasis', () => {
      const input = [
        'Cô ấy đứng bên cửa sổ, nhìn ra ngoài.',
        'Trời đang mưa.',
        '',
        '***',
        '',
        '\u201CAnh đi đâu vậy?\u201D cô hỏi.',
        '\u201CTôi đi **mua cà phê**,\u201D anh trả lời.',
        '',
        'Cô ấy *mỉm cười* rồi quay đi.'
      ].join('\n');

      const result = convertMarkdownToXhtml(input);
      expect(result).toContain('<p>Cô ấy đứng bên cửa sổ, nhìn ra ngoài. Trời đang mưa.</p>');
      expect(result).toContain('<hr class="scene-break"/>');
      expect(result).toContain('\u201CAnh đi đâu vậy?\u201D cô hỏi.');
      expect(result).toContain('<strong>mua cà phê</strong>');
      expect(result).toContain('<em>mỉm cười</em>');
    });

    it('escapes XML special characters in content', () => {
      const input = 'Tom & Jerry said 2 < 3 and 5 > 4';
      const result = convertMarkdownToXhtml(input);
      expect(result).toBe('<p>Tom &amp; Jerry said 2 &lt; 3 and 5 &gt; 4</p>');
    });
  });
});
