/// Controller Trình đọc (Reader — Req 11, 12, 17).
library;

import 'package:flutter/widgets.dart' show Size;
import 'package:flutter_riverpod/legacy.dart';

import '../config/providers.dart';
import '../logic/paginator.dart';
import '../logic/reader_progress.dart';
import '../models/reading.dart';
import '../models/story_payload.dart';
import '../repositories/reading_repository.dart';

/// Trạng thái Trình đọc.
class ReaderState {
  const ReaderState({
    this.storyId = '',
    this.chapters = const <Chapter>[],
    this.currentChapterPos = 0,
    this.inChapterProgress = 0,
    this.settings = ReadingSettings.defaults,
    this.pages = const <Page>[],
    this.currentPageIndex = 0,
  });

  final String storyId;

  /// Chương đã sắp theo `index` tăng dần (Req 11.1).
  final List<Chapter> chapters;

  /// Vị trí chương hiện tại trong [chapters] (0-based).
  final int currentChapterPos;
  final double inChapterProgress;
  final ReadingSettings settings;

  /// Danh sách trang của chương hiện tại (chế độ `paged`).
  final List<Page> pages;
  final int currentPageIndex;

  Chapter? get currentChapter =>
      (currentChapterPos >= 0 && currentChapterPos < chapters.length)
      ? chapters[currentChapterPos]
      : null;

  bool get canPrevChapter => currentChapterPos > 0;
  bool get canNextChapter => currentChapterPos < chapters.length - 1;

  bool get canPrevPage => currentPageIndex > 0 || canPrevChapter;
  bool get canNextPage => currentPageIndex < pages.length - 1 || canNextChapter;

  /// Phần trăm tiến độ đọc của truyện (Req 11.7).
  double get progressPercentValue =>
      progressPercent(currentChapterPos, inChapterProgress, chapters.length);

  ReaderState copyWith({
    String? storyId,
    List<Chapter>? chapters,
    int? currentChapterPos,
    double? inChapterProgress,
    ReadingSettings? settings,
    List<Page>? pages,
    int? currentPageIndex,
  }) {
    return ReaderState(
      storyId: storyId ?? this.storyId,
      chapters: chapters ?? this.chapters,
      currentChapterPos: currentChapterPos ?? this.currentChapterPos,
      inChapterProgress: inChapterProgress ?? this.inChapterProgress,
      settings: settings ?? this.settings,
      pages: pages ?? this.pages,
      currentPageIndex: currentPageIndex ?? this.currentPageIndex,
    );
  }
}

/// Điều phối đọc: thiết lập, vị trí, điều hướng chương/trang, phân trang.
class ReaderController extends StateNotifier<ReaderState> {
  ReaderController(this._reading) : super(const ReaderState());

  final ReadingRepository _reading;
  Size? _viewport;

  /// Mở truyện: nạp thiết lập + vị trí đã lưu (Req 11.9, 12.2, 12.4, 12.7).
  Future<void> openStory(String storyId, List<Chapter> chapters) async {
    final sorted = [...chapters]..sort((a, b) => a.index.compareTo(b.index));
    final settings = await _reading.loadSettings();
    final position = await _reading.loadPosition(storyId);
    final pos = position == null
        ? 0
        : position.chapterIndex.clamp(
            0,
            sorted.isEmpty ? 0 : sorted.length - 1,
          );
    state = ReaderState(
      storyId: storyId,
      chapters: sorted,
      currentChapterPos: pos,
      inChapterProgress: position?.inChapterProgress ?? 0,
      settings: settings,
    );
    _recompute();
  }

  Future<void> _savePosition() async {
    if (state.storyId.isEmpty) {
      return;
    }
    await _reading.savePosition(
      state.storyId,
      ReadingPosition(
        chapterIndex: state.currentChapterPos,
        inChapterProgress: state.inChapterProgress,
      ),
    );
  }

