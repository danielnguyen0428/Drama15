/// Mô hình thiết lập đọc (`Reading_Settings`) và vị trí đọc (`Reading_Position`)
/// cho Trình đọc kiểu Apple Books (Req 11, 12).
///
/// Điểm cốt lõi của tệp này là **tính khứ hồi ổn định** (round-trip): với mọi
/// giá trị đã chuẩn hóa, `fromJson(toJson(x)) == x`; và quan trọng hơn,
/// `fromJson` **chuẩn hóa** mọi dữ liệu đầu vào (kể cả dữ liệu cũ/hỏng) về miền
/// hợp lệ — kẹp `fontSize` về bước rời rạc gần nhất và kẹp `brightness`/
/// `inChapterProgress` về `[0, 1]`. Đây là nền tảng cho hai thuộc tính khứ hồi
/// P11 (Req 12.5) và P12 (Req 12.6) được kiểm chứng ở các tác vụ 4.9, 4.10.
///
/// Lưu ý về tên: enum [ReaderTheme] ở đây là **định nghĩa chuẩn** của chủ đề
/// đọc trong tầng mô hình. Tầng theme (`lib/theme/app_theme.dart`) cố ý dùng một
/// cấu trúc bảng màu riêng (`ReaderThemeVariant`/`ReaderPalette`) tra theo tên
/// biến thể (`ReaderTheme.name` → `'light'`/`'sepia'`/`'dark'`) để tránh trùng
/// tên và không tạo phụ thuộc trực tiếp giữa hai tầng.
library;

import 'dart:math' as math;

/// Chủ đề đọc của Trình đọc (Req 11.3).
///
/// Ba biến thể: sáng ([light]), giấy ngà ([sepia]) và tối ([dark]). Tên enum
/// (`light`/`sepia`/`dark`) cũng là khóa tra bảng màu `ReaderPalette.byName`.
enum ReaderTheme { light, sepia, dark }

/// Họ phông chữ đọc (Req 11.5): có chân ([serif]) và không chân ([sansSerif]).
enum ReaderFontFamily { serif, sansSerif }

/// Chế độ đọc (`Reading_Mode` — Req 17.1).
///
/// [scroll]: cuộn dọc liên tục; [paged]: lật trang ngang kiểu Apple Books.
/// Mặc định là [paged] (Req 17.1).
enum ReadingMode { scroll, paged }

/// Các bước cỡ chữ **rời rạc** hợp lệ cho Trình đọc (Req 11.2).
///
/// Ít nhất 5 bước, trải từ cỡ nhỏ nhất 12 đến cỡ lớn nhất 28 (logical pixel).
const List<double> kReaderFontSizeSteps = <double>[12, 16, 18, 22, 28];

/// Thiết lập đọc toàn cục của người dùng (`Reading_Settings` — Req 11, 12).
///
/// Bao gồm cỡ chữ (theo bước rời rạc), chủ đề, độ sáng và họ phông. Các giá trị
/// luôn nằm trong miền hợp lệ khi được tạo qua [ReadingSettings.fromJson] hoặc
/// [ReadingSettings.defaults]; constructor mặc định dành cho các giá trị đã
/// biết là hợp lệ (ví dụ kết quả [snapFontSize] hoặc giá trị mặc định).
class ReadingSettings {
  const ReadingSettings({
    required this.fontSize,
    required this.theme,
    required this.brightness,
    required this.fontFamily,
    this.mode = ReadingMode.paged,
  });

  /// Cỡ chữ đọc (logical px) — phải thuộc [kReaderFontSizeSteps], mặc định 18.
  final double fontSize;

  /// Chủ đề đọc — mặc định [ReaderTheme.light].
  final ReaderTheme theme;

  /// Độ sáng nội dung đọc trong `[0, 1]` — mặc định 1.0.
  final double brightness;

  /// Họ phông chữ đọc — mặc định [ReaderFontFamily.serif].
  final ReaderFontFamily fontFamily;

  /// Chế độ đọc (`Reading_Mode`) — mặc định [ReadingMode.paged] (Req 17.1).
  final ReadingMode mode;

  /// Thiết lập mặc định khi chưa có dữ liệu đã lưu (Req 11.2–11.5, 12.2, 17.1).
  static const ReadingSettings defaults = ReadingSettings(
    fontSize: 18,
    theme: ReaderTheme.light,
    brightness: 1.0,
    fontFamily: ReaderFontFamily.serif,
    mode: ReadingMode.paged,
  );

  /// Kẹp/khớp một cỡ chữ tùy ý về **bước rời rạc hợp lệ gần nhất**.
  ///
  /// Giá trị ngoài khoảng `[12, 28]` được kẹp về đầu/cuối khoảng (12 hoặc 28)
  /// một cách tự nhiên vì hai bước biên là phần tử nhỏ nhất/lớn nhất. Khi có
  /// hai bước cách đều, ưu tiên bước nhỏ hơn để kết quả tất định.
  static double snapFontSize(double value) {
    var best = kReaderFontSizeSteps.first;
    var bestDiff = (value - best).abs();
    for (final step in kReaderFontSizeSteps) {
      final diff = (value - step).abs();
      if (diff < bestDiff) {
        best = step;
        bestDiff = diff;
      }
    }
    return best;
  }

  /// Bản sao với một số trường được thay đổi (giữ nguyên phần còn lại).
  ReadingSettings copyWith({
    double? fontSize,
    ReaderTheme? theme,
    double? brightness,
    ReaderFontFamily? fontFamily,
    ReadingMode? mode,
  }) {
    return ReadingSettings(
      fontSize: fontSize ?? this.fontSize,
      theme: theme ?? this.theme,
      brightness: brightness ?? this.brightness,
      fontFamily: fontFamily ?? this.fontFamily,
      mode: mode ?? this.mode,
    );
  }

