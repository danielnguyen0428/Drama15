import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Token giao diện "Drama 15" — áp dụng design system kiểu Claude (Anthropic):
/// nền giấy da (parchment), nhấn terracotta, neutral ấm (ngả nâu-vàng), tiêu đề
/// serif (weight 500), bo góc mềm, "ring shadow" thay drop shadow.
///
/// Nguồn token: `apps/mobile/tool/claude/{tokens.css, DESIGN.md}`.
/// Giữ nguyên API công khai ([AppFonts.serif], [ReaderPalette.byName]...) để
/// các màn hình hiện có không phải đổi.

/// Bảng màu ứng dụng — ánh xạ trực tiếp tokens.css của design system Claude.
class AppColors {
  AppColors._();

  // ─── Surface (3 mức): parchment → ivory → warm sand ───
  /// `--bg` Parchment — nền trang, không bao giờ là trắng tinh.
  static const Color parchment = Color(0xFFF5F4ED);

  /// `--surface` Ivory — bề mặt thẻ/panel nổi.
  static const Color ivory = Color(0xFFFAF9F5);

  /// `--surface-warm` Warm Sand — nền nút phụ, bề mặt tương tác nổi bật.
  static const Color warmSand = Color(0xFFE8E6DC);

  // ─── Foreground ramp (4 mức), mọi xám đều ngả nâu-vàng ───
  /// `--fg` Anthropic Near Black — màu chữ chính.
  static const Color ink = Color(0xFF141413);

  /// `--fg-2` Dark Warm — link/chữ phụ nhấn.
  static const Color inkSoft = Color(0xFF3D3D3A);

  /// `--muted` Olive Gray — chữ phụ.
  static const Color muted = Color(0xFF5E5D59);

  /// `--meta` Stone Gray — chữ cấp ba/metadata.
  static const Color meta = Color(0xFF87867F);

  // ─── Border (2 mức) ───
  /// `--border` Border Cream — viền nhạt mặc định.
  static const Color borderCream = Color(0xFFF0EEE6);

  /// `--border-soft` Border Warm — vách ngăn nhấn hơn.
  static const Color borderWarm = Color(0xFFE8E6DC);

  // ─── Accent ───
  /// `--accent` Terracotta Brand — màu nhấn duy nhất (CTA chính).
  static const Color terracotta = Color(0xFFC96442);

  /// Coral — biến thể sáng hơn của nhấn (link/nhấn phụ trên nền tối).
  static const Color coral = Color(0xFFD97757);

  /// Hover/active của terracotta (pha tối thủ công).
  static const Color terracottaHover = Color(0xFFBC5C3D);

  // ─── Dark surfaces ───
  /// `Dark Surface` — container nền tối.
  static const Color darkSurface = Color(0xFF30302E);

  /// `Warm Silver` — chữ trên nền tối.
  static const Color warmSilver = Color(0xFFB0AEA5);

  // ─── Semantic ───
  /// `--danger` Error Crimson — đỏ ấm, nghiêm túc.
  static const Color danger = Color(0xFFB53333);
  static const Color success = Color(0xFF17A34A);
  static const Color warn = Color(0xFFEAB308);
}

/// Phông chữ qua `google_fonts`. Tiêu đề serif (Fraunces ~ Anthropic Serif),
/// nội dung đọc serif sách (Lora), UI sans (Inter), code (JetBrains Mono).
class AppFonts {
  AppFonts._();

  /// Serif tiêu đề — weight mặc định 500 (single-weight như design Claude).
  static TextStyle serif({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
    double? letterSpacing,
  }) => GoogleFonts.fraunces(
    fontSize: fontSize,
    fontWeight: fontWeight ?? FontWeight.w500,
    color: color,
    height: height,
    letterSpacing: letterSpacing,
  );

  /// Serif đọc nội dung (Lora) — line-height thư giãn cho đọc dài.
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
    height: height ?? 1.6,
    letterSpacing: letterSpacing,
  );

  /// Sans UI (Inter).
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

  /// Mono cho nhãn nhỏ/code (JetBrains Mono).
  static TextStyle mono({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? height,
    double? letterSpacing,
  }) => GoogleFonts.jetBrainsMono(
    fontSize: fontSize,
    fontWeight: fontWeight ?? FontWeight.w500,
    color: color,
    height: height,
    letterSpacing: letterSpacing ?? 0.4,
  );

  static String get serifFamily => GoogleFonts.fraunces().fontFamily!;
  static String get readingFamily => GoogleFonts.lora().fontFamily!;
  static String get sansFamily => GoogleFonts.inter().fontFamily!;
  static String get monoFamily => GoogleFonts.jetBrainsMono().fontFamily!;
}