  /// Chuyển tới chương theo vị trí trong danh sách (Req 11.8, 11.11, 11.12).
  void goToChapter(int pos) {
    if (pos < 0 || pos >= state.chapters.length) {
      return;
    }
    state = state.copyWith(
      currentChapterPos: pos,
      inChapterProgress: 0,
      currentPageIndex: 0,
    );
    _recompute();
    _savePosition();
  }

  void nextChapter() {
    if (state.canNextChapter) {
      goToChapter(state.currentChapterPos + 1);
    }
  }

  void prevChapter() {
    if (state.canPrevChapter) {
      goToChapter(state.currentChapterPos - 1);
    }
  }

  /// Cập nhật vị trí cuộn trong chương (chế độ `scroll`) và lưu (Req 12.3).
  void setInChapterProgress(double progress) {
    state = state.copyWith(inChapterProgress: progress.clamp(0.0, 1.0));
    _savePosition();
  }

  /// Áp dụng thiết lập đọc mới tức thời + lưu (Req 11.10, 12.1, 17.3).
  Future<void> updateSettings(ReadingSettings settings) async {
    state = state.copyWith(settings: settings);
    await _reading.saveSettings(settings);
    _recompute();
  }

  /// Đổi `Reading_Mode` (Req 17.2, 17.3).
  Future<void> setReadingMode(ReadingMode mode) =>
      updateSettings(state.settings.copyWith(mode: mode));

  /// Tính lại các trang khi đổi cỡ chữ/phông/xoay (Req 17.5).
  void recomputePages(Size viewport) {
    _viewport = viewport;
    _recompute();
  }

  void _recompute() {
    if (state.settings.mode != ReadingMode.paged) {
      return;
    }
    final viewport = _viewport;
    final chapter = state.currentChapter;
    if (viewport == null || chapter == null) {
      return;
    }
    final pages = Paginator.paginate(chapter.content, viewport, state.settings);
    final pageIndex = Paginator.progressToPageIndex(
      state.inChapterProgress,
      pages.length,
    );
    state = state.copyWith(pages: pages, currentPageIndex: pageIndex);
  }

  /// Sang trang kế (Req 17.6, 17.8, 17.10).
  void nextPage() {
    if (state.currentPageIndex < state.pages.length - 1) {
      final next = state.currentPageIndex + 1;
      state = state.copyWith(
        currentPageIndex: next,
        inChapterProgress: Paginator.pageIndexToProgress(
          next,
          state.pages.length,
        ),
      );
      _savePosition();
    } else if (state.canNextChapter) {
      goToChapter(state.currentChapterPos + 1); // mở chương kế ở trang đầu
    }
  }

  /// Về trang trước (Req 17.7, 17.9, 17.11).
  void prevPage() {
    if (state.currentPageIndex > 0) {
      final prev = state.currentPageIndex - 1;
      state = state.copyWith(
        currentPageIndex: prev,
        inChapterProgress: Paginator.pageIndexToProgress(
          prev,
          state.pages.length,
        ),
      );
      _savePosition();
    } else if (state.canPrevChapter) {
      // Chương trước, tới trang cuối.
      final prevPos = state.currentChapterPos - 1;
      state = state.copyWith(
        currentChapterPos: prevPos,
        inChapterProgress: 1,
        currentPageIndex: 0,
      );
      final viewport = _viewport;
      final chapter = state.currentChapter;
      if (viewport != null && chapter != null) {
        final pages = Paginator.paginate(
          chapter.content,
          viewport,
          state.settings,
        );
        state = state.copyWith(
          pages: pages,
          currentPageIndex: pages.isEmpty ? 0 : pages.length - 1,
        );
      }
      _savePosition();
    }
  }
}

/// Provider cho [ReaderController].
final readerControllerProvider =
    StateNotifierProvider<ReaderController, ReaderState>((ref) {
      return ReaderController(ref.watch(readingRepositoryProvider));
    });
