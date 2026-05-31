import 'account.dart';
import 'story.dart';

/// Chuyển một chuỗi `status` thô thành [StoryStatus].
///
/// Mặc định về [StoryStatus.queued] nếu giá trị không hợp lệ, để an toàn trước
/// dữ liệu lạ từ API.
StoryStatus _statusFromString(Object? raw) {
  for (final status in StoryStatus.values) {
    if (status.name == raw) return status;
  }
  return StoryStatus.queued;
}

/// Kết quả của `POST /stories` khi tạo bản thảo thành công (HTTP 201).
///
/// Backend trả `{ storyId, status, quota }` (Req 5.1, 7.4).
class CreateStoryResult {
  const CreateStoryResult({
    required this.storyId,
    required this.status,
    required this.quota,
  });

  /// Mã định danh truyện vừa tạo, dùng để mở luồng SSE.
  final String storyId;

  /// Trạng thái khởi tạo của truyện (thường `queued`).
  final StoryStatus status;

  /// Hạn mức truyện cập nhật sau khi tiêu thụ một lượt tạo.
  final Quota quota;

  factory CreateStoryResult.fromJson(Map<String, dynamic> json) {
    return CreateStoryResult(
      storyId: json['storyId'] as String,
      status: _statusFromString(json['status']),
      quota: Quota.fromJson(json['quota'] as Map<String, dynamic>),
    );
  }
}

/// Kết quả của `POST /stories/:id/resume` khi yêu cầu viết tiếp thành công
/// (HTTP 200).
///
/// Backend trả `{ storyId, status }` (Req 9.3).
class ResumeResult {
  const ResumeResult({required this.storyId, required this.status});

  /// Mã định danh truyện được viết tiếp.
  final String storyId;

  /// Trạng thái truyện sau khi yêu cầu viết tiếp (thường `queued`/`running`).
  final StoryStatus status;

  factory ResumeResult.fromJson(Map<String, dynamic> json) {
    return ResumeResult(
      storyId: json['storyId'] as String,
      status: _statusFromString(json['status']),
    );
  }
}