/// Dựng [ThemeData] và các hằng giao diện.
class AppTheme {
  AppTheme._();

  /// Vùng chạm tối thiểu (~48 logical px) — Req 14.4.
  static const double minTouchTarget = 48.0;

  /// Bo góc: chuẩn / nhấn / featured (tokens `--radius-*`).
  static const double radiusSmall = 8.0; // --radius-sm
  static const double radius = 12.0; // --radius-md (nút chính, input, nav)
  static const double radiusLarge = 16.0; // --radius-lg (thẻ featured)

  /// Theme sáng (design Claude chỉ dùng light là chính).
  static ThemeData light() {
    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.terracotta,
      onPrimary: AppColors.ivory,
      secondary: AppColors.coral,
      onSecondary: AppColors.ivory,
      surface: AppColors.ivory,
      onSurface: AppColors.ink,
      surfaceContainerHighest: AppColors.warmSand,
      surfaceContainerHigh: AppColors.warmSand,
      error: AppColors.danger,
      onError: AppColors.ivory,
      outline: AppColors.borderWarm,
      outlineVariant: AppColors.borderCream,
      secondaryContainer: AppColors.warmSand,
      onSecondaryContainer: AppColors.inkSoft,
    );

    // Body/UI dùng Inter; phủ serif Fraunces lên các bậc tiêu đề (weight 500).
    final baseTextTheme = GoogleFonts.interTextTheme(
      ThemeData.light().textTheme,
    ).apply(bodyColor: AppColors.ink, displayColor: AppColors.ink);

    final textTheme = baseTextTheme.copyWith(
      displayLarge: AppFonts.serif(
        fontSize: 34,
        color: AppColors.ink,
        height: 1.12,
      ),
      displayMedium: AppFonts.serif(
        fontSize: 28,
        color: AppColors.ink,
        height: 1.15,
      ),
      displaySmall: AppFonts.serif(
        fontSize: 24,
        color: AppColors.ink,
        height: 1.2,
      ),
      headlineMedium: AppFonts.serif(
        fontSize: 22,
        color: AppColors.ink,
        height: 1.2,
      ),
      headlineSmall: AppFonts.serif(
        fontSize: 20,
        color: AppColors.ink,
        height: 1.25,
      ),
      titleLarge: AppFonts.serif(
        fontSize: 18,
        color: AppColors.ink,
        height: 1.3,
      ),
      titleMedium: AppFonts.sans(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        height: 1.3,
      ),
      bodyLarge: AppFonts.sans(fontSize: 16, color: AppColors.ink, height: 1.6),
      bodyMedium: AppFonts.sans(
        fontSize: 15,
        color: AppColors.inkSoft,
        height: 1.6,
      ),
      bodySmall: AppFonts.sans(
        fontSize: 13,
        color: AppColors.muted,
        height: 1.5,
      ),
      labelLarge: AppFonts.sans(fontSize: 14, fontWeight: FontWeight.w600),
      labelSmall: AppFonts.sans(
        fontSize: 11,
        color: AppColors.meta,
        letterSpacing: 0.4,
      ),
    );

