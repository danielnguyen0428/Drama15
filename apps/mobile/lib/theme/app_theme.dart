import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Token giao diện của ứng dụng "Drama 15".
///
/// Tệp này ánh xạ các token CSS của bản web (`apps/web/src/story/StoryWorkspace.css`)
/// sang Flutter để giữ phong cách thị giác quen thuộc (nền giấy ngà, màu nhấn
/// coral, phông serif cho tiêu đề/nội dung đọc). Xem `design.md` mục "Theme
/// (giao diện — Req 14)".
///
/// Thành phần:
/// - [AppColors]: bảng màu ánh xạ 1-1 token web.
/// - [AppFonts]: phông qua `google_fonts` (serif/đọc/sans/mono).
/// - [AppTheme]: dựng [ThemeData] sáng cho ứng dụng, đặt kích thước chạm tối
///   thiểu ~48 logical px (Req 14.4).
/// - [ReaderPalette]: bảng màu riêng cho Trình đọc (light/sepia/dark), độc lập
///   với theme app (Req 11.3). Lưu ý: tệp này **không** khai báo enum
///   `ReaderTheme` (enum đó thuộc `lib/models/reading.dart`); thay vào đó dùng
///   cấu trúc bảng màu tra theo tên biến thể để tránh trùng tên.

/// Bảng màu ứng dụng — ánh xạ trực tiếp các biến CSS `--*` của bản web.
class AppColors {
  AppColors._();

  // --- Nền giấy ngà ---
  /// `--page-bg: #f1e9d8` — nền tổng thể.
  static const Color pageBg = Color(0xFFF1E9D8);

  /// `--paper: #fbf7ee` — bề mặt thẻ/panel.
  static const Color paper = Color(0xFFFBF7EE);

  /// `--paper-strong: #ffffff` — bề mặt nổi bật.
  static const Color paperStrong = Color(0xFFFFFFFF);

  /// `--paper-soft: #f6efdf` — bề mặt dịu.
  static const Color paperSoft = Color(0xFFF6EFDF);

  /// `--canvas: #fdfaf3` — vùng nội dung chính.
  static const Color canvas = Color(0xFFFDFAF3);

  // --- Mực/chữ ---
  /// `--ink: #1a1611` — màu chữ chính.
  static const Color ink = Color(0xFF1A1611);

  /// `--ink-soft: #2c261d` — màu chữ phụ đậm.
  static const Color inkSoft = Color(0xFF2C261D);

  /// `--muted: #6b6253` — chữ phụ/nhãn.
  static const Color muted = Color(0xFF6B6253);

  /// `--soft-muted: #897f6d` — chữ phụ nhạt hơn.
  static const Color softMuted = Color(0xFF897F6D);

  // --- Đường kẻ ---
  /// `--line: rgba(26, 22, 17, 0.14)`.
  static const Color line = Color(0x24181611);

  /// `--line-strong: rgba(26, 22, 17, 0.24)`.
  static const Color lineStrong = Color(0x3D181611);

  /// `--line-faint: rgba(26, 22, 17, 0.08)`.
  static const Color lineFaint = Color(0x14181611);

  // --- Màu nhấn coral ---
  /// `--coral: #d7634e` — màu nhấn chính.
  static const Color coral = Color(0xFFD7634E);

  /// `--coral-dark: #b9452f` — màu nhấn đậm (nhấn/hover).
  static const Color coralDark = Color(0xFFB9452F);

  /// `--coral-soft: rgba(215, 99, 78, 0.12)` — nền nhấn dịu.
  static const Color coralSoft = Color(0x1FD7634E);

  /// `--accent-ink: #1f1a13`.
  static const Color accentInk = Color(0xFF1F1A13);
}

/// Phông chữ qua `google_fonts`, ánh xạ token `--serif`/`--read`/`--mono` web.
///
/// - serif **Fraunces** cho tiêu đề (display/headline).
/// - **Lora** cho nội dung đọc (token `--read` của web).
/// - sans **Inter** cho UI.
/// - mono **JetBrains Mono** cho nhãn nhỏ (eyebrow/kicker).
class AppFonts {
  AppFonts._();

  /// Phông serif cho tiêu đề lớn (Fraunces).
  static TextStyle serif({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
    double? letterSpacing,
  }) => GoogleFonts.fraunces(
    fontSize: fontSize,
    fontWeight: fontWeight,
    color: color,
    height: height,
    letterSpacing: letterSpacing,
  );

  /// Phông serif cho nội dung đọc (Lora — token `--read`).
  static TextStyle reading({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
    double? letterSpacing,
  }) => GoogleFonts.lora(
    fontSize: fontSize,
    fontWeight: fontWeight,
    color: color,
    height: height,
    letterSpacing: letterSpacing,
  );

