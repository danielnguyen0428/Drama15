// Kiểm thử đơn vị cho token giao diện `AppTheme` (Req 14.1, 14.4) và bảng màu
// Trình đọc `ReaderPalette` (Req 11.3).
//
// Lưu ý: việc dựng `ThemeData` đầy đủ qua `AppTheme.light()` sẽ kích hoạt
// `google_fonts` tải phông qua mạng/asset — điều không khả dụng trong môi
// trường test thuần (không có phông bundle). Vì vậy ở đây ta kiểm thử phần
// token độc lập với phông (màu, hằng số kích thước chạm, bảng màu Reader);
// phần `ThemeData` gắn phông được kiểm chứng trong môi trường ứng dụng thật ở
// smoke test (tác vụ 9.2).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:drama15_mobile/theme/app_theme.dart';

void main() {
  group('AppColors — ánh xạ token design system Claude (Req 14.1)', () {
    test('các token màu khớp tokens.css', () {
      expect(AppColors.parchment, const Color(0xFFF5F4ED));
      expect(AppColors.ivory, const Color(0xFFFAF9F5));
      expect(AppColors.warmSand, const Color(0xFFE8E6DC));
      expect(AppColors.ink, const Color(0xFF141413));
      expect(AppColors.muted, const Color(0xFF5E5D59));
      expect(AppColors.terracotta, const Color(0xFFC96442));
      expect(AppColors.borderCream, const Color(0xFFF0EEE6));
    });
  });

  group('AppTheme — hằng số kích thước chạm (Req 14.4)', () {
    test('kích thước chạm tối thiểu là ~48 logical px', () {
      expect(AppTheme.minTouchTarget, 48.0);
    });

    test('bán kính bo góc khớp token Claude (sm 8 / md 12 / lg 16)', () {
      expect(AppTheme.radiusSmall, 8.0);
      expect(AppTheme.radius, 12.0);
      expect(AppTheme.radiusLarge, 16.0);
    });
  });

  group('ReaderPalette — bảng màu Reader độc lập (Req 11.3)', () {
    test('đủ ba biến thể light/sepia/dark', () {
      expect(
        ReaderPalette.palettes.keys,
        containsAll(ReaderThemeVariant.values),
      );
      for (final variant in ReaderThemeVariant.values) {
        expect(ReaderPalette.of(variant).variant, variant);
      }
    });

    test('bảng màu light dùng token Claude (parchment/ink/terracotta)', () {
      expect(ReaderPalette.lightPalette.background, AppColors.parchment);
      expect(ReaderPalette.lightPalette.text, AppColors.ink);
      expect(ReaderPalette.lightPalette.accent, AppColors.terracotta);
    });

    test('tra cứu theo tên biến thể trả đúng bảng màu', () {
      expect(ReaderPalette.byName('light'), ReaderPalette.lightPalette);
      expect(ReaderPalette.byName('sepia'), ReaderPalette.sepiaPalette);
      expect(ReaderPalette.byName('dark'), ReaderPalette.darkPalette);
    });

    test('tên không hợp lệ trả về bảng màu light mặc định', () {
      expect(ReaderPalette.byName('khong-ton-tai'), ReaderPalette.lightPalette);
    });

    test('mỗi biến thể có nền khác nhau (light/sepia/dark phân biệt)', () {
      final backgrounds = ReaderThemeVariant.values
          .map((v) => ReaderPalette.of(v).background)
          .toSet();
      expect(backgrounds.length, ReaderThemeVariant.values.length);
    });
  });
}
