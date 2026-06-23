/// Repository thiết lập/vị trí đọc, (de)serialize qua [LocalStore] (Req 12).
library;

import '../models/reading.dart';
import '../services/local_store.dart';

/// Lưu/nạp [ReadingSettings] (toàn cục) và [ReadingPosition] (theo truyện).
class ReadingRepository {
  ReadingRepository(this._store);

  final LocalStore _store;

  /// Nạp thiết lập đọc; trả về mặc định khi chưa lưu (Req 12.2).
  Future<ReadingSettings> loadSettings() async {
    final json = await _store.readSettings();
    if (json == null) {
      return ReadingSettings.defaults;
    }
    return ReadingSettings.fromJson(json);
  }

  /// Lưu thiết lập đọc (Req 12.1).
  Future<void> saveSettings(ReadingSettings settings) {
    return _store.writeSettings(settings.toJson());
  }

  /// Nạp vị trí đọc của [storyId]; `null` nếu chưa lưu (Req 12.4, 12.7).
  Future<ReadingPosition?> loadPosition(String storyId) async {
    final json = await _store.readPosition(storyId);
    if (json == null) {
      return null;
    }
    return ReadingPosition.fromJson(json);
  }

  /// Lưu vị trí đọc của [storyId] (Req 12.3).
  Future<void> savePosition(String storyId, ReadingPosition position) {
    return _store.writePosition(storyId, position.toJson());
  }
}
