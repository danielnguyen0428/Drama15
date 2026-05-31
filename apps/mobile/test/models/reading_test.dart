// Kiểm thử đơn vị cho mô hình thiết lập/vị trí đọc (`reading.dart` — Req 11, 12).
//
// Trọng tâm: tính khứ hồi ổn định của toJson/fromJson và **chuẩn hóa** của
// fromJson trước dữ liệu cũ/hỏng (kẹp fontSize về bước hợp lệ gần nhất, kẹp
// brightness/inChapterProgress về [0,1]). Các thuộc tính khứ hồi đầy đủ (P11,
// P12) được kiểm bằng property test ở tác vụ 4.9, 4.10.

import 'package:flutter_test/flutter_test.dart';

import 'package:drama15_mobile/models/reading.dart';

void main() {
  group('ReadingSettings.defaults (Req 11.2–11.5)', () {
    test('giá trị mặc định khớp thiết kế', () {
      expect(ReadingSettings.defaults.fontSize, 18);
      expect(ReadingSettings.defaults.theme, ReaderTheme.light);
      expect(ReadingSettings.defaults.brightness, 1.0);
      expect(ReadingSettings.defaults.fontFamily, ReaderFontFamily.serif);
    });

    test('các bước cỡ chữ có ≥5 bước, trải 12..28', () {
      expect(kReaderFontSizeSteps.length, greaterThanOrEqualTo(5));
      expect(kReaderFontSizeSteps.first, 12);
      expect(kReaderFontSizeSteps.last, 28);
      expect(kReaderFontSizeSteps, containsAll(<double>[12, 16, 18, 22, 28]));
    });
  });

  group('ReadingSettings.snapFontSize — khớp bước rời rạc gần nhất', () {
    test('giá trị hợp lệ giữ nguyên', () {
      for (final step in kReaderFontSizeSteps) {
        expect(ReadingSettings.snapFontSize(step), step);
      }
    });

    test('giá trị nằm giữa khớp về bước gần nhất', () {
      expect(ReadingSettings.snapFontSize(13), 12); // gần 12 hơn 16
      expect(ReadingSettings.snapFontSize(17), 16); // gần 16 hơn 18
      expect(
        ReadingSettings.snapFontSize(20),
        18,
      ); // |20-18|=2 < |20-22|... =2 ⇒ ưu tiên nhỏ hơn
      expect(
        ReadingSettings.snapFontSize(25),
        22,
      ); // |25-22|=3 < |25-28|=3 ⇒ ưu tiên nhỏ hơn
      expect(ReadingSettings.snapFontSize(26), 28); // gần 28 hơn 22
    });

    test('giá trị ngoài khoảng bị kẹp về biên gần nhất', () {
      expect(ReadingSettings.snapFontSize(-100), 12);
      expect(ReadingSettings.snapFontSize(0), 12);
      expect(ReadingSettings.snapFontSize(1000), 28);
    });
  });

  group('ReadingSettings round-trip toJson/fromJson (Req 12.5)', () {
    test('khứ hồi cho mọi tổ hợp giá trị đã chuẩn hóa', () {
      for (final fontSize in kReaderFontSizeSteps) {
        for (final theme in ReaderTheme.values) {
          for (final family in ReaderFontFamily.values) {
            for (final brightness in <double>[0.0, 0.5, 1.0]) {
              final settings = ReadingSettings(
                fontSize: fontSize,
                theme: theme,
                brightness: brightness,
                fontFamily: family,
              );
              expect(ReadingSettings.fromJson(settings.toJson()), settings);
            }
          }
        }
      }
    });

    test('toJson lưu chủ đề/phông theo tên enum', () {
      final json = const ReadingSettings(
        fontSize: 22,
        theme: ReaderTheme.dark,
        brightness: 0.4,
        fontFamily: ReaderFontFamily.sansSerif,
      ).toJson();
      expect(json['theme'], 'dark');
      expect(json['fontFamily'], 'sansSerif');
    });
  });

  group('ReadingSettings.fromJson — chuẩn hóa dữ liệu cũ/hỏng', () {
    test('fontSize ngoài bước bị khớp về bước hợp lệ gần nhất', () {
      final s = ReadingSettings.fromJson(<String, dynamic>{
        'fontSize': 99,
        'theme': 'sepia',
        'brightness': 0.5,
        'fontFamily': 'serif',
      });
      expect(s.fontSize, 28);
    });

    test('brightness ngoài [0,1] bị kẹp', () {
      expect(
        ReadingSettings.fromJson(<String, dynamic>{
          'brightness': 5.0,
        }).brightness,
        1.0,
      );
      expect(
        ReadingSettings.fromJson(<String, dynamic>{
          'brightness': -3.0,
        }).brightness,
        0.0,
      );
    });

    test('khóa thiếu hoặc tên enum lạ → giá trị mặc định', () {
      final s = ReadingSettings.fromJson(<String, dynamic>{
        'theme': 'khong-ton-tai',
        'fontFamily': 'comic-sans',
      });
      expect(s.theme, ReaderTheme.light);
      expect(s.fontFamily, ReaderFontFamily.serif);
      expect(s.fontSize, ReadingSettings.defaults.fontSize);
      expect(s.brightness, ReadingSettings.defaults.brightness);
    });

    test('JSON rỗng → toàn bộ giá trị mặc định', () {
      expect(
        ReadingSettings.fromJson(<String, dynamic>{}),
        ReadingSettings.defaults,
      );
    });

    test('fromJson là lũy đẳng (chuẩn hóa hai lần như một lần)', () {
      final once = ReadingSettings.fromJson(<String, dynamic>{
        'fontSize': 13,
        'theme': 'dark',
        'brightness': 2.0,
        'fontFamily': 'sansSerif',
      });
      expect(ReadingSettings.fromJson(once.toJson()), once);
    });
  });

  group('ReadingPosition round-trip + chuẩn hóa (Req 12.6, 12.7)', () {
    test('vị trí khởi đầu là chương đầu, đầu chương', () {
      expect(ReadingPosition.start.chapterIndex, 0);
      expect(ReadingPosition.start.inChapterProgress, 0);
    });

    test('khứ hồi cho giá trị hợp lệ', () {
      const pos = ReadingPosition(chapterIndex: 7, inChapterProgress: 0.42);
      expect(ReadingPosition.fromJson(pos.toJson()), pos);
    });

    test('inChapterProgress ngoài [0,1] bị kẹp', () {
      expect(
        ReadingPosition.fromJson(<String, dynamic>{
          'chapterIndex': 2,
          'inChapterProgress': 1.5,
        }).inChapterProgress,
        1.0,
      );
      expect(
        ReadingPosition.fromJson(<String, dynamic>{
          'chapterIndex': 2,
          'inChapterProgress': -0.2,
        }).inChapterProgress,
        0.0,
      );
    });

    test('chapterIndex âm bị kẹp về 0; khóa thiếu → 0', () {
      expect(
        ReadingPosition.fromJson(<String, dynamic>{
          'chapterIndex': -5,
        }).chapterIndex,
        0,
      );
      expect(
        ReadingPosition.fromJson(<String, dynamic>{}),
        ReadingPosition.start,
      );
    });
  });
}