  /// Phông sans cho UI (Inter).
  static TextStyle sans({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
    double? letterSpacing,
  }) => GoogleFonts.inter(
    fontSize: fontSize,
    fontWeight: fontWeight,
    color: color,
    height: height,
    letterSpacing: letterSpacing,
  );

  /// Phông mono cho nhãn nhỏ (JetBrains Mono).
  static TextStyle mono({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
    double? letterSpacing,
  }) => GoogleFonts.jetBrainsMono(
    fontSize: fontSize,
    fontWeight: fontWeight ?? FontWeight.w600,
    color: color,
    height: height,
    letterSpacing: letterSpacing ?? 0.6,
  );

  /// Tên họ phông Fraunces (dùng cho `TextStyle.fontFamily` nếu cần).
  static String get serifFamily => GoogleFonts.fraunces().fontFamily!;

  /// Tên họ phông Lora (nội dung đọc).
  static String get readingFamily => GoogleFonts.lora().fontFamily!;

  /// Tên họ phông Inter (UI).
  static String get sansFamily => GoogleFonts.inter().fontFamily!;

  /// Tên họ phông JetBrains Mono (nhãn nhỏ).
  static String get monoFamily => GoogleFonts.jetBrainsMono().fontFamily!;
}

/// Dựng [ThemeData] cho ứng dụng và các hằng số giao diện liên quan.
class AppTheme {
  AppTheme._();

  /// Kích thước chạm tối thiểu (~48 logical px) cho nút/thanh trượt/thẻ (Req 14.4).
  static const double minTouchTarget = 48.0;

  /// Bán kính bo góc chuẩn (token `--radius: 16px`).
  static const double radius = 16.0;

  /// Bán kính bo góc nhỏ (token `--radius-sm: 12px`).
  static const double radiusSmall = 12.0;

  /// Theme sáng của ứng dụng (bản web chỉ dùng `color-scheme: light`).
  static ThemeData light() {
    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.coral,
      onPrimary: AppColors.paperStrong,
      secondary: AppColors.coralDark,
      onSecondary: AppColors.paperStrong,
      surface: AppColors.paper,
      onSurface: AppColors.ink,
      surfaceContainerHighest: AppColors.paperSoft,
      error: AppColors.coralDark,
      onError: AppColors.paperStrong,
      outline: AppColors.lineStrong,
      outlineVariant: AppColors.line,
    );

    // Cơ sở văn bản dùng Inter (sans cho UI), sau đó phủ phông serif lên các
    // bậc tiêu đề (display/headline/title) để khớp phong cách bản web.
    final baseTextTheme = GoogleFonts.interTextTheme(
      ThemeData.light().textTheme,
    ).apply(bodyColor: AppColors.ink, displayColor: AppColors.ink);

    final textTheme = baseTextTheme.copyWith(
      displayLarge: AppFonts.serif(
        fontSize: 40,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        height: 1.1,
      ),
      displayMedium: AppFonts.serif(
        fontSize: 32,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        height: 1.15,
      ),
      displaySmall: AppFonts.serif(
        fontSize: 28,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        height: 1.2,
      ),
      headlineMedium: AppFonts.serif(
        fontSize: 24,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        height: 1.2,
      ),
      headlineSmall: AppFonts.serif(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        height: 1.25,
      ),
      titleLarge: AppFonts.serif(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        height: 1.3,
      ),
      // Nhãn nhỏ (eyebrow/kicker) dùng JetBrains Mono.
      labelSmall: AppFonts.mono(fontSize: 11, color: AppColors.muted),
    );

    final buttonShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radiusSmall),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.pageBg,
      canvasColor: AppColors.canvas,
      textTheme: textTheme,
      // Đảm bảo vùng chạm tối thiểu ~48px cho các widget Material (Req 14.4).
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
      dividerTheme: const DividerThemeData(color: AppColors.line, thickness: 1),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.pageBg,
        foregroundColor: AppColors.ink,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: AppFonts.serif(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: AppColors.ink,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.paper,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: const BorderSide(color: AppColors.line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.coral,
          foregroundColor: AppColors.paperStrong,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
          shape: buttonShape,
          textStyle: AppFonts.sans(fontWeight: FontWeight.w600),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.coral,
          foregroundColor: AppColors.paperStrong,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
          elevation: 0,
          shape: buttonShape,
          textStyle: AppFonts.sans(fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.ink,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
          side: const BorderSide(color: AppColors.lineStrong),
          shape: buttonShape,
          textStyle: AppFonts.sans(fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.coralDark,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
          shape: buttonShape,
          textStyle: AppFonts.sans(fontWeight: FontWeight.w600),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: AppColors.ink,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
        ),
      ),
      // Thanh trượt: overlay bán kính 24 ⇒ vùng chạm ~48px (Req 14.4).
      sliderTheme: const SliderThemeData(
        activeTrackColor: AppColors.coral,
        inactiveTrackColor: AppColors.line,
        thumbColor: AppColors.coral,
        overlayColor: AppColors.coralSoft,
        overlayShape: RoundSliderOverlayShape(
          overlayRadius: minTouchTarget / 2,
        ),
        thumbShape: RoundSliderThumbShape(enabledThumbRadius: 10),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.paper,
        hintStyle: AppFonts.sans(color: AppColors.softMuted),
        labelStyle: AppFonts.sans(color: AppColors.muted),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSmall),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSmall),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSmall),
          borderSide: const BorderSide(color: AppColors.coral, width: 2),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: AppColors.paper,
        selectedItemColor: AppColors.coral,
        unselectedItemColor: AppColors.muted,
        selectedLabelStyle: AppFonts.sans(fontWeight: FontWeight.w600),
        unselectedLabelStyle: AppFonts.sans(),
        type: BottomNavigationBarType.fixed,
      ),
    );
  }
}

