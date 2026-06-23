// Property-based test: canResumeStory khớp công thức bản web (Req 9.1).
//
// Feature: flutter-drama-mobile-app, Property 12: canResumeStory khớp công thức của bản web

import 'package:glados/glados.dart';

import 'package:drama15_mobile/logic/story_logic.dart';
import 'package:drama15_mobile/models/story.dart';

void main() {
  final statusGen = any.choose<StoryStatus>(StoryStatus.values);
  final canResumeGen = any.choose<bool?>(<bool?>[null, false, true]);
  final countGen = any.intInRange(0, 20);

  Glados3<StoryStatus, bool?, int>(
    statusGen,
    canResumeGen,
    countGen,
    ExploreConfig(numRuns: 100),
  ).test('khớp status != completed && (canResume==true || 0<count<15)', (
    status,
    canResume,
    chapterCount,
  ) {
    final story = SavedStory(
      id: 'id',
      title: 't',
      status: status,
      createdAt: '',
      updatedAt: '',
      chapterCount: chapterCount,
      canResume: canResume,
    );

    final expected =
        status != StoryStatus.completed &&
        (canResume == true ||
            (chapterCount > 0 && chapterCount < TOTAL_CHAPTERS));

    expect(canResumeStory(story), expected);
  });
}
