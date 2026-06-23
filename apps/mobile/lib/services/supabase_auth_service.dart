/// Dịch vụ xác thực bọc Supabase Auth (Auth_Module — Req 2).
///
/// Bao bọc `Supabase.instance.client.auth` (GoTrueClient) sau một interface
/// trừu tượng [SupabaseAuthService] để `AuthController` (task 8.1) và các bài
/// test có thể override/mock mà không phụ thuộc nền tảng thực.
///
/// Lưu ý phiên (session): `supabase_flutter` **tự khôi phục** phiên đã lưu khi
/// `Supabase.initialize` chạy lúc khởi động, và tự refresh access token. Vì vậy
/// [restoreSession] chỉ cần đọc phiên hiện tại và loại bỏ nếu đã hết hiệu lực
/// (Req 2.9, 2.11), còn [currentAccessToken] refresh khi token hết hạn.
library;

import 'package:supabase_flutter/supabase_flutter.dart';

/// Redirect URI deep link cho luồng OAuth Google trên di động (Req 2.2, 2.3).
const String kOAuthRedirectUri = 'cc.novelkit.drama15://login-callback';

/// Interface xác thực dùng xuyên suốt App.
abstract class SupabaseAuthService {
  /// Luồng thay đổi phiên: phát [Session] mới khi đăng nhập/refresh, `null` khi
  /// đăng xuất hoặc phiên bị xóa (Req 2.3, 2.7).
  Stream<Session?> get authStateChanges;

  /// Phiên hiện tại (đồng bộ), `null` nếu chưa đăng nhập.
  Session? get currentSession;

  /// Access token còn hiệu lực của phiên hiện tại; `null` nếu không có
  /// (Req 1.3, 1.10). Tự refresh khi token đã hết hạn.
  Future<String?> currentAccessToken();

  /// Mở luồng OAuth Google của Supabase trên trình duyệt hệ thống (Req 2.2).
  Future<void> signInWithGoogle();

  /// Kết thúc phiên Supabase (Req 2.7).
  Future<void> signOut();

  /// Khôi phục phiên đã lưu khi khởi động; trả `null` và xóa phiên nếu hết hiệu
  /// lực/không hợp lệ (Req 2.9, 2.11).
  Future<Session?> restoreSession();
}

/// Hiện thực [SupabaseAuthService] dựa trên `GoTrueClient` của Supabase.
class SupabaseAuthServiceImpl implements SupabaseAuthService {
  SupabaseAuthServiceImpl(this._auth);

  final GoTrueClient _auth;

  @override
  Stream<Session?> get authStateChanges =>
      _auth.onAuthStateChange.map((state) => state.session);

  @override
  Session? get currentSession => _auth.currentSession;

  @override
  Future<String?> currentAccessToken() async {
    final session = _auth.currentSession;
    if (session == null) {
      return null;
    }
    if (session.isExpired) {
      try {
        final refreshed = await _auth.refreshSession();
        return refreshed.session?.accessToken;
      } catch (_) {
        return null;
      }
    }
    return session.accessToken;
  }

  @override
  Future<void> signInWithGoogle() async {
    await _auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: kOAuthRedirectUri,
    );
  }

  @override
  Future<void> signOut() => _auth.signOut();

  @override
  Future<Session?> restoreSession() async {
    final session = _auth.currentSession;
    if (session == null) {
      return null;
    }
    if (session.isExpired) {
      // Thử refresh; nếu thất bại thì xóa phiên và về trạng thái chưa đăng nhập.
      try {
        final refreshed = await _auth.refreshSession();
        return refreshed.session;
      } catch (_) {
        await _auth.signOut();
        return null;
      }
    }
    return session;
  }
}
