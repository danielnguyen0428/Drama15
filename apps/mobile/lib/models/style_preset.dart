import 'story_config.dart';

/// Một giọng kể (`stylePreset`) trả về từ `GET /story/style-presets` (Req 3.4).
///
/// Ánh xạ 1-1 phần tử trong `{ presets: [...] }` của API: mỗi phần tử có `id`,
/// `displayName`, `description`.
class StylePreset {
  const StylePreset({
    required this.id,
    required this.displayName,
    this.description = '',
  });

  /// Id giọng kể, dùng làm `StoryConfig.stylePreset`.
  final String id;

  /// Tên hiển thị trong danh sách "Giọng kể".
  final String displayName;

  /// Mô tả ngắn (có thể rỗng).
  final String description;

  /// Giọng kể mặc định dự phòng khi không nạp được danh sách preset (Req 3.5).
  static const StylePreset fallback = StylePreset(
    id: kDefaultStylePreset,
    displayName: 'Cố Mạn - ấm áp hiện đại',
    description: '',
  );

  /// Phân tích từ JSON; khóa thiếu được điền chuỗi rỗng để an toàn.
  factory StylePreset.fromJson(Map<String, dynamic> json) {
    return StylePreset(
      id: (json['id'] as String?) ?? '',
      displayName: (json['displayName'] as String?) ?? '',
      description: (json['description'] as String?) ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'id': id,
      'displayName': displayName,
      'description': description,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is StylePreset &&
        other.id == id &&
        other.displayName == displayName &&
        other.description == description;
  }

  @override
  int get hashCode => Object.hash(id, displayName, description);
}
