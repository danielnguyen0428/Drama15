import 'package:share_plus/share_plus.dart';

/// Kết quả của một thao tác chia sẻ qua share sheet của hệ điều hành (Req 13).
///
/// Ánh xạ từ [ShareResultStatus] của `share_plus`:
/// - [success]: người dùng đã chọn một hành động chia sẻ.
/// - [dismissed]: người dùng đóng share sheet mà không chia sẻ — App không
///   hiển thị lỗi (Req 13.7).
/// - [failure]: không thể mở/hoàn tất share sheet (lỗi nền tảng, ngoại lệ,
///   hoặc kết quả `unavailable`) — App hiển thị thông báo lỗi và giữ nguyên
///   màn hình hiện tại (Req 13.6).
enum ShareOutcome { success, dismissed, failure }

/// Dịch vụ mở share sheet của hệ điều hành để chia sẻ văn bản (Req 13.1, 13.2).
///
/// Được khai báo là interface trừu tượng để [ShareController] (task 6.18) và
/// các bài test (task 6.19) có thể override/mock mà không phụ thuộc vào
/// nền tảng thực.
abstract class ShareService {
  /// Mở share sheet với nội dung [text], kèm [subject] tùy chọn (dùng làm
  /// tiêu đề email khi nền tảng hỗ trợ).
  ///
  /// Trả về [ShareOutcome] phản ánh hành vi của người dùng / nền tảng.
  Future<ShareOutcome> shareText(String text, {String? subject});
}

/// Hiện thực [ShareService] dựa trên `share_plus`.
///
/// Dùng API hiện hành của `share_plus` (^13.x):
/// `SharePlus.instance.share(ShareParams(text: ..., subject: ...))` trả về
/// một [ShareResult]; ta ánh xạ [ShareResult.status] sang [ShareOutcome].
class SharePlusShareService implements ShareService {
  const SharePlusShareService();

  @override
  Future<ShareOutcome> shareText(String text, {String? subject}) async {
    try {
      final result = await SharePlus.instance.share(
        ShareParams(text: text, subject: subject),
      );
      return _mapStatus(result.status);
    } catch (_) {
      // Mọi ngoại lệ (ví dụ nền tảng không thể mở share sheet, hoặc
      // ArgumentError khi nội dung không hợp lệ) được coi là thất bại.
      return ShareOutcome.failure;
    }
  }

  /// Ánh xạ [ShareResultStatus] của `share_plus` sang [ShareOutcome].
  ///
  /// - [ShareResultStatus.success] → [ShareOutcome.success]
  /// - [ShareResultStatus.dismissed] → [ShareOutcome.dismissed]
  /// - [ShareResultStatus.unavailable] → [ShareOutcome.failure]
  static ShareOutcome _mapStatus(ShareResultStatus status) {
    switch (status) {
      case ShareResultStatus.success:
        return ShareOutcome.success;
      case ShareResultStatus.dismissed:
        return ShareOutcome.dismissed;
      case ShareResultStatus.unavailable:
        return ShareOutcome.failure;
    }
  }
}
