/// Controller trạng thái đọc ngoại tuyến (Offline_Download_Status — Req 16).
library;

import 'package:flutter_riverpod/legacy.dart';

import '../config/providers.dart';
import '../i18n/app_strings.dart';
import '../models/offline_download.dart';
import '../models/story.dart';
import '../repositories/offline_repository.dart';
import '../services/api_client.dart';

/// Giữ trạng thái tải về của từng truyện (`storyId → status`).
class OfflineController
    extends StateNotifier<Map<String, OfflineDownloadStatus>> {
  OfflineController(this._repo, {required AppStrings Function() getStrings})
    : _getStrings = getStrings,
      super(const <String, OfflineDownloadStatus>{});

  final OfflineRepository _repo;
  final AppStrings Function() _getStrings;

  /// Thông điệp lỗi gần nhất (Req 16.4) — UI đọc để hiển thị.
  String? lastError;

  OfflineDownloadStatus statusOf(String storyId) =>
      state[storyId] ?? OfflineDownloadStatus.notDownloaded;

  void _setStatus(String storyId, OfflineDownloadStatus status) {
    state = <String, OfflineDownloadStatus>{...state, storyId: status};
  }

  /// Tải về (downloading → downloaded); lỗi thì giữ trạng thái trước (Req 16.1–16.4).
  Future<void> downloadStory(String storyId) async {
    final previous = statusOf(storyId);
    lastError = null;
    _setStatus(storyId, OfflineDownloadStatus.downloading);
    final response = await _repo.download(storyId);
    if (response is ApiSuccess<OfflineDownload>) {
      _setStatus(storyId, OfflineDownloadStatus.downloaded);
    } else {
      lastError = _getStrings().localizeFailure(
        response as ApiFailure<OfflineDownload>,
      );
      _setStatus(storyId, previous);
    }
  }

  /// Làm mới bản tải (update_available → downloaded) — Req 16.10.
  Future<void> refreshStory(String storyId) async {
    final previous = statusOf(storyId);
    lastError = null;
    _setStatus(storyId, OfflineDownloadStatus.downloading);
    final response = await _repo.refresh(storyId);
    if (response is ApiSuccess<OfflineDownload>) {
      _setStatus(storyId, OfflineDownloadStatus.downloaded);
    } else {
      lastError = _getStrings().localizeFailure(
        response as ApiFailure<OfflineDownload>,
      );
      _setStatus(storyId, previous);
    }
  }

  /// Xóa bản tải (→ not_downloaded) — Req 16.7.
  Future<void> deleteDownload(String storyId) async {
    await _repo.remove(storyId);
    _setStatus(storyId, OfflineDownloadStatus.notDownloaded);
  }

  /// Khôi phục trạng thái khi khởi động: bản đã lưu → downloaded (Req 16.8).
  Future<void> restoreOnStartup() async {
    final metas = await _repo.listDownloaded();
    final next = <String, OfflineDownloadStatus>{...state};
    for (final meta in metas) {
      next[meta.storyId] = OfflineDownloadStatus.downloaded;
    }
    state = next;
  }

  /// So sánh với danh sách server để gán update_available khi có mạng (Req 16.9).
  Future<void> checkForUpdates(List<SavedStory> remote) async {
    final metas = await _repo.listDownloaded();
    final localUpdatedAt = <String, String>{
      for (final m in metas) m.storyId: m.updatedAt,
    };
    final next = <String, OfflineDownloadStatus>{...state};
    for (final story in remote) {
      final isDownloaded = localUpdatedAt.containsKey(story.id);
      if (!isDownloaded) {
        continue;
      }
      next[story.id] = OfflineRepository.deriveStatus(
        isDownloaded: true,
        isDownloading: false,
        localUpdatedAt: localUpdatedAt[story.id],
        serverUpdatedAt: story.updatedAt,
      );
    }
    state = next;
  }
}

/// Provider cho [OfflineController].
final offlineControllerProvider =
    StateNotifierProvider<
      OfflineController,
      Map<String, OfflineDownloadStatus>
    >((ref) {
      return OfflineController(
        ref.watch(offlineRepositoryProvider),
        getStrings: () => AppStrings.forLanguage(ref.read(uiOutputLanguageProvider)),
      );
    });
