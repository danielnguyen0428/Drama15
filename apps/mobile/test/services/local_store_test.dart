// Kiểm thử đơn vị cho `LocalStore` (Req 12.1, 12.3).
//
// Dùng `SharedPreferences.setMockInitialValues` để chạy store in-memory, không
// chạm I/O thật. Xác nhận: đọc/ghi JSON theo khóa toàn cục `reading_settings`
// và khóa theo truyện `reading_position:<storyId>`, khứ hồi cơ bản, tách biệt
// theo storyId, an toàn trước dữ liệu hỏng và khóa chưa có.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:drama15_mobile/services/local_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('LocalStore — khóa lưu trữ', () {
    test('khóa thiết lập toàn cục là "reading_settings"', () {
      expect(LocalStore.settingsKey, 'reading_settings');
    });

    test('khóa vị trí theo truyện ghép đúng tiền tố + storyId', () {
      expect(LocalStore.positionKey('abc'), 'reading_position:abc');
      expect(LocalStore.positionKey(''), 'reading_position:');
    });
  });

  group('LocalStore — thiết lập đọc toàn cục (Req 12.1, 12.2)', () {
    test('readSettings trả null khi chưa có dữ liệu', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = LocalStore(
        preferences: await SharedPreferences.getInstance(),
      );

      expect(await store.readSettings(), isNull);
    });

    test('ghi rồi đọc lại trả về JSON tương đương', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = LocalStore(
        preferences: await SharedPreferences.getInstance(),
      );

      final json = <String, dynamic>{
        'fontSize': 18,
        'theme': 'sepia',
        'brightness': 0.5,
        'fontFamily': 'serif',
      };
      await store.writeSettings(json);

      expect(await store.readSettings(), json);
    });

    test('ghi lưu chuỗi JSON thực sự dưới khóa toàn cục', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final prefs = await SharedPreferences.getInstance();
      final store = LocalStore(preferences: prefs);

      await store.writeSettings(<String, dynamic>{'fontSize': 22});

      final raw = prefs.getString(LocalStore.settingsKey);
      expect(raw, isNotNull);
      expect(jsonDecode(raw!), <String, dynamic>{'fontSize': 22});
    });
  });

  group('LocalStore — vị trí đọc theo truyện (Req 12.3, 12.4)', () {
    test('readPosition trả null khi chưa có dữ liệu cho storyId', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = LocalStore(
        preferences: await SharedPreferences.getInstance(),
      );

      expect(await store.readPosition('story-1'), isNull);
    });

    test('ghi rồi đọc lại vị trí trả về JSON tương đương', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = LocalStore(
        preferences: await SharedPreferences.getInstance(),
      );

      final json = <String, dynamic>{
        'chapterIndex': 3,
        'inChapterProgress': 0.42,
      };
      await store.writePosition('story-1', json);

      expect(await store.readPosition('story-1'), json);
    });

    test('vị trí của các truyện khác nhau được lưu độc lập', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = LocalStore(
        preferences: await SharedPreferences.getInstance(),
      );

      await store.writePosition('a', <String, dynamic>{'chapterIndex': 1});
      await store.writePosition('b', <String, dynamic>{'chapterIndex': 9});

      expect(await store.readPosition('a'), <String, dynamic>{
        'chapterIndex': 1,
      });
      expect(await store.readPosition('b'), <String, dynamic>{
        'chapterIndex': 9,
      });
    });
  });

  group('LocalStore — an toàn trước dữ liệu hỏng', () {
    test('chuỗi JSON không hợp lệ ở khóa thiết lập trả về null', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{
        LocalStore.settingsKey: 'khong-phai-json{',
      });
      final store = LocalStore(
        preferences: await SharedPreferences.getInstance(),
      );

      expect(await store.readSettings(), isNull);
    });

    test('JSON không phải object (mảng) trả về null', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{
        LocalStore.positionKey('s'): '[1,2,3]',
      });
      final store = LocalStore(
        preferences: await SharedPreferences.getInstance(),
      );

      expect(await store.readPosition('s'), isNull);
    });
  });

  group('LocalStore — lấy SharedPreferences lười (không tiêm)', () {
    test('hoạt động khi dùng instance lấy lười qua getInstance', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = LocalStore();

      await store.writeSettings(<String, dynamic>{'fontFamily': 'sansSerif'});

      expect(await store.readSettings(), <String, dynamic>{
        'fontFamily': 'sansSerif',
      });
    });
  });
}
