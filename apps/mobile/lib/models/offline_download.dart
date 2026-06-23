/// Mô hình đọc ngoại tuyến bền vững (`Offline_Download` — Req 16).
///
/// Một [OfflineDownload] là bản sao bền vững của toàn bộ [StoryPayload] của một
/// truyện cùng metadata (`storyId`, `title`, `updatedAt`), được `LocalStoryStore`
/// (task 4.10) lưu thành tệp JSON trên đĩa để đọc lại kể cả khi mất mạng hoàn
/// toàn hoặc sau khi khởi động lại App.
///
/// [OfflineDownloadMeta] là phần metadata **không kèm** payload, dùng khi liệt
/// kê các bản đã tải lúc khởi động (Req 16.8) mà không cần nạp toàn bộ nội dung.
///
/// [OfflineDownload.toJson]/[OfflineDownload.fromJson] bảo đảm tính khứ hồi
/// (lưu rồi nạp cho ra bản tương đương về `title` và toàn bộ chương theo `index`
/// tăng dần — Req 16.11) nhờ tính khứ hồi của [StoryPayload].
library;

import 'story_payload.dart';

/// Trạng thái tải về của một truyện (`Offline_Download_Status` — Req 16).
///
/// - [notDownloaded]: chưa tải.
/// - [downloading]: đang tải.
/// - [downloaded]: đã tải.
/// - [updateAvailable]: đã tải nhưng bản trên server đã thay đổi (Req 16.9).
enum OfflineDownloadStatus {
  notDownloaded,
  downloading,
  downloaded,
  updateAvailable;

  /// Giá trị wire (snake_case) khớp đặc tả: `not_downloaded`, `downloading`,
  /// `downloaded`, `update_available`.
  String get wireValue {
    switch (this) {
      case OfflineDownloadStatus.notDownloaded:
        return 'not_downloaded';
      case OfflineDownloadStatus.downloading:
        return 'downloading';
      case OfflineDownloadStatus.downloaded:
        return 'downloaded';
      case OfflineDownloadStatus.updateAvailable:
        return 'update_available';
    }
  }

  /// Phân tích từ giá trị wire; giá trị thiếu/không hợp lệ →
  /// [OfflineDownloadStatus.notDownloaded].
  static OfflineDownloadStatus fromWire(Object? value) {
    switch (value) {
      case 'downloading':
        return OfflineDownloadStatus.downloading;
      case 'downloaded':
        return OfflineDownloadStatus.downloaded;
      case 'update_available':
        return OfflineDownloadStatus.updateAvailable;
      case 'not_downloaded':
      default:
        return OfflineDownloadStatus.notDownloaded;
    }
  }
}

/// Metadata của một bản tải ngoại tuyến, **không kèm** [StoryPayload] (Req 16.8).
class OfflineDownloadMeta {
  const OfflineDownloadMeta({
    required this.storyId,
    required this.title,
    required this.updatedAt,
  });

  /// Mã định danh truyện (cũng là tên tệp `<storyId>.json`).
  final String storyId;

  /// Nhan đề truyện đã tải.
  final String title;

  /// Mốc cập nhật (ISO-8601) của bản đã tải — dùng phát hiện bản cũ (Req 16.9).
  final String updatedAt;

  factory OfflineDownloadMeta.fromJson(Map<String, dynamic> json) {
    return OfflineDownloadMeta(
      storyId: _asString(json['storyId']),
      title: _asString(json['title']),
      updatedAt: _asString(json['updatedAt']),
    );
  }

  Map<String, dynamic> toJson() => {
    'storyId': storyId,
    'title': title,
    'updatedAt': updatedAt,
  };

  @override
  bool operator ==(Object other) =>
      other is OfflineDownloadMeta &&
      other.storyId == storyId &&
      other.title == title &&
      other.updatedAt == updatedAt;

  @override
  int get hashCode => Object.hash(storyId, title, updatedAt);
}

/// Bản tải ngoại tuyến đầy đủ: metadata kèm toàn bộ [StoryPayload] (Req 16.1).
class OfflineDownload {
  const OfflineDownload({
    required this.storyId,
    required this.title,
    required this.updatedAt,
    required this.payload,
  });

  final String storyId;
  final String title;
  final String updatedAt;

  /// Toàn bộ nội dung truyện để đọc ngoại tuyến (Req 16.5).
  final StoryPayload payload;

  /// Phần metadata (không kèm payload) của bản tải này.
  OfflineDownloadMeta get meta =>
      OfflineDownloadMeta(storyId: storyId, title: title, updatedAt: updatedAt);

  /// Dựng từ JSON tệp đã lưu (`{ storyId, title, updatedAt, payload }`).
  factory OfflineDownload.fromJson(Map<String, dynamic> json) {
    final rawPayload = json['payload'];
    final payload = rawPayload is Map
        ? StoryPayload.fromJson(Map<String, dynamic>.from(rawPayload))
        : const StoryPayload(
            title: '',
            concept: Concept(logline: '', promise: '', conflictEngine: ''),
            storyBible: null,
            chapterPlan: <ChapterPlanItem>[],
            chapters: <Chapter>[],
          );
    return OfflineDownload(
      storyId: _asString(json['storyId']),
      title: _asString(json['title']),
      updatedAt: _asString(json['updatedAt']),
      payload: payload,
    );
  }

  /// Chuỗi hóa toàn bộ bản tải (metadata + payload) để ghi xuống đĩa.
  ///
  /// Nghịch đảo của [OfflineDownload.fromJson]; giữ tính khứ hồi của
  /// [StoryPayload] (Req 16.11).
  Map<String, dynamic> toJson() => {
    'storyId': storyId,
    'title': title,
    'updatedAt': updatedAt,
    'payload': payload.toJson(),
  };
}

String _asString(Object? value) => value is String ? value : '';
