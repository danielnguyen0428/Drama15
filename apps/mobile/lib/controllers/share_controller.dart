/// Controller chia sẻ truyện/chương (Share_Module — Req 13).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/providers.dart';
import '../logic/story_logic.dart';
import '../models/story_payload.dart';
import '../services/share_service.dart';

/// Điều phối chia sẻ qua OS share sheet.
class ShareController {
  ShareController(this._share);

  final ShareService _share;

  /// Có thể chia sẻ toàn truyện khi có ≥1 chương (Req 13.4).
  bool canShareStory(StoryPayload payload) => payload.chapters.isNotEmpty;

  /// Có thể chia sẻ chương khi nội dung không rỗng (Req 13.5).
  bool canShareChapter(Chapter chapter) => chapter.content.trim().isNotEmpty;

  /// Chia sẻ một chương (Req 13.1).
  Future<ShareOutcome> shareChapter(String storyTitle, Chapter chapter) {
    if (!canShareChapter(chapter)) {
      return Future.value(ShareOutcome.failure);
    }
    return _share.shareText(
      buildChapterShareText(storyTitle, chapter),
      subject: storyTitle,
    );
  }

  /// Chia sẻ toàn truyện dưới dạng Markdown (Req 13.2, 13.3).
  Future<ShareOutcome> shareStory(String storyTitle, StoryPayload payload) {
    if (!canShareStory(payload)) {
      return Future.value(ShareOutcome.failure);
    }
    return _share.shareText(
      buildStoryMarkdown(storyTitle, payload),
      subject: storyTitle,
    );
  }
}

/// Provider cho [ShareController].
final shareControllerProvider = Provider<ShareController>((ref) {
  return ShareController(ref.watch(shareServiceProvider));
});
