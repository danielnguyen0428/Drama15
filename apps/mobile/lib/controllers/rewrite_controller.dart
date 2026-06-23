/// Controller viết lại chương (Rewrite_Module — Req 10).
library;

import 'package:flutter_riverpod/legacy.dart';

import '../config/providers.dart';
import '../models/relationship_graph.dart';
import '../models/rewrite.dart';
import '../models/story_payload.dart';
import '../repositories/story_repository.dart';
import '../services/api_client.dart';

/// Trạng thái bảng viết lại.
class RewriteState {
  const RewriteState({
    this.mode = RewriteMode.full_chapter,
    this.instruction = '',
    this.submitting = false,
    this.error,
    this.updatedChapter,
    this.updatedGraph,
  });

  final RewriteMode mode;
  final String instruction;
  final bool submitting;
  final String? error;
  final Chapter? updatedChapter;
  final RelationshipGraph? updatedGraph;

  /// Cho phép gửi khi hướng dẫn không rỗng (Req 10.5).
  bool get canSubmit => instruction.trim().isNotEmpty && !submitting;

  RewriteState copyWith({
    RewriteMode? mode,
    String? instruction,
    bool? submitting,
    Object? error = _sentinel,
    Object? updatedChapter = _sentinel,
    Object? updatedGraph = _sentinel,
  }) {
    return RewriteState(
      mode: mode ?? this.mode,
      instruction: instruction ?? this.instruction,
      submitting: submitting ?? this.submitting,
      error: identical(error, _sentinel) ? this.error : error as String?,
      updatedChapter: identical(updatedChapter, _sentinel)
          ? this.updatedChapter
          : updatedChapter as Chapter?,
      updatedGraph: identical(updatedGraph, _sentinel)
          ? this.updatedGraph
          : updatedGraph as RelationshipGraph?,
    );
  }

  static const Object _sentinel = Object();
}

/// Chọn chế độ + gửi yêu cầu viết lại chương.
class RewriteController extends StateNotifier<RewriteState> {
  RewriteController(this._stories) : super(const RewriteState());

  final StoryRepository _stories;

  void selectMode(RewriteMode mode) => state = state.copyWith(mode: mode);

  void setInstruction(String instruction) =>
      state = state.copyWith(instruction: instruction);

  /// `POST /stories/:id/rewrite` với `chapterIndex`/`mode`/`instruction`
  /// (Req 10.3, 10.4, 10.6).
  Future<void> submit(String storyId, int chapterIndex) async {
    if (!state.canSubmit) {
      return;
    }
    state = state.copyWith(submitting: true, error: null);
    final response = await _stories.rewriteChapter(
      storyId,
      RewriteRequest(
        chapterIndex: chapterIndex,
        mode: state.mode.name,
        instruction: state.instruction,
      ),
    );
    if (response is ApiSuccess<RewriteResult>) {
      state = state.copyWith(
        submitting: false,
        updatedChapter: response.data.chapter,
        updatedGraph: response.data.relationshipGraph,
      );
    } else {
      final failure = response as ApiFailure<RewriteResult>;
      state = state.copyWith(submitting: false, error: failure.message);
    }
  }
}

/// Provider cho [RewriteController].
final rewriteControllerProvider =
    StateNotifierProvider<RewriteController, RewriteState>((ref) {
      return RewriteController(ref.watch(storyRepositoryProvider));
    });
