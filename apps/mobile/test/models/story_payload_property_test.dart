// Property-based test khứ hồi lưu/nạp `StoryPayload` (Req 16.11).
//
// Feature: flutter-drama-mobile-app, Property 18: StoryPayload offline khứ hồi lưu/nạp

import 'package:glados/glados.dart';

import 'package:drama15_mobile/models/story_payload.dart';

void main() {
  // Danh sách chỉ số chương phân biệt, dựng chương xác định theo từng index.
  final indicesGen = any.list(any.intInRange(0, 40));

  final payloadGen = any.combine2<String, List<int>, StoryPayload>(
    any.lowercaseLetters,
    indicesGen,
    (title, indices) {
      final unique = indices.toSet().toList();
      final chapters = unique
          .map(
            (i) =>
                Chapter(index: i, title: 'Chương $i', content: 'Nội dung $i'),
          )
          .toList();
      return StoryPayload(
        title: title,
        concept: const Concept(logline: '', promise: '', conflictEngine: ''),
        storyBible: null,
        chapterPlan: const <ChapterPlanItem>[],
        chapters: chapters,
      );
    },
  );

  Glados<StoryPayload>(payloadGen, ExploreConfig(numRuns: 100)).test(
    'lưu rồi nạp giữ nguyên nhan đề và toàn bộ chương theo index tăng dần',
    (payload) {
      final restored = StoryPayload.fromJson(payload.toJson());

      expect(restored.title, payload.title);

      final expectedChapters = [...payload.chapters]
        ..sort((a, b) => a.index.compareTo(b.index));
      expect(restored.chapters, expectedChapters);

      // Bảo đảm thứ tự thực sự tăng dần theo index.
      for (var i = 1; i < restored.chapters.length; i++) {
        expect(
          restored.chapters[i].index >= restored.chapters[i - 1].index,
          isTrue,
        );
      }
    },
  );
}