/// Biến thể chủ đề của Trình đọc (Reader).
///
/// Đây là enum **cục bộ** của tầng theme, dùng để tra bảng màu [ReaderPalette].
/// Nó **không** thay thế enum `ReaderTheme` ở `lib/models/reading.dart` (mô hình
/// dữ liệu/cài đặt người dùng). Khi cần lấy bảng màu từ `ReaderTheme` của model,
/// hãy dùng [ReaderPalette.byName] với tên biến thể (`light`/`sepia`/`dark`).
enum ReaderThemeVariant { light, sepia, dark }

/// Bảng màu riêng của Trình đọc — độc lập với theme app (Req 11.3).
///
/// Mỗi biến thể (light/sepia/dark) định nghĩa nền, bề mặt, màu chữ chính/phụ và
/// màu nhấn. Lớp phủ độ sáng (Req 11.4) được Trình đọc áp riêng, không thuộc
/// bảng màu này.
class ReaderPalette {
  const ReaderPalette({
    required this.variant,
    required this.background,
    required this.surface,
    required this.text,
    required this.secondaryText,
    required this.accent,
  });

  /// Biến thể chủ đề của bảng màu.
  final ReaderThemeVariant variant;

  /// Màu nền vùng đọc.
  final Color background;

  /// Màu bề mặt phụ (thanh công cụ, mục lục...).
  final Color surface;

  /// Màu chữ nội dung đọc.
  final Color text;

  /// Màu chữ phụ (chú thích, tiến độ, nhãn...).
  final Color secondaryText;

  /// Màu nhấn (liên kết/điều khiển đang chọn).
  final Color accent;

  /// Chủ đề sáng — gần với nền giấy ngà của bản web.
  static const ReaderPalette lightPalette = ReaderPalette(
    variant: ReaderThemeVariant.light,
    background: AppColors.canvas, // #fdfaf3
    surface: AppColors.paper, // #fbf7ee
    text: AppColors.ink, // #1a1611
    secondaryText: AppColors.muted, // #6b6253
    accent: AppColors.coral, // #d7634e
  );

  /// Chủ đề giấy ngà (sepia) — tông ấm, dịu mắt.
  static const ReaderPalette sepiaPalette = ReaderPalette(
    variant: ReaderThemeVariant.sepia,
    background: Color(0xFFF4ECD8),
    surface: Color(0xFFEFE5CC),
    text: Color(0xFF5B4636),
    secondaryText: Color(0xFF8A7355),
    accent: AppColors.coralDark, // #b9452f
  );

  /// Chủ đề tối — nền mực, chữ sáng.
  static const ReaderPalette darkPalette = ReaderPalette(
    variant: ReaderThemeVariant.dark,
    background: Color(0xFF16130E),
    surface: Color(0xFF1F1A13), // gần --accent-ink
    text: Color(0xFFE9E3D6),
    secondaryText: Color(0xFF9A9082),
    accent: AppColors.coral, // #d7634e
  );

  /// Tra bảng màu theo biến thể.
  static const Map<ReaderThemeVariant, ReaderPalette> palettes = {
    ReaderThemeVariant.light: lightPalette,
    ReaderThemeVariant.sepia: sepiaPalette,
    ReaderThemeVariant.dark: darkPalette,
  };

  /// Lấy bảng màu theo [ReaderThemeVariant].
  static ReaderPalette of(ReaderThemeVariant variant) => palettes[variant]!;

  /// Lấy bảng màu theo tên biến thể (`light`/`sepia`/`dark`).
  ///
  /// Hữu ích để ánh xạ từ enum `ReaderTheme` của `lib/models/reading.dart`
  /// (qua `theme.name`) sang bảng màu mà không tạo phụ thuộc trực tiếp giữa
  /// tầng theme và tầng model. Tên không khớp sẽ trả về [lightPalette].
  static ReaderPalette byName(String name) {
    switch (name) {
      case 'sepia':
        return sepiaPalette;
      case 'dark':
        return darkPalette;
      case 'light':
      default:
        return lightPalette;
    }
  }
}
