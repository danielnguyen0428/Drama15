/// Reducer thuần cho luồng sinh truyện SSE (Req 5.3–5.9, 6.5).
///
/// [StoryWorkspaceState] là trạng thái bất biến của khu vực "Bản thảo".
/// [reduceStream] ánh xạ một [StreamEvent] vào state hiện tại và trả về state
/// **mới**, chỉ cập nhật đúng phần tương ứng loại sự kiện và **không** làm hỏng
/// các phần khác (tâm điểm của Property 7). Sự kiện `chapter` áp dụng qua
/// [upsertChapterByIndex] nên lũy đẳng (Property 8).
library;

import '../models/story_payload.dart';
import '../models/stream_event.dart';
import 'story_logic.dart';

/// Giai đoạn của tiến trình sinh truyện.
enum GenerationPhase { idle, running, completed, error, needsRetry }

/// Trạng thái khu vực soạn thảo truyện (5 thẻ nội dung + tiến độ).
class StoryWorkspaceState {
  const StoryWorkspaceState({
    this.title = '',
    this.concept = '',
    this.storyBible,
    this.plan = '',
    this.relationshipGraph,
    this.chapters = const <Chapter>[],
    this.currentChapterIndex = 0,
    this.progressCurrent = 0,
    this.progressTotal = 0,
    this.progressLabel = '',
    this.phase = GenerationPhase.idle,
    this.errorMessage,
  });

  final String title;
  final String concept;
  final dynamic storyBible;
  final String plan;
  final dynamic relationshipGraph;
  final List<Chapter> chapters;
  final int currentChapterIndex;
  final int progressCurrent;
  final int progressTotal;
  final String progressLabel;
  final GenerationPhase phase;
  final String? errorMessage;

  /// Phần trăm tiến độ (0..100) suy từ `current`/`total`.
  double get progressPercent {
    if (progressTotal <= 0) {
      return phase == GenerationPhase.completed ? 100 : 0;
    }
    return (progressCurrent / progressTotal * 100).clamp(0, 100).toDouble();
  }

  StoryWorkspaceState copyWith({
    String? title,
    String? concept,
    Object? storyBible = _sentinel,
    String? plan,
    Object? relationshipGraph = _sentinel,
    List<Chapter>? chapters,
    int? currentChapterIndex,
    int? progressCurrent,
    int? progressTotal,
    String? progressLabel,
    GenerationPhase? phase,
    Object? errorMessage = _sentinel,
  }) {
    return StoryWorkspaceState(
      title: title ?? this.title,
      concept: concept ?? this.concept,
      storyBible: identical(storyBible, _sentinel)
          ? this.storyBible
          : storyBible,
      plan: plan ?? this.plan,
      relationshipGraph: identical(relationshipGraph, _sentinel)
          ? this.relationshipGraph
          : relationshipGraph,
      chapters: chapters ?? this.chapters,
      currentChapterIndex: currentChapterIndex ?? this.currentChapterIndex,
      progressCurrent: progressCurrent ?? this.progressCurrent,
      progressTotal: progressTotal ?? this.progressTotal,
      progressLabel: progressLabel ?? this.progressLabel,
      phase: phase ?? this.phase,
      errorMessage: identical(errorMessage, _sentinel)
          ? this.errorMessage
          : errorMessage as String?,
    );
  }

  static const Object _sentinel = Object();
}

/// Áp một [StreamEvent] vào [state], trả về state mới (hàm thuần).
StoryWorkspaceState reduceStream(StoryWorkspaceState state, StreamEvent event) {
  switch (event) {
    case ProgressEvent(
      current: final current,
      total: final total,
      detail: final detail,
      label: final label,
    ):
      return state.copyWith(
        progressCurrent: current,
        progressTotal: total,
        progressLabel: (detail != null && detail.isNotEmpty)
            ? detail
            : (label ?? state.progressLabel),
        phase: state.phase == GenerationPhase.idle
            ? GenerationPhase.running
            : state.phase,
      );
    case OverviewEvent(title: final title, concept: final concept):
      return state.copyWith(title: title, concept: concept);
    case BibleEvent(bible: final bible):
      return state.copyWith(storyBible: bible);
    case PlanEvent(plan: final plan):
      return state.copyWith(plan: plan);
    case RelationshipGraphEvent(relationshipGraph: final graph):
      return state.copyWith(relationshipGraph: graph);
    case ChapterEvent(chapter: final chapter):
      final updated = upsertChapterByIndex(state.chapters, chapter);
      return state.copyWith(
        chapters: updated,
        currentChapterIndex: chapter.index,
      );
    case DoneEvent(title: final title):
      return state.copyWith(
        title: (title != null && title.isNotEmpty) ? title : state.title,
        progressCurrent: state.progressTotal > 0
            ? state.progressTotal
            : state.progressCurrent,
        phase: GenerationPhase.completed,
      );
    case StreamErrorEvent(message: final message):
      return state.copyWith(
        phase: GenerationPhase.error,
        errorMessage: message,
      );
  }
}
