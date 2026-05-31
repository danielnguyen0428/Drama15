import 'story_payload.dart';

/// Các giai đoạn (stage) hợp lệ của luồng sinh truyện qua SSE.
///
/// Khớp 1-1 với `StreamPayload.stage` của backend Fastify
/// (`apps/api/src/startDev.ts`): `progress | overview | bible | plan |
/// relationshipGraph | chapter | done | error`.
enum StreamStage {
  progress,
  overview,
  bible,
  plan,
  relationshipGraph,
  chapter,
  done,
  error,
}

/// Chuyển một chuỗi `stage` thô từ JSON thành [StreamStage].
///
/// Trả về `null` nếu chuỗi không thuộc tập giá trị hợp lệ (Req 6.2, 6.4).
/// `SseParser` dùng hàm này để loại bỏ các sự kiện có `stage` lạ mà không
/// làm dừng luồng.
StreamStage? streamStageFromString(Object? raw) {
  if (raw is! String) return null;
  for (final stage in StreamStage.values) {
    if (stage.name == raw) return stage;
  }
  return null;
}

/// Một sự kiện sinh truyện đã được phân tích từ khung `data:` của SSE.
///
/// `stage` luôn hợp lệ — các sự kiện có `stage` lạ đã bị `SseParser` loại bỏ
/// trước khi dựng [StreamEvent]. Các trường còn lại là tùy theo loại sự kiện
/// (chỉ một số trường có giá trị tùy `stage`).
class StreamEvent {
  const StreamEvent({
    required this.stage,
    this.title,
    this.concept,
    this.bible,
    this.relationshipGraph,
    this.plan,
    this.chapter,
    this.label,
    this.detail,
    this.current,
    this.total,
    this.error,
  });

  /// Giai đoạn của sự kiện (luôn hợp lệ).
  final StreamStage stage;

  /// Nhan đề truyện — có ở sự kiện `overview` và `done`.
  final String? title;

  /// Phần "Ý tưởng" đã định dạng — có ở sự kiện `overview`.
  final String? concept;

  /// Nội dung "Hồ sơ" (story bible) thô — có ở sự kiện `bible`.
  /// Giữ ở dạng `dynamic` để reducer định dạng/hiển thị sau.
  final dynamic bible;

  /// Đồ thị quan hệ nhân vật thô — có ở sự kiện `relationshipGraph`.
  /// Giữ ở dạng `dynamic`; sẽ được chuẩn hóa ở tầng reducer.
  final dynamic relationshipGraph;

  /// "Dàn ý" chương đã định dạng — có ở sự kiện `plan`.
  final String? plan;

  /// Chương vừa sinh — có ở sự kiện `chapter`.
  final Chapter? chapter;

  /// Nhãn tiến độ — có ở sự kiện `progress`.
  final String? label;

  /// Mô tả chi tiết tiến độ — có ở sự kiện `progress` (ưu tiên hơn [label]).
  final String? detail;

  /// Bước hiện tại của tiến độ — có ở sự kiện `progress`.
  final int? current;

  /// Tổng số bước của tiến độ — có ở sự kiện `progress`.
  final int? total;

  /// Thông điệp lỗi — có ở sự kiện `error`.
  final String? error;

  /// Phân tích một map JSON thành [StreamEvent].
  ///
  /// Ném [FormatException] nếu `stage` thiếu hoặc không hợp lệ. `SseParser`
  /// nên gọi [streamStageFromString] trước để loại sớm các sự kiện không hợp lệ
  /// (Req 6.1, 6.2, 6.4).
  factory StreamEvent.fromJson(Map<String, dynamic> json) {
    final stage = streamStageFromString(json['stage']);
    if (stage == null) {
      throw FormatException('Giá trị stage không hợp lệ: ${json['stage']}');
    }

    final rawChapter = json['chapter'];
    return StreamEvent(
      stage: stage,
      title: json['title'] as String?,
      concept: json['concept'] as String?,
      bible: json['bible'],
      relationshipGraph: json['relationshipGraph'],
      plan: json['plan'] as String?,
      chapter: rawChapter is Map<String, dynamic>
          ? Chapter.fromJson(rawChapter)
          : null,
      label: json['label'] as String?,
      detail: json['detail'] as String?,
      current: _asInt(json['current']),
      total: _asInt(json['total']),
      error: json['error'] as String?,
    );
  }

  static int? _asInt(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }
}
