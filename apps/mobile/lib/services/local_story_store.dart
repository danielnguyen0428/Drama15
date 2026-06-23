/// Lưu trữ bền vững bản tải ngoại tuyến (`Local_Story_Store` — Req 16).
///
/// Mỗi [OfflineDownload] được lưu thành một tệp JSON riêng trong thư mục tài
/// liệu của app: `<appDocs>/offline_stories/<storyId>.json`. Ghi dùng **atomic
/// rename** (ghi `<storyId>.json.tmp` rồi `rename`) để khi đĩa đầy/lỗi giữa
/// chừng không để lại tệp tải dở (Req 16.4); hết dung lượng ném
/// [StorageFullException].
library;

import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../models/offline_download.dart';

/// Ném khi ghi tệp thất bại do hết dung lượng lưu trữ (Req 16.4).
class StorageFullException implements Exception {
  const StorageFullException([this.message = 'Hết dung lượng lưu trữ.']);
  final String message;

  @override
  String toString() => 'StorageFullException: $message';
}

/// Interface lưu/nạp/xóa/liệt kê các bản tải ngoại tuyến.
abstract class LocalStoryStore {
  /// Lưu (ghi đè) một [OfflineDownload] một cách nguyên tử (Req 16.1, 16.4).
  Future<void> save(OfflineDownload download);

  /// Nạp bản tải của [storyId]; `null` nếu chưa tải (Req 16.5, 16.8).
  Future<OfflineDownload?> load(String storyId);

  /// Xóa bản tải của [storyId]; no-op nếu không tồn tại (Req 16.7).
  Future<void> delete(String storyId);

  /// Liệt kê metadata các bản đã tải (không nạp toàn bộ payload) — Req 16.8.
  Future<List<OfflineDownloadMeta>> list();
}

/// Hiện thực [LocalStoryStore] dựa trên tệp JSON trên đĩa.
class FileLocalStoryStore implements LocalStoryStore {
  /// [baseDirectory] cho phép tiêm thư mục gốc trong test; mặc định dùng
  /// `getApplicationDocumentsDirectory()` của `path_provider`.
  FileLocalStoryStore({Directory? baseDirectory})
    : _baseDirectory = baseDirectory;

  static const String _subDir = 'offline_stories';
  static const int _enospc = 28; // errno ENOSPC (No space left on device).

  final Directory? _baseDirectory;
  Directory? _storiesDir;

  Future<Directory> _dir() async {
    final cached = _storiesDir;
    if (cached != null) {
      return cached;
    }
    final base = _baseDirectory ?? await getApplicationDocumentsDirectory();
    final dir = Directory('${base.path}/$_subDir');
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    _storiesDir = dir;
    return dir;
  }

  File _fileFor(Directory dir, String storyId) =>
      File('${dir.path}/$storyId.json');

  @override
  Future<void> save(OfflineDownload download) async {
    final dir = await _dir();
    final target = _fileFor(dir, download.storyId);
    final tmp = File('${target.path}.tmp');
    try {
      await tmp.writeAsString(jsonEncode(download.toJson()), flush: true);
      await tmp.rename(target.path);
    } on FileSystemException catch (e) {
      // Dọn tệp tạm nếu còn sót để không để lại bản tải dở (Req 16.4).
      if (await tmp.exists()) {
        try {
          await tmp.delete();
        } catch (_) {
          // Bỏ qua lỗi dọn dẹp.
        }
      }
      if (e.osError?.errorCode == _enospc) {
        throw const StorageFullException();
      }
      rethrow;
    }
  }

  @override
  Future<OfflineDownload?> load(String storyId) async {
    final dir = await _dir();
    final file = _fileFor(dir, storyId);
    if (!await file.exists()) {
      return null;
    }
    try {
      final raw = await file.readAsString();
      final json = jsonDecode(raw);
      if (json is Map) {
        return OfflineDownload.fromJson(Map<String, dynamic>.from(json));
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> delete(String storyId) async {
    final dir = await _dir();
    final file = _fileFor(dir, storyId);
    if (await file.exists()) {
      await file.delete();
    }
  }

  @override
  Future<List<OfflineDownloadMeta>> list() async {
    final dir = await _dir();
    final metas = <OfflineDownloadMeta>[];
    await for (final entity in dir.list()) {
      if (entity is! File || !entity.path.endsWith('.json')) {
        continue;
      }
      try {
        final json = jsonDecode(await entity.readAsString());
        if (json is Map) {
          metas.add(
            OfflineDownloadMeta(
              storyId: json['storyId'] is String
                  ? json['storyId'] as String
                  : '',
              title: json['title'] is String ? json['title'] as String : '',
              updatedAt: json['updatedAt'] is String
                  ? json['updatedAt'] as String
                  : '',
            ),
          );
        }
      } catch (_) {
        // Bỏ qua tệp hỏng.
      }
    }
    return metas;
  }
}
