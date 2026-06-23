// Property-based test khứ hồi lưu/nạp `ReadingPosition` (Req 12.6, 17.12).
//
// Feature: flutter-drama-mobile-app, Property 15: Reading_Position khứ hồi lưu/nạp

import 'package:glados/glados.dart';

import 'package:drama15_mobile/models/reading.dart';

void main() {
  final positionGen = any.combine2<int, double, ReadingPosition>(
    any.intInRange(0, 1000),
    any.doubleInRange(0, 1),
    (chapterIndex, progress) => ReadingPosition(
      chapterIndex: chapterIndex,
      inChapterProgress: progress,
    ),
  );

  Glados<ReadingPosition>(positionGen, ExploreConfig(numRuns: 100)).test(
    'ReadingPosition.fromJson(toJson()) tương đương bản gốc',
    (position) {
      expect(ReadingPosition.fromJson(position.toJson()), position);
    },
  );
}
