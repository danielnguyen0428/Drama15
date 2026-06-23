// Property-based test: endpoint cần auth luôn gắn Bearer token (Req 1.3).
//
// Feature: flutter-drama-mobile-app, Property 5: Endpoint cần auth luôn gắn Bearer token

import 'package:glados/glados.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:drama15_mobile/config/app_config.dart';
import 'package:drama15_mobile/services/api_client.dart';
import 'package:drama15_mobile/services/supabase_auth_service.dart';

/// Auth giả trả về một token cố định cho mỗi lần chạy.
class _FakeAuth implements SupabaseAuthService {
  _FakeAuth(this._token);
  final String _token;

  @override
  Future<String?> currentAccessToken() async => _token;

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

const _config = AppConfig(
  apiBaseUrl: 'https://drama-api.novelkit.cc',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key',
);

void main() {
  const tokenChars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.';
  final tokenGen = any.nonEmptyStringOf(tokenChars);

  Glados<String>(tokenGen, ExploreConfig(numRuns: 100)).test(
    'GET cần auth gắn header Authorization: Bearer <token>',
    (token) async {
      String? captured;
      final mock = MockClient((request) async {
        captured = request.headers['Authorization'];
        return http.Response('{}', 200);
      });

      final client = ApiClient(
        config: _config,
        auth: _FakeAuth(token),
        httpClient: mock,
        isConfigValid: () => true,
      );

      await client.get<dynamic>('/auth/me');
      expect(captured, 'Bearer $token');
    },
  );
}
