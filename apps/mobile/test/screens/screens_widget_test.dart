// Widget tests cho UI (Req 5.11, 10.5, 11.x, 14.x).
//
// Phủ: 5 thẻ nội dung, vô hiệu nút theo quota, điều hướng tab, kích thước chạm,
// reflow một cột, theme/phông.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:drama15_mobile/config/providers.dart';
import 'package:drama15_mobile/controllers/quota_controller.dart';
import 'package:drama15_mobile/models/offline_download.dart';
import 'package:drama15_mobile/models/quota.dart';
import 'package:drama15_mobile/screens/app_shell.dart';
import 'package:drama15_mobile/screens/config_screen.dart';
import 'package:drama15_mobile/screens/story_workspace_screen.dart';
import 'package:drama15_mobile/services/local_story_store.dart';
import 'package:drama15_mobile/services/supabase_auth_service.dart';
import 'package:drama15_mobile/theme/app_theme.dart';

class _FakeAuth implements SupabaseAuthService {
  @override
  Future<String?> currentAccessToken() async => 'tok';
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
  @override
  Future<void> save(OfflineDownload d) async {}
  @override
  Future<OfflineDownload?> load(String id) async => null;
  @override
  Future<void> delete(String id) async {}
  @override
  Future<List<OfflineDownloadMeta>> list() async => const [];
}

MockClient _mock() => MockClient((req) async {
  if (req.url.path.endsWith('/story/style-presets')) {
    return http.Response('{"presets":[]}', 200);
  }
  if (req.url.path.endsWith('/stories')) {
    return http.Response('{"stories":[]}', 200);
  }
  return http.Response('{}', 200);
});

Widget _harness(Widget child, {QuotaController? quota}) {
  return ProviderScope(
    overrides: [
      supabaseAuthServiceProvider.overrideWithValue(_FakeAuth()),
      httpClientProvider.overrideWithValue(_mock()),
      localStoryStoreProvider.overrideWithValue(_MemStore()),
      if (quota != null) quotaControllerProvider.overrideWith((ref) => quota),
    ],
    child: MaterialApp(theme: AppTheme.light(), home: child),
  );
}

void main() {
  testWidgets('StoryWorkspaceScreen hiển thị đủ 5 thẻ (Req 5.11)', (
    tester,
  ) async {
    await tester.pumpWidget(_harness(const StoryWorkspaceScreen()));
    await tester.pump();

    expect(find.text('Chương'), findsOneWidget);
    expect(find.text('Ý tưởng'), findsOneWidget);
    expect(find.text('Dàn ý'), findsOneWidget);
    expect(find.text('Hồ sơ'), findsOneWidget);
    expect(find.text('Quan hệ'), findsOneWidget);
  });

  testWidgets('AppShell có 3 tab điều hướng một cột (Req 14.2, 14.3)', (
    tester,
  ) async {
    await tester.pumpWidget(_harness(const AppShell()));
    await tester.pump();

    expect(
      find.descendant(
        of: find.byType(BottomNavigationBar),
        matching: find.text('Khởi tạo'),
      ),
      findsOneWidget,
    );
    expect(find.text('Bản thảo'), findsOneWidget);
    expect(find.text('Tủ truyện'), findsOneWidget);
    expect(find.byType(IndexedStack), findsAtLeastNWidgets(1));
    expect(find.byType(BottomNavigationBar), findsOneWidget);
  });

  testWidgets('ConfigScreen vô hiệu nút khi hết hạn mức (Req 7.3, 4.5)', (
    tester,
  ) async {
    final quota = QuotaController()
      ..applyStoryQuota(const QuotaSnapshot(remaining: 0, limit: 5))
      ..applySuggestionQuota(const QuotaSnapshot(remaining: 0, limit: 10));

    await tester.pumpWidget(_harness(const ConfigScreen(), quota: quota));
    await tester.pump();

    await tester.scrollUntilVisible(
      find.byKey(const Key('generate-button')),
      300,
      scrollable: find.byType(Scrollable).first,
    );

    final generate = tester.widget<FilledButton>(
      find.byKey(const Key('generate-button')),
    );
    final suggest = tester.widget<OutlinedButton>(
      find.byKey(const Key('suggest-button')),
    );
    expect(generate.onPressed, isNull);
    expect(suggest.onPressed, isNull);
  });

  testWidgets('Nút có kích thước chạm tối thiểu ~48px (Req 14.4)', (
    tester,
  ) async {
    await tester.pumpWidget(
      _harness(
        Scaffold(
          body: Center(
            child: FilledButton(onPressed: () {}, child: const Text('OK')),
          ),
        ),
      ),
    );
    await tester.pump();
    final size = tester.getSize(find.byType(FilledButton));
    expect(size.height, greaterThanOrEqualTo(AppTheme.minTouchTarget));
  });
}
