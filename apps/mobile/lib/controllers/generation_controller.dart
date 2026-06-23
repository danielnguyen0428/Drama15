/// Controller sinh truyện qua SSE + viết tiếp (Generation_Module — Req 5, 9, 15.2).
library;

import 'dart:async';

import 'package:flutter_riverpod/legacy.dart';

import '../config/providers.dart';
import '../i18n/app_strings.dart';
import '../logic/stream_reducer.dart';
import '../models/story_config.dart';
import '../models/stream_event.dart';
import '../repositories/story_repository.dart';
import '../services/api_client.dart';
import '../services/sse_client.dart';
import '../services/supabase_auth_service.dart';
import 'quota_controller.dart';

/// Điều phối tạo bản thảo, nhận SSE và viết tiếp.
class GenerationController extends StateNotifier<StoryWorkspaceState> {
  GenerationController(
    this._stories,
    this._sse,
    this._auth,
    this._quota, {
    required AppStrings Function() getStrings,
    Future<void> Function()? onStoriesChanged,
  }) : _getStrings = getStrings,
       _onStoriesChanged = onStoriesChanged,
       super(const StoryWorkspaceState());

  final StoryRepository _stories;
  final SseClient _sse;
  final SupabaseAuthService _auth;
  final QuotaController _quota;
  final AppStrings Function() _getStrings;
  final Future<void> Function()? _onStoriesChanged;

  String? _storyId;
  StreamSubscription<StreamEvent>? _sub;

  /// Id truyện đang sinh (dùng cho điều hướng / chia sẻ).
  String? get storyId => _storyId;

  /// Tạo bản thảo rồi mở SSE (Req 5.1, 5.2, 7.4).
  Future<void> createAndStream(StoryConfig config) async {
    state = const StoryWorkspaceState(phase: GenerationPhase.running);
    final response = await _stories.createStory(config);
    if (response is ApiFailure<dynamic>) {
      final failure = response as ApiFailure;
      state = state.copyWith(
        phase: GenerationPhase.error,
        errorMessage: _getStrings().localizeFailure(failure),
      );
      return;
    }
    final result = (response as dynamic).data;
    _quota.applyStoryQuota(result.quota);
    await _openStream(result.storyId);
  }

  /// Viết tiếp truyện dang dở: nạp bản thảo → resume → mở lại SSE (Req 9.3–9.5).
  Future<void> resumeAndStream(String id) async {
    final detailResponse = await _stories.getStory(id);
    if (detailResponse is ApiFailure<dynamic>) {
      final failure = detailResponse as ApiFailure;
      state = state.copyWith(
        phase: GenerationPhase.error,
        errorMessage: _getStrings().localizeFailure(failure),
      );
      return;
    }
    final detail = (detailResponse as dynamic).data;
    final payload = detail.storyPayload;
    state = StoryWorkspaceState(
      title: detail.title as String,
      chapters: payload?.chapters ?? const [],
      currentChapterIndex: 0,
      phase: GenerationPhase.running,
    );

    final resume = await _stories.resumeStory(id);
    if (resume is ApiFailure<dynamic>) {
      final failure = resume as ApiFailure;
      final strings = _getStrings();
      final message = switch (failure.code) {
        'story_completed' => strings.storyCompleted,
        'story_not_resumable' => strings.storyNotResumable,
        _ => strings.localizeFailure(failure),
      };
      state = state.copyWith(
        phase: GenerationPhase.error,
        errorMessage: message,
      );
      return;
    }
    await _openStream(id);
  }

  Future<void> _openStream(String storyId) async {
    _storyId = storyId;
    final token = await _auth.currentAccessToken();
    if (token == null) {
      state = state.copyWith(
        phase: GenerationPhase.error,
        errorMessage: _getStrings().pleaseSignInAgain,
      );
      return;
    }

    await _sub?.cancel();
    _sub = _sse
        .connect(storyId, accessToken: token)
        .listen(
          _onEvent,
          onError: (_) => onStreamBroken(),
          onDone: () {
            if (state.phase != GenerationPhase.completed &&
                state.phase != GenerationPhase.error) {
              onStreamBroken();
            }
          },
        );
  }

  void _onEvent(StreamEvent event) {
    state = reduceStream(state, event);
    if (event is DoneEvent) {
      _finish();
    }
  }

  Future<void> _finish() async {
    await _sub?.cancel();
    _sub = null;
    _sse.close();
    // Làm mới danh sách truyện và hạn mức (Req 5.9).
    await _onStoriesChanged?.call();
    final me = await _stories.getAuthMe();
    if (me is ApiSuccess) {
      _quota.applyStoryQuota((me as dynamic).data.storyQuota);
    }
  }

  /// SSE đứt trước `done`: chuyển sang trạng thái cần thử lại (Req 15.2).
  void onStreamBroken() {
    _sub?.cancel();
    _sub = null;
    _sse.close();
    state = state.copyWith(
      phase: GenerationPhase.needsRetry,
      errorMessage: _getStrings().streamDisconnected,
    );
  }

  /// Đóng luồng SSE đang mở.
  void closeStream() {
    _sub?.cancel();
    _sub = null;
    _sse.close();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _sse.close();
    super.dispose();
  }
}

/// Provider cho [GenerationController].
final generationControllerProvider =
    StateNotifierProvider<GenerationController, StoryWorkspaceState>((ref) {
      return GenerationController(
        ref.watch(storyRepositoryProvider),
        ref.watch(sseClientProvider),
        ref.watch(supabaseAuthServiceProvider),
        ref.watch(quotaControllerProvider.notifier),
        getStrings: () => AppStrings.forLanguage(ref.read(uiOutputLanguageProvider)),
      );
    });
