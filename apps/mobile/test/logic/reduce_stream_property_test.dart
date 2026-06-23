// Property-based test: reduceStream ánh xạ đúng từng loại sự kiện SSE
// (Req 5.3–5.7, 5.9).
//
// Feature: flutter-drama-mobile-app, Property 7: reduceStream ánh xạ đúng từng loại sự kiện SSE

import 'package:glados/glados.dart';

import 'package:drama15_mobile/logic/stream_reducer.dart';
import 'package:drama15_mobile/models/story_payload.dart';
import 'package:drama15_mobile/models/stream_event.dart';

// Trạng thái nền có giá trị khác mặc định ở mọi trường để phát hiện rò rỉ.
final _base = StoryWorkspaceState(
  title: 'T0',
  concept: 'C0',
  storyBible: const {'x': 1},
  plan: 'P0',
  relationshipGraph: const {'g': 1},
  chapters: const [Chapter(index: 5, content: 'c5')],
  currentChapterIndex: 5,
  progressCurrent: 1,
  progressTotal: 2,
  progressLabel: 'L0',
  phase: GenerationPhase.running,
);

void main() {
  final stageGen = any.choose<String>(<String>[
    'progress',
    'overview',
    'bible',
    'plan',
    'relationshipGraph',
    'done',
  ]);

  Glados2<String, String>(
    stageGen,
    any.lowercaseLetters,
    ExploreConfig(numRuns: 100),
  ).test('mỗi sự kiện chỉ cập nhật phần state tương ứng', (stage, s) {
    final next = _reduceFor(stage, s);

    switch (stage) {
      case 'progress':
        // Tiến độ cập nhật; nội dung 5 thẻ giữ nguyên.
        expect(next.title, _base.title);
        expect(next.concept, _base.concept);
        expect(next.storyBible, _base.storyBible);
        expect(next.plan, _base.plan);
        expect(next.relationshipGraph, _base.relationshipGraph);
        expect(next.chapters, _base.chapters);
        expect(next.progressCurrent, 3);
        expect(next.progressTotal, 7);
      case 'overview':
        expect(next.title, 'NT_$s');
        expect(next.concept, 'NC_$s');
        _expectUnchangedExceptTitleConcept(next);
      case 'bible':
        expect(next.storyBible, {'b': s});
        expect(next.title, _base.title);
        expect(next.plan, _base.plan);
        expect(next.relationshipGraph, _base.relationshipGraph);
        expect(next.chapters, _base.chapters);
      case 'plan':
        expect(next.plan, 'PL_$s');
        expect(next.storyBible, _base.storyBible);
        expect(next.relationshipGraph, _base.relationshipGraph);
        expect(next.chapters, _base.chapters);
      case 'relationshipGraph':
        expect(next.relationshipGraph, {'r': s});
        expect(next.storyBible, _base.storyBible);
        expect(next.plan, _base.plan);
        expect(next.chapters, _base.chapters);
      case 'done':
        expect(next.phase, GenerationPhase.completed);
        expect(next.progressCurrent, _base.progressTotal);
        // Nội dung không bị xóa.
        expect(next.concept, _base.concept);
        expect(next.storyBible, _base.storyBible);
        expect(next.chapters, _base.chapters);
    }
  });
}

void _expectUnchangedExceptTitleConcept(StoryWorkspaceState s) {
  expect(s.storyBible, _base.storyBible);
  expect(s.plan, _base.plan);
  expect(s.relationshipGraph, _base.relationshipGraph);
  expect(s.chapters, _base.chapters);
  expect(s.progressCurrent, _base.progressCurrent);
  expect(s.progressTotal, _base.progressTotal);
}

StoryWorkspaceState _reduceFor(String stage, String s) {
  switch (stage) {
    case 'progress':
      return reduceStream(_base, ProgressEvent(current: 3, total: 7, label: s));
    case 'overview':
      return reduceStream(
        _base,
        OverviewEvent(title: 'NT_$s', concept: 'NC_$s'),
      );
    case 'bible':
      return reduceStream(_base, BibleEvent({'b': s}));
    case 'plan':
      return reduceStream(_base, PlanEvent('PL_$s'));
    case 'relationshipGraph':
      return reduceStream(_base, RelationshipGraphEvent({'r': s}));
    case 'done':
      return reduceStream(_base, const DoneEvent());
    default:
      return _base;
  }
}
