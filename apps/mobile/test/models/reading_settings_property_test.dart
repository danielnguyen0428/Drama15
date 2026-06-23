// Property-based test khứ hồi lưu/nạp `ReadingSettings` (Req 12.5, 17.3).
//
// Feature: flutter-drama-mobile-app, Property 14: Reading_Settings khứ hồi lưu/nạp

import 'package:glados/glados.dart';

import 'package:drama15_mobile/models/reading.dart';

void main() {
  final settingsGen = any
      .combine5<
        double,
        ReaderTheme,
        double,
        ReaderFontFamily,
        ReadingMode,
        ReadingSettings
      >(
        any.choose<double>(kReaderFontSizeSteps),
        any.choose<ReaderTheme>(ReaderTheme.values),
        any.doubleInRange(0, 1),
        any.choose<ReaderFontFamily>(ReaderFontFamily.values),
        any.choose<ReadingMode>(ReadingMode.values),
        (fontSize, theme, brightness, fontFamily, mode) => ReadingSettings(
          fontSize: fontSize,
          theme: theme,
          brightness: brightness,
          fontFamily: fontFamily,
          mode: mode,
        ),
      );

  Glados<ReadingSettings>(settingsGen, ExploreConfig(numRuns: 100)).test(
    'ReadingSettings.fromJson(toJson()) tương đương bản gốc',
    (settings) {
      expect(ReadingSettings.fromJson(settings.toJson()), settings);
    },
  );
}
