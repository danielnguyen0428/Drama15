/// Mô hình nội dung truyện trả về từ API và hàm chuẩn hóa chương.
///
/// Ánh xạ 1-1 với `StoryPayload` của backend. Lưu ý quan trọng về tương thích
/// (giống `resultFromPayload`/`toClientChapter` của web): trong payload gốc của
/// server, mỗi chương dùng khóa `chapterNumber`/`text`; client luôn làm việc với
/// dạng `{ index, title, content }`. Khi đọc `GET /stories/:id` (trả payload
/// gốc), [StoryPayload.fromJson] chuẩn hóa `chapterNumber → index`,
/// `text → content` để thống nhất với luồng SSE (Req 5.4–5.7, 11.1).
library;

import 'relationship_graph.dart';

/// Phần "Ý tưởng" (concept) của truyện.
class Concept {
  const Concept({
    required this.logline,
    required this.promise,
    required this.conflictEngine,
  });

  final String logline;
  final String promise;
  final String conflictEngine;

  factory Concept.fromJson(Map<String, dynamic> json) {
    return Concept(
      logline: _asString(json['logline']),
      promise: _asString(json['promise']),
      conflictEngine: _asString(json['conflictEngine']),
    );
  }

  Map<String, dynamic> toJson() => {
    'logline': logline,
    'promise': promise,
    'conflictEngine': conflictEngine,
  };
}

/// Một mục trong dàn ý chương ("Dàn ý").
class ChapterPlanItem {
  const ChapterPlanItem({
    required this.chapterNumber,
    required this.title,
    required this.mainBeat,
    required this.hook,
    required this.endingBeat,
  });

  final int chapterNumber;
  final String title;
  final String mainBeat;
  final String hook;
  final String endingBeat;

  factory ChapterPlanItem.fromJson(Map<String, dynamic> json) {
    return ChapterPlanItem(
      chapterNumber: _asInt(json['chapterNumber']),
      title: _asString(json['title']),
      mainBeat: _asString(json['mainBeat']),
      hook: _asString(json['hook']),
      endingBeat: _asString(json['endingBeat']),
    );
  }

  Map<String, dynamic> toJson() => {
    'chapterNumber': chapterNumber,
    'title': title,
    'mainBeat': mainBeat,
    'hook': hook,
    'endingBeat': endingBeat,
  };
}

/// Một chương ở dạng phía client (`index`/`title`/`content`).
///
/// Đây là dạng thống nhất dùng xuyên suốt app — cả khi nhận từ SSE (server đã
/// chuyển đổi qua `toClientChapter`) lẫn khi chuẩn hóa từ payload gốc.
class Chapter {
  const Chapter({required this.index, this.title, required this.content});

  /// Bằng `chapterNumber` phía server.
  final int index;
  final String? title;

  /// Nội dung chương (bằng `text` phía server).
  final String content;

  /// `true` khi chương chưa có nội dung (sau khi cắt khoảng trắng).
  bool get isEmpty => content.trim().isEmpty;

  /// Tạo [Chapter] từ JSON dạng client SSE: `{ index, title, content }`.
  factory Chapter.fromJson(Map<String, dynamic> json) {
    return Chapter(
      index: _asInt(json['index']),
      title: json['title'] is String ? json['title'] as String : null,
      content: _asString(json['content']),
    );
  }

  /// Tạo [Chapter] từ payload gốc của server: `{ chapterNumber, title, text }`.
  ///
  /// Tái hiện ánh xạ `toClientChapter`/`resultFromPayload`:
  /// `chapterNumber → index`, `text → content`.
  factory Chapter.fromServerJson(Map<String, dynamic> json) {
    return Chapter(
      index: _asInt(json['chapterNumber']),
      title: json['title'] is String ? json['title'] as String : null,
      content: _asString(json['text']),
    );
  }

  Map<String, dynamic> toJson() => {
    'index': index,
    if (title != null) 'title': title,
    'content': content,
  };
}

/// Toàn bộ nội dung truyện hiển thị qua các thẻ (Chương / Ý tưởng / Dàn ý /
/// Hồ sơ / Quan hệ).
class StoryPayload {
  const StoryPayload({
    required this.title,
    required this.concept,
    required this.storyBible,
    required this.chapterPlan,
    required this.chapters,
    this.relationshipGraph,
  });

  final String title;
  final Concept concept;

  /// "Hồ sơ" (story bible) — hiển thị dạng JSON đã format; giữ kiểu động.
  final dynamic storyBible;
  final List<ChapterPlanItem> chapterPlan;

  /// Danh sách chương đã chuẩn hóa, sắp theo `index` tăng dần. Có thể chưa đủ
  /// 15 chương khi truyện đang chạy.
  final List<Chapter> chapters;
  final RelationshipGraph? relationshipGraph;

  /// Chuẩn hóa payload gốc từ `GET /stories/:id` (`{ story: { storyPayload } }`
  /// → truyền vào `storyPayload`).
  ///
  /// Chương được chuyển từ `{ chapterNumber, text }` sang `{ index, content }`
  /// và sắp theo `index` tăng dần để thống nhất với luồng SSE (giống
  /// `resultFromPayload`).
  factory StoryPayload.fromJson(Map<String, dynamic> json) {
    final rawChapterPlan = json['chapterPlan'];
    final chapterPlan = rawChapterPlan is List
        ? rawChapterPlan
              .whereType<Map>()
              .map(
                (item) =>
                    ChapterPlanItem.fromJson(Map<String, dynamic>.from(item)),
              )
              .toList()
        : <ChapterPlanItem>[];

    final rawChapters = json['chapters'];
    final chapters = rawChapters is List
        ? rawChapters
              .whereType<Map>()
              .map(
                (item) =>
                    Chapter.fromServerJson(Map<String, dynamic>.from(item)),
              )
              .toList()
        : <Chapter>[];
    chapters.sort((a, b) => a.index.compareTo(b.index));

    final rawConcept = json['concept'];
    final concept = rawConcept is Map
        ? Concept.fromJson(Map<String, dynamic>.from(rawConcept))
        : const Concept(logline: '', promise: '', conflictEngine: '');

    return StoryPayload(
      title: _asString(json['title']),
      concept: concept,
      storyBible: json['storyBible'],
      chapterPlan: chapterPlan,
      chapters: chapters,
      relationshipGraph: normalizeRelationshipGraph(json['relationshipGraph']),
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
