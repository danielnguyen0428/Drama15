/// Phân trang nội dung chương cho chế độ đọc `paged` (Req 17.4, 17.13).
///
/// [Paginator.paginate] đo layout bằng [TextPainter] theo `Reading_Settings` và
/// kích thước vùng đọc, cắt theo ranh giới dòng để không vỡ chữ. Kết quả là một
/// danh sách [Page] **liền mạch và phủ toàn bộ** nội dung chương (Property 19):
/// trang đầu bắt đầu ở offset 0, trang cuối kết thúc ở `content.length`, và mọi
/// cặp trang liền kề khớp biên.
library;

import 'package:flutter/widgets.dart';

import '../models/reading.dart';

/// Một trang nội dung trong chế độ `paged`: khoảng ký tự `[startOffset, endOffset)`
/// trong nội dung chương.
class Page {
  const Page(this.startOffset, this.endOffset);

  final int startOffset;
  final int endOffset;

  @override
  bool operator ==(Object other) =>
      other is Page &&
      other.startOffset == startOffset &&
      other.endOffset == endOffset;

  @override
  int get hashCode => Object.hash(startOffset, endOffset);

  @override
  String toString() => 'Page($startOffset, $endOffset)';
}

/// Bộ phân trang nội dung chương.
class Paginator {
  const Paginator._();

  /// Họ phông CSS generic cho mỗi [ReaderFontFamily] (dùng khi đo layout).
  static String _fontFamily(ReaderFontFamily family) {
    switch (family) {
      case ReaderFontFamily.serif:
        return 'serif';
      case ReaderFontFamily.sansSerif:
        return 'sans-serif';
    }
  }

  /// Dựng [TextStyle] dùng để đo layout từ [settings].
  static TextStyle styleFor(ReadingSettings settings) {
    return TextStyle(
      fontSize: settings.fontSize,
      height: 1.5,
      fontFamily: _fontFamily(settings.fontFamily),
    );
  }

  /// Chia [content] thành các [Page] vừa khít [viewport] theo [settings].
  ///
  /// Bảo đảm: trang đầu bắt đầu ở 0, trang cuối kết thúc ở `content.length`,
  /// các trang liền kề khớp biên (không bỏ sót, không chồng lấn).
  static List<Page> paginate(
    String content,
    Size viewport,
    ReadingSettings settings,
  ) {
    if (content.isEmpty) {
      return const <Page>[Page(0, 0)];
    }

    final painter = TextPainter(
      text: TextSpan(text: content, style: styleFor(settings)),
      textDirection: TextDirection.ltr,
      maxLines: null,
    )..layout(maxWidth: viewport.width <= 0 ? double.infinity : viewport.width);

    final metrics = painter.computeLineMetrics();
    if (metrics.isEmpty) {
      return <Page>[Page(0, content.length)];
    }

    int lineStartOffset(int lineIndex) {
      if (lineIndex <= 0) {
        return 0;
      }
      if (lineIndex >= metrics.length) {
        return content.length;
      }
      final m = metrics[lineIndex];
      // Một điểm y nằm trong dòng [lineIndex].
      final dy = m.baseline - m.ascent + 0.5;
      final pos = painter.getPositionForOffset(Offset(0, dy));
      return pos.offset.clamp(0, content.length);
    }

    final pageHeight = viewport.height <= 0 ? double.infinity : viewport.height;
    final pages = <Page>[];
    var pageStartLine = 0;
    var accumHeight = 0.0;
    var i = 0;
    final n = metrics.length;

    while (i < n) {
      final h = metrics[i].height;
      if (accumHeight + h > pageHeight && i > pageStartLine) {
        pages.add(Page(lineStartOffset(pageStartLine), lineStartOffset(i)));
        pageStartLine = i;
        accumHeight = 0;
      } else {
        accumHeight += h;
        i++;
      }
    }
    pages.add(Page(lineStartOffset(pageStartLine), content.length));

    painter.dispose();
    return pages;
  }

  /// `inChapterProgress` (0..1) → chỉ số [Page].
  static int progressToPageIndex(double progress, int pageCount) =>
      pageCount <= 1
      ? 0
      : (progress * pageCount).floor().clamp(0, pageCount - 1);

  /// Chỉ số [Page] → `inChapterProgress` đại diện (**điểm giữa trang**).
  ///
  /// Dùng điểm giữa `(pageIndex + 0.5) / pageCount` thay vì đầu trang để ánh xạ
  /// khứ hồi `index → progress → index` ổn định trước sai số dấu phẩy động
  /// (Property 20).
  static double pageIndexToProgress(int pageIndex, int pageCount) =>
      pageCount <= 0 ? 0.0 : ((pageIndex + 0.5) / pageCount).clamp(0.0, 1.0);
}
