// Property-based test: phân trang liền mạch và phủ toàn bộ chương (Req 17.4).
//
// Feature: flutter-drama-mobile-app, Property 19: Phân trang liền mạch và phủ toàn bộ chương

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart' show TestWidgetsFlutterBinding;
import 'package:glados/glados.dart';

import 'package:drama15_mobile/logic/paginator.dart';
import 'package:drama15_mobile/models/reading.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Nội dung có cơ hội ngắt dòng (chữ, khoảng trắng, xuống dòng).
  final contentGen = any.stringOf('abcdef ghij\n');
  final sizeGen = any.combine2<int, int, Size>(
    any.intInRange(40, 400),
    any.intInRange(40, 400),
    (w, h) => Size(w.toDouble(), h.toDouble()),
  );
  final fontGen = any.choose<double>(kReaderFontSizeSteps);

  Glados3<String, Size, double>(
    contentGen,
    sizeGen,
    fontGen,
    ExploreConfig(numRuns: 100),
  ).test('các Page liền mạch, phủ toàn bộ nội dung chương', (
    content,
    viewport,
    fontSize,
  ) {
    final settings = ReadingSettings(
      fontSize: fontSize,
      theme: ReaderTheme.light,
      brightness: 1,
      fontFamily: ReaderFontFamily.serif,
    );
    final pages = Paginator.paginate(content, viewport, settings);

    expect(pages, isNotEmpty);
    // Trang đầu bắt đầu ở 0.
    expect(pages.first.startOffset, 0);
    // Trang cuối kết thúc ở content.length.
    expect(pages.last.endOffset, content.length);
    // Liền mạch: end của trang i == start của trang i+1.
    for (var i = 1; i < pages.length; i++) {
      expect(pages[i].startOffset, pages[i - 1].endOffset);
    }
    // Mỗi trang không lùi (end ≥ start).
    for (final p in pages) {
      expect(p.endOffset >= p.startOffset, isTrue);
    }
  });
}
