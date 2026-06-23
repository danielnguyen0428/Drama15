// Property-based test: upsertChapterByIndex idempotent, duy nhất theo index,
// sắp tăng (Req 5.8, 6.5).
//
// Feature: flutter-drama-mobile-app, Property 8: Áp sự kiện chương là idempotent, duy nhất theo index và sắp tăng

import 'package:glados/glados.dart';

import 'package:drama15_mobile/logic/story_logic.dart';
import 'package:drama15_mobile/models/story_payload.dart';

void main() {
  final chapterGen = any.combine2<int, String, Chapter>(
    any.intInRange(0, 20),
    any.lowercaseLetters,
    (index, content) => Chapter(index: index, content: content),
  );
  final listGen = any.list(chapterGen);

  Glados2<List<Chapter>, Chapter>(
    listGen,
    chapterGen,
    ExploreConfig(numRuns: 100),
  ).test('lũy đẳng, duy nhất theo index, sắp tăng dần', (rawList, next) {
    // `existing` luôn được dựng qua chuỗi upsert (như cách dùng thực tế),
    // nên đã duy nhất theo index và sắp tăng — đúng tiền điều kiện.
    final existing = rawList.fold<List<Chapter>>(
      <Chapter>[],
      (acc, c) => upsertChapterByIndex(acc, c),
    );

    final once = upsertChapterByIndex(existing, next);
    final twice = upsertChapterByIndex(once, next);

    // Lũy đẳng: áp lần hai cho cùng kết quả.
    expect(twice, once);

    // Sắp tăng dần theo index.
    for (var i = 1; i < once.length; i++) {
      expect(once[i].index >= once[i - 1].index, isTrue);
    }

    // Duy nhất theo index.
    final indices = once.map((c) => c.index).toList();
    expect(indices.toSet().length, indices.length);

    // next hiện diện với đúng nội dung của lần áp dụng cuối.
    expect(once.where((c) => c.index == next.index).single, next);
  });
}
