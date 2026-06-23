// Unit tests cho các controller (Req 2.5, 8.7, 15.1, 15.3, 15.4, 16.4).
//
// Phủ: ánh xạ ApiFailure → thông điệp tiếng Việt, logic retry getAuthMe (clock
// nhanh), gate cấu hình, rollback trạng thái offline khi tải lỗi.

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:drama15_mobile/config/app_config.dart';
import 'package:drama15_mobile/controllers/auth_controller.dart';
import 'package:drama15_mobile/controllers/offline_controller.dart';
import 'package:drama15_mobile/controllers/quota_controller.dart';
import 'package:drama15_mobile/models/offline_download.dart';
import 'package:drama15_mobile/models/quota.dart';
import 'package:drama15_mobile/repositories/offline_repository.dart';
import 'package:drama15_mobile/repositories/story_repository.dart';
import 'package:drama15_mobile/models/story_config.dart';
import 'package:drama15_mobile/models/account.dart';
import 'package:drama15_mobile/i18n/app_strings.dart';
import 'package:drama15_mobile/services/api_client.dart';
import 'package:drama15_mobile/services/local_story_store.dart';
import 'package:drama15_mobile/services/supabase_auth_service.dart';

const _config = AppConfig(
  apiBaseUrl: 'https://drama-api.novelkit.cc',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon',
);

class _FakeAuth implements SupabaseAuthService {
  _FakeAuth({this.token = 'tok'});
  final String? token;
  @override
  Future<String?> currentAccessToken() async => token;
  @override
  Stream<Session?> get authStateChanges => const Stream.empty();
  @override
  Session? get currentSession => null;
  @override
  Future<void> signInWithGoogle() async {}
  @override
  Future<void> signOut() async {}
  @override
  Future<Session?> restoreSession() async => null;
}

class _MemStore implements LocalStoryStore {
  final _data = <String, OfflineDownload>{};
  @override
  Future<void> save(OfflineDownload d) async => _data[d.storyId] = d;
  @override
  Future<OfflineDownload?> load(String id) async => _data[id];
  @override
  Future<void> delete(String id) async => _data.remove(id);
  @override
  Future<List<OfflineDownloadMeta>> list() async =>
      _data.values.map((d) => d.meta).toList();
}

AppStrings _viStrings() => AppStrings.forLanguage(OutputLanguage.vietnamese);

StoryRepository _repoWith(MockClient mock, {String? token = 'tok'}) {
  final api = ApiClient(
    config: _config,
    auth: _FakeAuth(token: token),
    httpClient: mock,
    isConfigValid: () => true,
  );
  return StoryRepository(api);
}

void main() {
  group('QuotaController', () {
    test('canCreateStory/canSuggest theo remaining', () {
      final c = QuotaController();
      expect(c.state.canCreateStory, isTrue); // chưa có dữ liệu → cho phép
      c.applyStoryQuota(const QuotaSnapshot(remaining: 0, limit: 5));
      expect(c.state.canCreateStory, isFalse);
      c.applySuggestionQuota(const QuotaSnapshot(remaining: 3, limit: 10));
      expect(c.state.canSuggest, isTrue);
    });
  });

  group('AuthController retry getAuthMe (Req 2.5)', () {
    test('thất bại 2 lần rồi thành công → nạp được hồ sơ', () async {
      var calls = 0;
      final mock = MockClient((req) async {
        calls++;
        if (calls <= 2) {
          return http.Response('{"error":{"message":"loi"}}', 500);
        }
        return http.Response(
          '{"user":{"email":"a@b.c","tier":"pro"},'
          '"quota":{"remaining":4,"limit":5}}',
          200,
        );
      });
      final controller = AuthController(
        _FakeAuth(),
        _repoWith(mock),
        getStrings: _viStrings,
        retryDelay: Duration.zero,
        profileTimeout: const Duration(seconds: 5),
      );

      await controller.onAuthChanged(Object());

      expect(calls, 3);
      expect(controller.state.account, isNotNull);
      expect(controller.state.account!.plan, PlanTier.pro);
      expect(controller.state.profileError, isNull);
    });

    test('thất bại quá số lần → đặt profileError tiếng Việt', () async {
      final mock = MockClient((req) async {
        return http.Response('{"error":{"message":"Hong may chu"}}', 500);
      });
      final controller = AuthController(
        _FakeAuth(),
        _repoWith(mock),
        getStrings: _viStrings,
        retryDelay: Duration.zero,
        maxRetries: 1,
      );

      await controller.onAuthChanged(Object());

      expect(controller.state.profileError, 'Hong may chu');
      expect(controller.state.profileLoading, isFalse);
    });
  });

  group('ApiClient ánh xạ lỗi (Req 15.3, 15.4)', () {
    test(
      '401 → unauthorized; 4xx kèm error.message giữ nguyên thông điệp',
      () async {
        final mock = MockClient((req) async {
          if (req.url.path.endsWith('/auth/me')) {
            return http.Response('{"error":{"message":"het han"}}', 401);
          }
          return http.Response('{"error":{"message":"sai du lieu"}}', 400);
        });
        final repo = _repoWith(mock);

        final me = await repo.getAuthMe();
        expect(me, isA<ApiFailure>());
        expect((me as ApiFailure).kind, ApiFailureKind.unauthorized);

        final create = await repo.setupSuggest(StoryConfig.defaults);
        expect((create as ApiFailure).message, 'sai du lieu');
      },
    );

    test(
      'thiếu token cho endpoint cần auth → unauthorized, không gửi',
      () async {
        var sent = false;
        final mock = MockClient((req) async {
          sent = true;
          return http.Response('{}', 200);
        });
        final repo = _repoWith(mock, token: null);
        final res = await repo.getAuthMe();
        expect(sent, isFalse);
        expect((res as ApiFailure).kind, ApiFailureKind.unauthorized);
      },
    );
  });

  group('OfflineController rollback khi tải lỗi (Req 16.4)', () {
    test('download thất bại → giữ trạng thái trước + lastError', () async {
      final mock = MockClient((req) async {
        return http.Response('{"error":{"message":"Mat mang"}}', 500);
      });
      final repo = OfflineRepository(_repoWith(mock), _MemStore());
      final controller = OfflineController(
        repo,
        getStrings: _viStrings,
      );

      expect(controller.statusOf('s1'), OfflineDownloadStatus.notDownloaded);
      await controller.downloadStory('s1');

      expect(controller.statusOf('s1'), OfflineDownloadStatus.notDownloaded);
      expect(controller.lastError, isNotNull);
    });
  });
}
