/// Repository truyện: bọc các endpoint REST của backend (Req 2.4, 3.4, 4, 5, 8,
/// 9, 10). Logic thuần (canResumeStory, buildStoryMarkdown, buildChapterShareText,
/// upsertChapterByIndex) đặt ở `logic/story_logic.dart` để dễ property test.
library;

import '../models/account.dart';
import '../models/results.dart';
import '../models/rewrite.dart';
import '../models/setup_suggestion.dart';
import '../models/story.dart';
import '../models/story_config.dart';
import '../models/style_preset.dart';
import '../services/api_client.dart';

/// Bọc [ApiClient] và ánh xạ phản hồi JSON sang model.
class StoryRepository {
  StoryRepository(this._api);

  final ApiClient _api;

  /// `GET /story/style-presets` → danh sách giọng kể (Req 3.4).
  Future<ApiResponse<List<StylePreset>>> getStylePresets() {
    return _api.get<List<StylePreset>>(
      '/story/style-presets',
      authRequired: false,
      decode: (json) => _decodeList(json, 'presets', StylePreset.fromJson),
    );
  }

  /// `GET /auth/me` → hồ sơ + hạn mức (Req 2.4, 7.5).
  Future<ApiResponse<AccountSnapshot>> getAuthMe() {
    return _api.get<AccountSnapshot>(
      '/auth/me',
      decode: (json) => AccountSnapshot.fromJson(_asMap(json)),
    );
  }

  /// `POST /story/setup-suggest` → gợi ý kịch bản (Req 4.1, 4.2).
  Future<ApiResponse<SetupSuggestion>> setupSuggest(StoryConfig config) {
    return _api.post<SetupSuggestion>(
      '/story/setup-suggest',
      body: config.toJson(),
      decode: (json) => SetupSuggestion.fromJson(_asMap(json)),
    );
  }

  /// `GET /stories` → tủ truyện (Req 8.1).
  Future<ApiResponse<List<SavedStory>>> listStories() {
    return _api.get<List<SavedStory>>(
      '/stories',
      decode: (json) => _decodeList(json, 'stories', SavedStory.fromJson),
    );
  }

  /// `POST /stories` → tạo bản thảo (Req 5.1, 7.4).
  Future<ApiResponse<CreateStoryResult>> createStory(StoryConfig config) {
    return _api.post<CreateStoryResult>(
      '/stories',
      body: config.toJson(),
      decode: (json) => CreateStoryResult.fromJson(_asMap(json)),
    );
  }

  /// `GET /stories/:id` → chi tiết truyện (Req 8.3, 9.3).
  Future<ApiResponse<StoryDetail>> getStory(String id) {
    return _api.get<StoryDetail>(
      '/stories/$id',
      decode: (json) => StoryDetail.fromJson(_storyObject(json)),
    );
  }

  /// `POST /stories/:id/resume` → viết tiếp (Req 9.3–9.5).
  Future<ApiResponse<ResumeResult>> resumeStory(String id) {
    return _api.post<ResumeResult>(
      '/stories/$id/resume',
      decode: (json) => ResumeResult.fromJson(_asMap(json)),
    );
  }

  /// `POST /stories/:id/rewrite` → viết lại chương (Req 10.3, 10.4).
  Future<ApiResponse<RewriteResult>> rewriteChapter(
    String id,
    RewriteRequest request,
  ) {
    return _api.post<RewriteResult>(
      '/stories/$id/rewrite',
      body: request.toJson(),
      decode: (json) => RewriteResult.fromJson(_asMap(json)),
    );
  }

  /// `PATCH /stories/:id` → đổi tên (Req 8.4).
  Future<ApiResponse<SavedStory>> renameStory(String id, String title) {
    return _api.patch<SavedStory>(
      '/stories/$id',
      body: <String, dynamic>{'title': title},
      decode: (json) => SavedStory.fromJson(_storyObject(json)),
    );
  }

  /// `DELETE /stories/:id` → xóa truyện (Req 8.5).
  Future<ApiResponse<void>> deleteStory(String id) {
    return _api.delete('/stories/$id');
  }

  // --- Helpers giải mã ---

  static Map<String, dynamic> _asMap(dynamic json) =>
      json is Map ? Map<String, dynamic>.from(json) : <String, dynamic>{};

  /// Lấy object `story` từ phản hồi `{ story: {...} }`; nếu không có thì dùng
  /// chính object gốc.
  static Map<String, dynamic> _storyObject(dynamic json) {
    final map = _asMap(json);
    final story = map['story'];
    return story is Map ? Map<String, dynamic>.from(story) : map;
  }

  /// Giải mã danh sách từ `{ <key>: [...] }` (hoặc mảng gốc) qua [fromJson].
  static List<T> _decodeList<T>(
    dynamic json,
    String key,
    T Function(Map<String, dynamic>) fromJson,
  ) {
    final raw = json is Map ? json[key] : json;
    if (raw is! List) {
      return <T>[];
    }
    return raw
        .whereType<Map>()
        .map((item) => fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }
}
