/// Mô hình hạn mức (`Story_Quota` / `Setup_Suggestion_Quota` — Req 7).
///
/// Ánh xạ kiểu `Quota` của bản web (`{ usageDate, used, limit, remaining }`);
/// client chỉ cần `remaining`/`limit` để hiển thị (Req 7.1). Getter [display]
/// sinh chuỗi đúng định dạng "còn {remaining}/{limit}" — tâm điểm của thuộc
/// tính P11 (Req 7.1) kiểm chứng ở tác vụ 2.9.
library;

/// Một ảnh chụp hạn mức trong ngày: số lượt còn lại trên tổng giới hạn.
class QuotaSnapshot {
  const QuotaSnapshot({required this.remaining, required this.limit});

  /// Số lượt còn lại trong ngày.
  final int remaining;

  /// Tổng giới hạn trong ngày theo gói.
  final int limit;

  /// Chuỗi hiển thị hạn mức truyện theo định dạng "còn {remaining}/{limit}"
  /// (Req 7.1).
  String get display => 'còn $remaining/$limit';

  /// Dựng từ JSON của API (`{ remaining, limit, ... }`); khóa thiếu → 0.
  factory QuotaSnapshot.fromJson(Map<String, dynamic> json) {
    return QuotaSnapshot(
      remaining: _asInt(json['remaining']),
      limit: _asInt(json['limit']),
    );
  }

  Map<String, dynamic> toJson() => {'remaining': remaining, 'limit': limit};

  @override
  bool operator ==(Object other) =>
      other is QuotaSnapshot &&
      other.remaining == remaining &&
      other.limit == limit;

  @override
  int get hashCode => Object.hash(remaining, limit);

  @override
  String toString() => 'QuotaSnapshot(remaining: $remaining, limit: $limit)';
}

int _asInt(Object? value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  return 0;
}
