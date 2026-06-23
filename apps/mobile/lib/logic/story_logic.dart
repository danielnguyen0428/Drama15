/// Logic truyện thuần (pure functions), tách khỏi tầng transport/UI để dễ
/// unit/property test (Req 9.1, 6.5, 5.8, 13.1, 13.2, 13.3).
///
/// Các hàm ở đây tái hiện **chính xác** hành vi của bản web
/// (`apps/web/src/story/storyViewModel.ts` và `StoryWorkspace.tsx`) để bảo đảm
/// tương thích tuyệt đối:
/// - [canResumeStory] khớp `canResumeStory` của `storyViewModel.ts`.
/// - [buildStoryMarkdown] khớp `resultFromPayload` + `buildMarkdown` của
///   `StoryWorkspace.tsx`.
/// - [upsertChapterByIndex] bảo đảm tính lũy đẳng (idempotent) khi nạp lại cùng
///   tập sự kiện chương qua SSE.
library;

import '../models/story.dart';
import '../models/story_payload.dart';

/// Số chương cố định của một bản thảo Drama 15 hoàn chỉnh.
///
/// Khớp `TOTAL_CHAPTERS = 15` trong `apps/web/src/story/storyViewModel.ts`.
const int totalChapters = 15;

/// Alias hằng số theo đúng tên trong đặc tả/thiết kế (`TOTAL_CHAPTERS`).
// ignore: constant_identifier_names
const int TOTAL_CHAPTERS = totalChapters;

/// Nhan đề dự phòng khi truyện chưa được đặt tên (khớp web).
const String _untitledStory = 'Truyện chưa đặt tên';

/// Vị từ "có thể viết tiếp truyện" (Req 9.1).
///
/// Ánh xạ chính xác hàm web:
/// ```ts
/// story.status !== 'completed' &&
///   (story.canResume === true ||
///     (story.chapterCount > 0 && story.chapterCount < TOTAL_CHAPTERS))
/// ```
///
/// Lưu ý: `canResume` là `bool?`; phép so sánh `== true` xử lý đúng cả `null`
/// và `false` (chỉ `true` mới thỏa), tương đương `=== true` của web.
bool canResumeStory(SavedStory story) {
  return story.status != StoryStatus.completed &&
      (story.canResume == true ||
          (story.chapterCount > 0 && story.chapterCount < TOTAL_CHAPTERS));
}

/// Thêm hoặc cập nhật một chương theo `index`, trả về danh sách **mới** đã sắp
/// theo `index` tăng dần (Req 6.5, 5.8).
///
/// Hành vi: loại bỏ mọi chương có cùng `index` với [next] trong [existing], chèn
/// [next] vào, rồi sắp xếp tăng dần theo `index`. Hàm **thuần**: không thay đổi
/// danh sách [existing] đầu vào.
///
/// Tính lũy đẳng (idempotent): áp dụng cùng một [next] nhiều lần cho ra cùng kết
/// quả (mỗi `index` xuất hiện đúng một lần, nội dung là của lần áp dụng cuối) —
/// bảo đảm nạp lại cùng tập sự kiện `chapter` không làm nhân đôi chương.
List<Chapter> upsertChapterByIndex(List<Chapter> existing, Chapter next) {
  final result = existing.where((c) => c.index != next.index).toList();
  result.add(next);
  result.sort((a, b) => a.index.compareTo(b.index));
  return result;
}

/// Dựng nội dung Markdown của toàn bộ bản thảo (Req 13.2, 13.3).
///
/// Khớp `buildMarkdown(title, resultFromPayload(payload))` của web:
/// 1. Tiêu đề `# {title}` (dùng [_untitledStory] khi [title] rỗng).
/// 2. `## Ý tưởng` kèm phần "concept" được dựng lại từ [StoryPayload.concept]
///    theo đúng định dạng `resultFromPayload` (luôn có nhãn nên luôn xuất hiện).
/// 3. `## Dàn ý` kèm phần "plan" dựng từ [StoryPayload.chapterPlan] (bỏ qua nếu
///    dàn ý rỗng).
/// 4. Mỗi chương `## Chương {index}: {title}` + nội dung đã `trim`, theo thứ tự
///    `index` **tăng dần** (Req 13.3).
///
/// Các phần ghép bằng `\n\n`, kết thúc bằng một ký tự xuống dòng (khớp web).
String buildStoryMarkdown(String title, StoryPayload payload) {
  final parts = <String>['# ${title.isEmpty ? _untitledStory : title}'];

  final concept = _conceptText(payload);
  if (concept.isNotEmpty) {
    parts
      ..add('## Ý tưởng')
      ..add(concept);
  }

  final plan = _planText(payload);
  if (plan.isNotEmpty) {
    parts
      ..add('## Dàn ý')
      ..add(plan);
  }

  final chapters = [...payload.chapters]
    ..sort((a, b) => a.index.compareTo(b.index));
  for (final chapter in chapters) {
    parts
      ..add('## Chương ${chapter.index}: ${chapter.title ?? ''}'.trim())
      ..add(chapter.content.trim());
  }

  return '${parts.join('\n\n')}\n';
}

/// Dựng văn bản chia sẻ cho một chương đơn lẻ (Req 13.1).
///
/// Ghép nhan đề truyện ([title], dùng [_untitledStory] khi rỗng), tiêu đề chương
/// (`Chương {index}: {title}`) và nội dung chương đã `trim`, phân tách bằng
/// `\n\n`. Định dạng nhất quán với từng mục chương trong [buildStoryMarkdown]
/// nhưng kèm nhan đề truyện ở đầu để chia sẻ độc lập.
String buildChapterShareText(String title, Chapter chapter) {
  final storyTitle = title.isEmpty ? _untitledStory : title;
  final heading = 'Chương ${chapter.index}: ${chapter.title ?? ''}'.trim();
  return [storyTitle, heading, chapter.content.trim()].join('\n\n');
}

/// Dựng phần "Ý tưởng" (concept) từ [StoryPayload], khớp `resultFromPayload`.
///
/// Luôn trả về chuỗi không rỗng vì các nhãn (`Nhan đề:`, ...) luôn hiện diện.
String _conceptText(StoryPayload payload) {
  final concept = payload.concept;
  return [
    'Nhan đề: ${payload.title}',
    'Tóm tắt một câu: ${concept.logline}',
    'Lời hứa thể loại: ${concept.promise}',
    'Xung đột: ${concept.conflictEngine}',
  ].join('\n');
}

/// Dựng phần "Dàn ý" (plan) từ [StoryPayload.chapterPlan], khớp
/// `resultFromPayload`. Trả về chuỗi rỗng khi không có mục dàn ý nào.
String _planText(StoryPayload payload) {
  return payload.chapterPlan
      .map(
        (item) => [
          '${item.chapterNumber}. ${item.title}',
          'Nhịp chính: ${item.mainBeat}',
          'Móc câu: ${item.hook}',
          'Kết chương: ${item.endingBeat}',
        ].join('\n'),
      )
      .join('\n\n');
}
