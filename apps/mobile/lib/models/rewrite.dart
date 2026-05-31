// The RewriteMode enum values intentionally use snake_case so that
// `RewriteMode.name` matches the API `mode` strings (REWRITE_MODES) exactly.
// ignore_for_file: constant_identifier_names
import 'relationship_graph.dart';
import 'story_payload.dart';

/// Các chế độ viết lại chương.
///
/// Khớp 1-1 với `REWRITE_MODES` của bản web
/// (`apps/web/src/story/StoryWorkspace.tsx`) và tập `mode` mà backend chấp nhận
/// ở `POST /stories/:id/rewrite` (Req 10.2).
enum RewriteMode {
  full_chapter,
  opening_hook,
  closing_beat,
  dialogue_tone,
  class_humiliation,
  retaliation_sharpness,
}

/// Nhãn tiếng Việt cho từng [RewriteMode], khớp đúng `REWRITE_MODES` của web.
String rewriteModeLabel(RewriteMode mode) {
  switch (mode) {
    case RewriteMode.full_chapter:
      return 'Viết lại toàn chương';
    case RewriteMode.opening_hook:
      return 'Móc mở đầu';
    case RewriteMode.closing_beat:
      return 'Nhịp kết chương';
    case RewriteMode.dialogue_tone:
      return 'Giọng thoại';
    case RewriteMode.class_humiliation:
      return 'Cảm giác bị hạ thấp';
    case RewriteMode.retaliation_sharpness:
      return 'Độ sắc của phản đòn';
  }
}

/// Chuyển một chuỗi `mode` thô thành [RewriteMode]; `null` nếu không hợp lệ.
RewriteMode? rewriteModeFromString(Object? raw) {
  if (raw is! String) return null;
  for (final mode in RewriteMode.values) {
    if (mode.name == raw) return mode;
  }
  return null;
}

/// Thân yêu cầu gửi tới `POST /stories/:id/rewrite` (Req 10.3).
class RewriteRequest {
  const RewriteRequest({
    required this.chapterIndex,
    required this.mode,
    required this.instruction,
  });

  /// Chỉ số chương cần viết lại (`index` phía client).
  final int chapterIndex;

  /// Chế độ viết lại (giá trị `name` của [RewriteMode]).
  final String mode;

  /// Hướng dẫn viết lại của người dùng (không rỗng — Req 10.5).
  final String instruction;

  Map<String, dynamic> toJson() => {
    'chapterIndex': chapterIndex,
    'mode': mode,
    'instruction': instruction,
  };
}

/// Kết quả trả về từ `POST /stories/:id/rewrite` (Req 10.4).
///
/// Backend trả `{ chapter, storyPayload, relationshipGraph }`.
class RewriteResult {
  const RewriteResult({
    required this.chapter,
    this.storyPayload,
    this.relationshipGraph,
  });

  /// Chương đã được viết lại (đã chuẩn hóa về `index/title/content`).
  final Chapter chapter;

  /// Toàn bộ payload truyện cập nhật (tùy chọn).
  final StoryPayload? storyPayload;

  /// Đồ thị quan hệ nhân vật cập nhật (tùy chọn).
  final RelationshipGraph? relationshipGraph;

  factory RewriteResult.fromJson(Map<String, dynamic> json) {
    final rawChapter = json['chapter'];
    final rawPayload = json['storyPayload'];
    final rawGraph = json['relationshipGraph'];
    return RewriteResult(
      chapter: Chapter.fromJson(rawChapter as Map<String, dynamic>),
      storyPayload: rawPayload is Map<String, dynamic>
          ? StoryPayload.fromJson(rawPayload)
          : null,
      relationshipGraph: rawGraph is Map<String, dynamic>
          ? normalizeRelationshipGraph(rawGraph)
          : null,
    );
  }
}