    final buttonShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.parchment,
      canvasColor: AppColors.parchment,
      textTheme: textTheme,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
      splashFactory: InkRipple.splashFactory,
      dividerTheme: const DividerThemeData(
        color: AppColors.borderCream,
        thickness: 1,
        space: 24,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.parchment,
        surfaceTintColor: Colors.transparent,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: AppFonts.serif(fontSize: 22, color: AppColors.ink),
      ),
      // Thẻ: nền ivory, "ring" viền cream mềm (depth kiểu Claude, không drop shadow).
      cardTheme: CardThemeData(
        color: AppColors.ivory,
        elevation: 0,
        margin: const EdgeInsets.only(bottom: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusLarge),
          side: const BorderSide(color: AppColors.borderCream),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.terracotta,
          foregroundColor: AppColors.ivory,
          disabledBackgroundColor: AppColors.warmSand,
          disabledForegroundColor: AppColors.meta,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
          shape: buttonShape,
          elevation: 0,
          textStyle: AppFonts.sans(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.terracotta,
          foregroundColor: AppColors.ivory,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
          elevation: 0,
          shape: buttonShape,
          textStyle: AppFonts.sans(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      // Nút phụ: nền warm sand, chữ charcoal (workhorse button của Claude).
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.inkSoft,
          backgroundColor: AppColors.warmSand,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
          side: const BorderSide(color: AppColors.borderWarm),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusSmall),
          ),
          textStyle: AppFonts.sans(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.terracotta,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
          shape: buttonShape,
          textStyle: AppFonts.sans(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: AppColors.inkSoft,
          minimumSize: const Size(minTouchTarget, minTouchTarget),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.warmSand,
        selectedColor: AppColors.terracotta,
        secondarySelectedColor: AppColors.terracotta,
        labelStyle: AppFonts.sans(fontSize: 13, color: AppColors.inkSoft),
        secondaryLabelStyle: AppFonts.sans(
          fontSize: 13,
          color: AppColors.ivory,
        ),
        side: const BorderSide(color: AppColors.borderWarm),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusSmall),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.terracotta,
        linearTrackColor: AppColors.warmSand,
        circularTrackColor: AppColors.warmSand,
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: AppColors.terracotta,
        inactiveTrackColor: AppColors.warmSand,
        thumbColor: AppColors.terracotta,
        overlayColor: AppColors.terracotta.withValues(alpha: 0.12),
        trackHeight: 4,
        overlayShape: const RoundSliderOverlayShape(
          overlayRadius: minTouchTarget / 2,
        ),
        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 9),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.ivory,
        hintStyle: AppFonts.sans(color: AppColors.meta),
        labelStyle: AppFonts.sans(color: AppColors.muted),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: const BorderSide(color: AppColors.borderWarm),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: const BorderSide(color: AppColors.borderWarm),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: const BorderSide(color: AppColors.terracotta, width: 2),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: AppColors.ivory,
        selectedItemColor: AppColors.terracotta,
        unselectedItemColor: AppColors.meta,
        selectedLabelStyle: AppFonts.sans(
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: AppFonts.sans(fontSize: 12),
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: AppColors.terracotta,
        unselectedLabelColor: AppColors.muted,
        labelStyle: AppFonts.sans(fontSize: 14, fontWeight: FontWeight.w600),
        unselectedLabelStyle: AppFonts.sans(fontSize: 14),
        indicatorColor: AppColors.terracotta,
        dividerColor: AppColors.borderCream,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.ivory,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusLarge),
        ),
        titleTextStyle: AppFonts.serif(fontSize: 20, color: AppColors.ink),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.ivory,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(radiusLarge),
          ),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: AppColors.ivory,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: const BorderSide(color: AppColors.borderCream),
        ),
      ),
    );
  }
}

/// Biến thể chủ đề của Trình đọc (Reader).
enum ReaderThemeVariant { light, sepia, dark }

/// Bảng màu riêng của Trình đọc — độc lập theme app (Req 11.3), tông Claude.
class ReaderPalette {
  const ReaderPalette({
    required this.variant,
    required this.background,
    required this.surface,
    required this.text,
    required this.secondaryText,
    required this.accent,
  });

  final ReaderThemeVariant variant;
  final Color background;
  final Color surface;
  final Color text;
  final Color secondaryText;
  final Color accent;

  /// Sáng — nền parchment, chữ near-black.
  static const ReaderPalette lightPalette = ReaderPalette(
    variant: ReaderThemeVariant.light,
    background: AppColors.parchment,
    surface: AppColors.ivory,
    text: AppColors.ink,
    secondaryText: AppColors.muted,
    accent: AppColors.terracotta,
  );

  /// Giấy ngà (sepia) — tông ấm hơn, dịu mắt.
  static const ReaderPalette sepiaPalette = ReaderPalette(
    variant: ReaderThemeVariant.sepia,
    background: Color(0xFFF4ECD8),
    surface: Color(0xFFEFE5CC),
    text: Color(0xFF433A2E),
    secondaryText: Color(0xFF8A7355),
    accent: AppColors.terracottaHover,
  );

  /// Tối — nền near-black ấm, chữ warm silver/ivory.
  static const ReaderPalette darkPalette = ReaderPalette(
    variant: ReaderThemeVariant.dark,
    background: AppColors.ink,
    surface: AppColors.darkSurface,
    text: Color(0xFFECEAE2),
    secondaryText: AppColors.warmSilver,
    accent: AppColors.coral,
  );

  static const Map<ReaderThemeVariant, ReaderPalette> palettes = {
    ReaderThemeVariant.light: lightPalette,
    ReaderThemeVariant.sepia: sepiaPalette,
    ReaderThemeVariant.dark: darkPalette,
  };

  static ReaderPalette of(ReaderThemeVariant variant) => palettes[variant]!;

  /// Tra bảng màu theo tên biến thể (`light`/`sepia`/`dark`).
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
