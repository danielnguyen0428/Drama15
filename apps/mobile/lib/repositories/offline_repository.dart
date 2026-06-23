/// Repository đọc ngoại tuyến: điều phối tải `StoryPayload` mới nhất và lưu trữ
/// bền vững (`Local_Story_Store`) — Req 16.
///
/// Logic thuần ([isUpdateAvailable], [deriveStatus]) tách khỏi I/O để property
/// test (Property 17).
library;

import '../models/offline_download.dart';
import '../services/api_client.dart';
import '../services/local_story_store.dart';
import 'story_repository.dart';

class OfflineRepository {
  OfflineRepository(this._stories, this._store);

  final StoryRepository _stories;
  final LocalStoryStore _store;

  /// Nạp `StoryPayload` mới nhất qua `GET /stories/:id` rồi lưu bền vững.
  ///
  /// Trả [ApiFailure] nếu lỗi mạng/API hoặc thiếu nội dung; **không** ghi bản dở
  /// (Req 16.1, 16.4, 16.10). Lỗi hết dung lượng được ánh xạ thành thông điệp
  /// tiếng Việt.
  Future<ApiResponse<OfflineDownload>> download(String storyId) async {
    final response = await _stories.getStory(storyId);
    switch (response) {
      case ApiFailure<dynamic>():
        return (response as ApiFailure).cast<OfflineDownload>();
      case ApiSuccess(data: final detail):
        final payload = detail.storyPayload;
        if (payload == null) {
          return const ApiFailure<OfflineDownload>(
            ApiFailureKind.validation,
            '',
            code: 'story_no_content',
          );
        }
        final download = OfflineDownload(
          storyId: detail.id,
          title: detail.title,
          updatedAt: detail.updatedAt,
          payload: payload,
        );
        try {
          await _store.save(download);
        } on StorageFullException catch (e) {
          return ApiFailure<OfflineDownload>(ApiFailureKind.server, e.message);
        }
        return ApiSuccess<OfflineDownload>(download, response.httpStatus);
    }
  }

  /// Làm mới bản tải (tải lại + thay thế) — Req 16.10. Cùng luồng [download].
  Future<ApiResponse<OfflineDownload>> refresh(String storyId) =>
      download(storyId);

  /// Nạp bản tải ngoại tuyến của [storyId]; `null` nếu chưa tải (Req 16.5).
  Future<OfflineDownload?> loadOffline(String storyId) => _store.load(storyId);

  /// Xóa bản tải (Req 16.7).
  Future<void> remove(String storyId) => _store.delete(storyId);

  /// Liệt kê metadata các bản đã tải (Req 16.8).
  Future<List<OfflineDownloadMeta>> listDownloaded() => _store.list();

  // --- Logic thuần ---

  /// `true` khi [serverUpdatedAt] mới hơn [localUpdatedAt] (Req 16.9).
  ///
  /// So sánh theo thời điểm ISO-8601; nếu không parse được thì so sánh chuỗi.
  static bool isUpdateAvailable(String localUpdatedAt, String serverUpdatedAt) {
    final local = DateTime.tryParse(localUpdatedAt);
    final server = DateTime.tryParse(serverUpdatedAt);
    if (local != null && server != null) {
      return server.isAfter(local);
    }
    return serverUpdatedAt.compareTo(localUpdatedAt) > 0;
  }

  /// Suy diễn [OfflineDownloadStatus] nhất quán từ trạng thái tải (Req 16.9).
  static OfflineDownloadStatus deriveStatus({
    required bool isDownloaded,
    required bool isDownloading,
    String? localUpdatedAt,
    String? serverUpdatedAt,
  }) {
    if (isDownloading) {
      return OfflineDownloadStatus.downloading;
    }
    if (!isDownloaded) {
      return OfflineDownloadStatus.notDownloaded;
    }
    if (localUpdatedAt != null &&
        serverUpdatedAt != null &&
        isUpdateAvailable(localUpdatedAt, serverUpdatedAt)) {
      return OfflineDownloadStatus.updateAvailable;
    }
    return OfflineDownloadStatus.downloaded;
  }
}