  /// Tuần tự hóa sang JSON (chủ đề/phông lưu theo tên enum để khứ hồi ổn định).
  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'fontSize': fontSize,
      'theme': theme.name,
      'brightness': brightness,
      'fontFamily': fontFamily.name,
      'mode': mode.name,
    };
  }

  /// Dựng từ JSON **kèm chuẩn hóa** để an toàn trước dữ liệu cũ/hỏng.
  ///
  /// - `fontSize` được khớp về bước rời rạc hợp lệ gần nhất ([snapFontSize]).
  /// - `brightness` được kẹp về `[0, 1]`.
  /// - `theme`/`fontFamily`/`mode` được tra theo tên; tên lạ hoặc thiếu → giá
  ///   trị mặc định tương ứng.
  factory ReadingSettings.fromJson(Map<String, dynamic> json) {
    final rawFontSize =
        (json['fontSize'] as num?)?.toDouble() ?? defaults.fontSize;
    final rawBrightness =
        (json['brightness'] as num?)?.toDouble() ?? defaults.brightness;
    return ReadingSettings(
      fontSize: snapFontSize(rawFontSize),
      theme: _readerThemeFromName(json['theme']),
      brightness: rawBrightness.clamp(0.0, 1.0).toDouble(),
      fontFamily: _fontFamilyFromName(json['fontFamily']),
      mode: _readingModeFromName(json['mode']),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ReadingSettings &&
        other.fontSize == fontSize &&
        other.theme == theme &&
        other.brightness == brightness &&
        other.fontFamily == fontFamily &&
        other.mode == mode;
  }

  @override
  int get hashCode =>
      Object.hash(fontSize, theme, brightness, fontFamily, mode);

  @override
  String toString() {
    return 'ReadingSettings(fontSize: $fontSize, theme: $theme, '
        'brightness: $brightness, fontFamily: $fontFamily, mode: $mode)';
  }
}

/// Vị trí đọc theo từng truyện (`Reading_Position` — Req 12.3, 12.4, 12.7).
///
/// Lưu chương hiện tại và tiến độ cuộn trong chương; được khôi phục khi mở lại
/// truyện (Req 11.9, 12.4). Khi chưa có vị trí đã lưu, Trình đọc mở ở chương đầu
/// (Req 12.7) — tương ứng `ReadingPosition(chapterIndex: 0, inChapterProgress: 0)`.
class ReadingPosition {
  const ReadingPosition({
    required this.chapterIndex,
    required this.inChapterProgress,
  });

  /// Chỉ số chương hiện tại (không âm).
  final int chapterIndex;

  /// Tiến độ cuộn trong chương, trong `[0, 1]`.
  final double inChapterProgress;

  /// Vị trí khởi đầu (chương đầu, đầu chương) khi chưa có dữ liệu (Req 12.7).
  static const ReadingPosition start = ReadingPosition(
    chapterIndex: 0,
    inChapterProgress: 0,
  );

  /// Bản sao với một số trường được thay đổi (giữ nguyên phần còn lại).
  ReadingPosition copyWith({int? chapterIndex, double? inChapterProgress}) {
    return ReadingPosition(
      chapterIndex: chapterIndex ?? this.chapterIndex,
      inChapterProgress: inChapterProgress ?? this.inChapterProgress,
    );
  }

  /// Tuần tự hóa sang JSON.
  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'chapterIndex': chapterIndex,
      'inChapterProgress': inChapterProgress,
    };
  }

  /// Dựng từ JSON **kèm chuẩn hóa** để an toàn trước dữ liệu cũ/hỏng.
  ///
  /// - `chapterIndex` được kẹp về không âm (giá trị âm/thiếu → 0).
  /// - `inChapterProgress` được kẹp về `[0, 1]`.
  factory ReadingPosition.fromJson(Map<String, dynamic> json) {
    final rawIndex = (json['chapterIndex'] as num?)?.toInt() ?? 0;
    final rawProgress = (json['inChapterProgress'] as num?)?.toDouble() ?? 0.0;
    return ReadingPosition(
      chapterIndex: math.max(0, rawIndex),
      inChapterProgress: rawProgress.clamp(0.0, 1.0).toDouble(),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ReadingPosition &&
        other.chapterIndex == chapterIndex &&
        other.inChapterProgress == inChapterProgress;
  }

  @override
  int get hashCode => Object.hash(chapterIndex, inChapterProgress);

  @override
  String toString() {
    return 'ReadingPosition(chapterIndex: $chapterIndex, '
        'inChapterProgress: $inChapterProgress)';
  }
}

/// Tra [ReaderTheme] theo tên (lấy từ `ReaderTheme.name`); tên lạ/thiếu →
/// [ReaderTheme.light].
ReaderTheme _readerThemeFromName(Object? raw) {
  if (raw is String) {
    for (final value in ReaderTheme.values) {
      if (value.name == raw) {
        return value;
      }
    }
  }
  return ReadingSettings.defaults.theme;
}

/// Tra [ReaderFontFamily] theo tên; tên lạ/thiếu → [ReaderFontFamily.serif].
ReaderFontFamily _fontFamilyFromName(Object? raw) {
  if (raw is String) {
    for (final value in ReaderFontFamily.values) {
      if (value.name == raw) {
        return value;
      }
    }
  }
  return ReadingSettings.defaults.fontFamily;
}

/// Tra [ReadingMode] theo tên; tên lạ/thiếu → [ReadingMode.paged] (Req 17.1).
ReadingMode _readingModeFromName(Object? raw) {
  if (raw is String) {
    for (final value in ReadingMode.values) {
      if (value.name == raw) {
        return value;
      }
    }
  }
  return ReadingSettings.defaults.mode;
}
