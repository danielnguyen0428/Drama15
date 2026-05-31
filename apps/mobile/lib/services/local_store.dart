import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Lưu trữ cục bộ key-value dạng JSON, bọc `shared_preferences` (Req 12.1, 12.3).
///
/// `LocalStore` là **tầng transport thuần**: nó chỉ đọc/ghi các `Map<String,
/// dynamic>` (JSON) theo khóa, **không** biết gì về model [ReadingSettings] hay
/// [ReadingPosition]. Việc (de)serialize model là trách nhiệm của
/// `ReadingRepository` (task 4.8) — nhờ vậy `LocalStore` tách bạch khỏi model
/// và dễ kiểm thử độc lập.
///
/// Hai nhóm dữ liệu được lưu:
/// - [settingsKey] (`reading_settings`): thiết lập đọc **toàn cục** cho App.
/// - `reading_position:<storyId>` (xem [positionKey]): vị trí đọc **theo từng
///   truyện**.
///
/// ## Khả năng kiểm thử
///
/// Constructor cho phép **tiêm** sẵn một [SharedPreferences] để test dùng
/// store in-memory:
///
/// ```dart
/// SharedPreferences.setMockInitialValues(<String, Object>{});
/// final prefs = await SharedPreferences.getInstance();
/// final store = LocalStore(preferences: prefs);
/// ```
///
/// Hoặc đơn giản hơn, sau khi gọi [SharedPreferences.setMockInitialValues],
/// dùng `LocalStore()` trực tiếp — instance sẽ được lấy lười (lazy) qua
/// [SharedPreferences.getInstance]. Đây là nền tảng cho các property test khứ
/// hồi ở task 4.9/4.10 (Req 12.5, 12.6).
class LocalStore {
  /// Tạo một `LocalStore`.
  ///
  /// Nếu [preferences] được cung cấp, store dùng ngay instance đó (tiện cho
  /// test in-memory). Nếu không, instance được lấy lười qua
  /// [SharedPreferences.getInstance] ở lần truy cập đầu tiên và được nhớ lại.
  LocalStore({SharedPreferences? preferences}) : _preferences = preferences;

  /// Khóa lưu [ReadingSettings] toàn cục (Req 12.1, 12.2).
  static const String settingsKey = 'reading_settings';

  /// Tiền tố khóa cho vị trí đọc theo từng truyện.
  static const String positionKeyPrefix = 'reading_position:';

  /// Khóa lưu [ReadingPosition] cho truyện [storyId] (Req 12.3, 12.4).
  static String positionKey(String storyId) => '$positionKeyPrefix$storyId';

  SharedPreferences? _preferences;
  Future<SharedPreferences>? _pending;

  /// Lấy (và nhớ lại) instance [SharedPreferences].
  ///
  /// Đảm bảo chỉ gọi [SharedPreferences.getInstance] một lần ngay cả khi nhiều
  /// thao tác đọc/ghi được phát song song.
  Future<SharedPreferences> _prefs() async {
    final existing = _preferences;
    if (existing != null) {
      return existing;
    }
    final pending = _pending ??= SharedPreferences.getInstance();
    final resolved = await pending;
    _preferences = resolved;
    return resolved;
  }

  /// Đọc JSON đã lưu theo [key]; trả `null` nếu chưa có hoặc dữ liệu hỏng.
  ///
  /// Bọc [jsonDecode] trong `try/catch` để an toàn trước dữ liệu cũ/hỏng: một
  /// chuỗi không phải JSON hợp lệ (hoặc không phải object) sẽ trả `null` thay
  /// vì ném lỗi.
  Future<Map<String, dynamic>?> _readJson(String key) async {
    final prefs = await _prefs();
    final raw = prefs.getString(key);
    if (raw == null) {
      return null;
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
      return null;
    } on FormatException {
      return null;
    }
  }

  /// Ghi [json] dưới dạng chuỗi JSON theo [key].
  Future<void> _writeJson(String key, Map<String, dynamic> json) async {
    final prefs = await _prefs();
    await prefs.setString(key, jsonEncode(json));
  }

  /// Đọc JSON thiết lập đọc toàn cục; `null` nếu chưa lưu (Req 12.2).
  Future<Map<String, dynamic>?> readSettings() => _readJson(settingsKey);

  /// Ghi JSON thiết lập đọc toàn cục (Req 12.1).
  Future<void> writeSettings(Map<String, dynamic> json) =>
      _writeJson(settingsKey, json);

  /// Đọc JSON vị trí đọc của truyện [storyId]; `null` nếu chưa lưu (Req 12.4,
  /// 12.7).
  Future<Map<String, dynamic>?> readPosition(String storyId) =>
      _readJson(positionKey(storyId));

  /// Ghi JSON vị trí đọc của truyện [storyId] (Req 12.3).
  Future<void> writePosition(String storyId, Map<String, dynamic> json) =>
      _writeJson(positionKey(storyId), json);
}

/// Cung cấp một [LocalStore] dùng chung cho toàn App.
///
/// `ReadingRepository` (task 4.8) đọc provider này để (de)serialize
/// [ReadingSettings]/[ReadingPosition]. Trong test có thể override bằng
/// `ProviderScope(overrides: [localStoreProvider.overrideWithValue(...)])`
/// sau khi gọi [SharedPreferences.setMockInitialValues].
final localStoreProvider = Provider<LocalStore>((ref) {
  return LocalStore();
});
