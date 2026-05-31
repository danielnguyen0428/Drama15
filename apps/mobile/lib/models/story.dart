/// Mô hình truyện đã lưu và chi tiết truyện, kèm nhãn trạng thái tiếng Việt.
///
/// Ánh xạ 1-1 với phản hồi `GET /stories` (`{ stories: SavedStory[] }`) và
/// `GET /stories/:id` (`{ story: StoryDetail }`). [statusLabel] là hàm thuần,
/// **toàn phần** (total) trên [StoryStatus] (Req 8.2).
library;

import 'relationship_graph.dart';
import 'story_payload.dart';

/// Trạng thái truyện (Story_Status). Bốn giá trị khớp đúng API.
enum StoryStatus { queued, running, completed, failed }

/// Nhãn hiển thị tiếng Việt cho mỗi [StoryStatus] (Req 8.2).
///
/// Hàm thuần và toàn phần: `queued → "Đang chờ"`, `running → "Đang viết"`,
/// `completed → "Hoàn tất"`, `failed → "Có lỗi"`. `switch` biểu thức bảo đảm mọi
/// giá trị enum đều được ánh xạ (không bỏ sót).
String statusLabel(StoryStatus status) {
  return switch (status) {
    StoryStatus.queued => 'Đang chờ',
    StoryStatus.running => 'Đang viết',
    StoryStatus.completed => 'Hoàn tất',
    StoryStatus.failed => 'Có lỗi',
  };
}

/// Phân tích chuỗi `status` của API thành [StoryStatus].
///
/// Giá trị không nhận diện được mặc định về [StoryStatus.queued] để an toàn
/// trước dữ liệu lạ (không ném lỗi).
StoryStatus storyStatusFromString(Object? value) {
  return switch (value) {
    'queued' => StoryStatus.queued,
    'running' => StoryStatus.running,
    'completed' => StoryStatus.completed,
    'failed' => StoryStatus.failed,
    _ => StoryStatus.queued,
  };
}

/// Chuyển [StoryStatus] về chuỗi khớp API.
String storyStatusToString(StoryStatus status) {
  return switch (status) {
    StoryStatus.queued => 'queued',
    StoryStatus.running => 'running',
    StoryStatus.completed => 'completed',
    StoryStatus.failed => 'failed',
  };
}

/// Bản tóm tắt một truyện đã lưu, dùng trong tủ truyện (Req 8).
class SavedStory {
  const SavedStory({
    required this.id,
    required this.title,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.completedAt,
    required this.chapterCount,
    this.canResume,
    this.error,
  });

  final String id;
  final String title;
  final StoryStatus status;
  final String createdAt;
  final String updatedAt;
  final String? completedAt;
  final int chapterCount;

  /// Cờ "có thể viết tiếp" do server cung cấp (tùy chọn). Logic vị từ đầy đủ
  /// nằm ở `canResumeStory` (task 4.2).
  final bool? canResume;

  /// Thông điệp lỗi gần nhất (tùy chọn).
  final String? error;

  factory SavedStory.fromJson(Map<String, dynamic> json) {
    return SavedStory(
      id: _asString(json['id']),
      title: _asString(json['title']),
      status: storyStatusFromString(json['status']),
      createdAt: _asString(json['createdAt']),
      updatedAt: _asString(json['updatedAt']),
      completedAt: json['completedAt'] is String
          ? json['completedAt'] as String
          : null,
      chapterCount: _asInt(json['chapterCount']),
      canResume: json['canResume'] is bool ? json['canResume'] as bool : null,
      error: json['error'] is String ? json['error'] as String : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'status': storyStatusToString(status),
    'createdAt': createdAt,
    'updatedAt': updatedAt,
    if (completedAt != null) 'completedAt': completedAt,
    'chapterCount': chapterCount,
    if (canResume != null) 'canResume': canResume,
    if (error != null) 'error': error,
  };
}

/// Chi tiết một truyện: [SavedStory] kèm nội dung đầy đủ.
///
/// Tương ứng `GET /stories/:id`. `storyPayload` được chuẩn hóa qua
/// [StoryPayload.fromJson]; `relationshipGraph` ở mức truyện được chuẩn hóa qua
/// [normalizeRelationshipGraph] (dùng khi payload chưa có graph).
class StoryDetail extends SavedStory {
  const StoryDetail({
    required super.id,
    required super.title,
    required super.status,
    required super.createdAt,
    required super.updatedAt,
    super.completedAt,
    required super.chapterCount,
    super.canResume,
    super.error,
    this.storyPayload,
    this.relationshipGraph,
  });

  final StoryPayload? storyPayload;
  final RelationshipGraph? relationshipGraph;

  factory StoryDetail.fromJson(Map<String, dynamic> json) {
    final base = SavedStory.fromJson(json);
    final rawPayload = json['storyPayload'];
    final storyPayload = rawPayload is Map
        ? StoryPayload.fromJson(Map<String, dynamic>.from(rawPayload))
        : null;
    final relationshipGraph = normalizeRelationshipGraph(
      json['relationshipGraph'] ?? storyPayload?.relationshipGraph?.toJson(),
    );

    return StoryDetail(
      id: base.id,
      title: base.title,
      status: base.status,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      completedAt: base.completedAt,
      chapterCount: base.chapterCount,
      canResume: base.canResume,
      error: base.error,
      storyPayload: storyPayload,
      relationshipGraph: relationshipGraph,
    );
  }
}

String _asString(Object? value) => value is String ? value : '';

int _asInt(Object? value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  return 0;
}
