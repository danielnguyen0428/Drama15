/// Controller tủ truyện (Library_Module — Req 8).
library;

import 'package:flutter_riverpod/legacy.dart';

import '../config/providers.dart';
import '../models/story.dart';
import '../repositories/story_repository.dart';
import '../services/api_client.dart';

/// Trạng thái tủ truyện.
class LibraryState {
  const LibraryState({
    this.stories = const <SavedStory>[],
    this.loading = false,
    this.error,
    this.openedStory,
  });

  final List<SavedStory> stories;
  final bool loading;
  final String? error;
  final StoryDetail? openedStory;

  LibraryState copyWith({
    List<SavedStory>? stories,
    bool? loading,
    Object? error = _sentinel,
    Object? openedStory = _sentinel,
  }) {
    return LibraryState(
      stories: stories ?? this.stories,
      loading: loading ?? this.loading,
      error: identical(error, _sentinel) ? this.error : error as String?,
      openedStory: identical(openedStory, _sentinel)
          ? this.openedStory
          : openedStory as StoryDetail?,
    );
  }

  static const Object _sentinel = Object();
}

/// Liệt kê/mở/đổi tên/xóa truyện; giữ nguyên danh sách khi lỗi (Req 8.7).
class LibraryController extends StateNotifier<LibraryState> {
  LibraryController(this._stories) : super(const LibraryState());

  final StoryRepository _stories;

  /// `GET /stories` (Req 8.1, 8.6).
  Future<void> load() async {
    state = state.copyWith(loading: true, error: null);
    final response = await _stories.listStories();
    if (response is ApiSuccess<List<SavedStory>>) {
      state = state.copyWith(stories: response.data, loading: false);
    } else {
      final failure = response as ApiFailure<List<SavedStory>>;
      state = state.copyWith(loading: false, error: failure.message);
    }
  }

  /// Mở chi tiết truyện (Req 8.3).
  Future<void> open(String id) async {
    final response = await _stories.getStory(id);
    if (response is ApiSuccess<StoryDetail>) {
      state = state.copyWith(openedStory: response.data, error: null);
    } else {
      final failure = response as ApiFailure<StoryDetail>;
      state = state.copyWith(error: failure.message);
    }
  }

  /// Đổi tên truyện rồi làm mới danh sách (Req 8.4).
  Future<void> rename(String id, String title) async {
    final response = await _stories.renameStory(id, title);
    if (response is ApiSuccess) {
      await load();
    } else {
      final failure = response as ApiFailure;
      state = state.copyWith(error: failure.message);
    }
  }

  /// Xóa truyện và loại khỏi danh sách (Req 8.5).
  Future<void> delete(String id) async {
    final response = await _stories.deleteStory(id);
    if (response is ApiSuccess) {
      state = state.copyWith(
        stories: state.stories.where((s) => s.id != id).toList(),
      );
    } else {
      final failure = response as ApiFailure;
      state = state.copyWith(error: failure.message);
    }
  }
}

/// Provider cho [LibraryController].
final libraryControllerProvider =
    StateNotifierProvider<LibraryController, LibraryState>((ref) {
      return LibraryController(ref.watch(storyRepositoryProvider));
    });
