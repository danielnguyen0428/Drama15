// Property-based test: buildStoryMarkdown gồm nhan đề và toàn bộ chương theo
// index tăng (Req 13.2, 13.3).
//
// Feature: flutter-drama-mobile-app, Property 16: Markdown bản thảo gồm nhan đề và toàn bộ chương theo index tăng

import 'package:glados/glados.dart';

import 'package:drama15_mobile/logic/story_logic.dart';
import 'package:drama15_mobile/models/story_payload.dart';

void main() {
  final indicesGen = any.list(any.intInRange(0, 30));

  Glados2<String, List<int>>(
    any.nonEmptyLowercaseLetters,
    indicesGen,
    ExploreConfig(numRuns: 100),
  ).test('markdown chứa nhan đề và mọi chương theo thứ tự index tăng', (
    title,
    indices,
  ) {
    final unique = indices.toSet().toList();
    final chapters = unique
        .map((i) => Chapter(index: i, title: 'T$i', content: 'noi dung $i'))
        .toList();
    final payload = StoryPayload(
      title: title,
      concept: const Concept(logline: '', promise: '', conflictEngine: ''),
      storyBible: null,
      chapterPlan: const <ChapterPlanItem>[],
      chapters: chapters,
    );

    final md = buildStoryMarkdown(title, payload);

    // Nhan đề có mặt ở đầu.
    expect(md.contains('# $title'), isTrue);

    // Mọi chương xuất hiện, theo thứ tự index tăng dần.
    final sorted = [...unique]..sort();
    var searchFrom = 0;
    for (final i in sorted) {
      final heading = '## Chương $i:';
      final pos = md.indexOf(heading, searchFrom);
      expect(
        pos,
        greaterThanOrEqualTo(searchFrom),
        reason: 'Thiếu hoặc sai thứ tự chương $i',
      );
      searchFrom = pos + heading.length;
    }
  });
}
