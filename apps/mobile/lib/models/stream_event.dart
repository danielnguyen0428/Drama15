/// Mô hình sự kiện sinh truyện qua SSE (`StreamEvent` — Req 5, 6).
///
/// [StreamEvent] là một **sealed union** phân biệt theo trường `stage`. Mỗi
/// biến thể mang đúng dữ liệu của một loại sự kiện do API phát trong lúc sinh
/// truyện. Việc phân tích khung dữ liệu thô (`data:`) và lọc `stage` lạ/JSON
/// lỗi do `SseParser.parseFrame` đảm nhiệm (tác vụ 4.3, Req 6.3, 6.4); tệp này
/// chỉ định nghĩa kiểu và cách dựng từng biến thể từ JSON đã hợp lệ.
///
/// Tên trường **bám sát wire format thực tế** của backend (xem
/// `apps/api/src/startDev.ts` và type `StreamEvent` của web trong
/// `apps/web/src/story/StoryWorkspace.tsx`) để tương thích tuyệt đối:
/// - `progress`: `{ current, total, detail, label }`
/// - `overview`: `{ title, concept }` (concept là chuỗi đã format)
/// - `bible`: `{ bible }` (đối tượng story bible, kiểu động)
/// - `plan`: `{ plan }` (dàn ý ở dạng **chuỗi** đã format)
/// - `relationshipGraph`: `{ relationshipGraph }` (đối tượng, kiểu động)
/// - `chapter`: `{ chapter: { index, title, content } }`
/// - `done`: `{ title }`
/// - `error`: `{ error }` (thông điệp lỗi)
library;

import 'story_payload.dart';

/// Tập `stage` hợp lệ mà [SseParser] chấp nhận (Req 6.2). `stage` ngoài tập này
/// bị bỏ qua mà không làm dừng luồng (Req 6.4).
const Set<String> kValidStages = <String>{
  'progress',
  'overview',
  'bible',
  'plan',
  'relationshipGraph',
  'chapter',
  'done',
  'error',
};

/// Sự kiện sinh truyện đã phân tích từ một khung SSE (union theo [stage]).
sealed class StreamEvent {
  const StreamEvent(this.stage);

  /// Giá trị `stage` (luôn thuộc [kValidStages]).
  final String stage;
}

/// `stage: progress` — cập nhật tiến độ theo `current`/`total` và nhãn (Req 5.3).
class ProgressEvent extends StreamEvent {
  const ProgressEvent({
    required this.current,
    required this.total,
    this.detail,
    this.label,
  }) : super('progress');

  final int current;
  final int total;

  /// Mô tả chi tiết bước hiện tại (ưu tiên hiển thị, Req 5.3).
  final String? detail;

  /// Nhãn ngắn của bước hiện tại (dùng khi không có [detail], Req 5.3).
  final String? label;

  factory ProgressEvent.fromJson(Map<String, dynamic> json) {
    return ProgressEvent(
      current: _asInt(json['current']),
      total: _asInt(json['total']),
      detail: json['detail'] is String ? json['detail'] as String : null,
      label: json['label'] is String ? json['label'] as String : null,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is ProgressEvent &&
      other.current == current &&
      other.total == total &&
      other.detail == detail &&
      other.label == label;

  @override
  int get hashCode => Object.hash(stage, current, total, detail, label);
}

/// `stage: overview` — nhan đề và phần "Ý tưởng" (concept) (Req 5.4).
class OverviewEvent extends StreamEvent {
  const OverviewEvent({required this.title, required this.concept})
    : super('overview');

  final String title;
  final String concept;

  factory OverviewEvent.fromJson(Map<String, dynamic> json) {
    return OverviewEvent(
      title: _asString(json['title']),
      concept: _asString(json['concept']),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is OverviewEvent &&
      other.title == title &&
      other.concept == concept;

  @override
  int get hashCode => Object.hash(stage, title, concept);
}

/// `stage: bible` — nội dung "Hồ sơ" (story bible), kiểu động (Req 5.5).
class BibleEvent extends StreamEvent {
  const BibleEvent(this.bible) : super('bible');

  /// Đối tượng story bible giữ nguyên kiểu động do API trả về.
  final dynamic bible;

  factory BibleEvent.fromJson(Map<String, dynamic> json) {
    return BibleEvent(json['bible']);
  }
}

/// `stage: plan` — "Dàn ý" chương ở dạng **chuỗi** đã format (Req 5.6).
class PlanEvent extends StreamEvent {
  const PlanEvent(this.plan) : super('plan');

  /// Dàn ý đã format thành văn bản (khớp `formatPlan` phía server).
  final String plan;

  factory PlanEvent.fromJson(Map<String, dynamic> json) {
    return PlanEvent(_asString(json['plan']));
  }

  @override
  bool operator ==(Object other) => other is PlanEvent && other.plan == plan;

  @override
  int get hashCode => Object.hash(stage, plan);
}

/// `stage: relationshipGraph` — đồ thị quan hệ nhân vật, kiểu động (Req 5.7).
class RelationshipGraphEvent extends StreamEvent {
  const RelationshipGraphEvent(this.relationshipGraph)
    : super('relationshipGraph');

  /// Đồ thị quan hệ giữ nguyên kiểu động; chuẩn hóa ở tầng hiển thị.
  final dynamic relationshipGraph;

  factory RelationshipGraphEvent.fromJson(Map<String, dynamic> json) {
    return RelationshipGraphEvent(json['relationshipGraph']);
  }
}

/// `stage: chapter` — thêm/cập nhật một chương theo `index` (Req 5.8).
class ChapterEvent extends StreamEvent {
  const ChapterEvent(this.chapter) : super('chapter');

  final Chapter chapter;

  /// Dựng từ JSON `{ chapter: { index, title, content } }` (dạng client SSE).
  factory ChapterEvent.fromJson(Map<String, dynamic> json) {
    final raw = json['chapter'];
    final map = raw is Map
        ? Map<String, dynamic>.from(raw)
        : <String, dynamic>{};
    return ChapterEvent(Chapter.fromJson(map));
  }

  @override
  bool operator ==(Object other) =>
      other is ChapterEvent && other.chapter == chapter;

  @override
  int get hashCode => Object.hash(stage, chapter);
}

/// `stage: done` — kết thúc sinh truyện (Req 5.9). Mang nhan đề cuối (tùy chọn).
class DoneEvent extends StreamEvent {
  const DoneEvent({this.title}) : super('done');

  final String? title;

  factory DoneEvent.fromJson(Map<String, dynamic> json) {
    return DoneEvent(
      title: json['title'] is String ? json['title'] as String : null,
    );
  }

  @override
  bool operator ==(Object other) => other is DoneEvent && other.title == title;

  @override
  int get hashCode => Object.hash(stage, title);
}

/// `stage: error` — lỗi trong lúc sinh truyện (Req 6.2, 15.2).
///
/// Thông điệp đọc từ khóa `error` của khung (khớp `{ stage:'error', error }`
/// phía server), dự phòng khóa `message`.
class StreamErrorEvent extends StreamEvent {
  const StreamErrorEvent({this.message}) : super('error');

  final String? message;

  factory StreamErrorEvent.fromJson(Map<String, dynamic> json) {
    final raw = json['error'] ?? json['message'];
    return StreamErrorEvent(message: raw is String ? raw : null);
  }

  @override
  bool operator ==(Object other) =>
      other is StreamErrorEvent && other.message == message;

  @override
  int get hashCode => Object.hash(stage, message);
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
