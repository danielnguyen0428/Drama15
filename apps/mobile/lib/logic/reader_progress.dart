/// Hàm thuần tính tiến độ đọc (Req 11.7).
library;

/// Phần trăm tiến độ đọc của truyện, trong khoảng [0, 100].
///
/// Tính theo vị trí tuyến tính `(chapterIndex + inChapterProgress)` trên tổng số
/// chương [totalChapters]. Đơn điệu không giảm theo vị trí: vị trí "xa hơn"
/// (chương lớn hơn, hoặc cùng chương nhưng [inChapterProgress] lớn hơn) cho phần
/// trăm không nhỏ hơn. Với [totalChapters] ≤ 0 trả về 0.
double progressPercent(
  int chapterIndex,
  double inChapterProgress,
  int totalChapters,
) {
  if (totalChapters <= 0) {
    return 0;
  }
  final clampedProgress = inChapterProgress.clamp(0.0, 1.0);
  final position = chapterIndex + clampedProgress;
  final percent = position / totalChapters * 100;
  return percent.clamp(0.0, 100.0).toDouble();
}
