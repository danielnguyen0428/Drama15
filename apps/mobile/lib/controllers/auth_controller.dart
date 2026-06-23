/// Controller xác thực (Auth_Module — Req 2).
library;

import 'dart:async';

import 'package:flutter_riverpod/legacy.dart';

import '../config/providers.dart';
import '../i18n/app_strings.dart';
import '../models/account.dart';
import '../services/api_client.dart';
import '../repositories/story_repository.dart';
import '../services/supabase_auth_service.dart';

/// Trạng thái xác thực của App.
class AuthState {
  const AuthState({
    this.isSignedIn = false,
    this.account,
    this.signingIn = false,
    this.signInError,
    this.profileLoading = false,
    this.profileError,
  });

  final bool isSignedIn;
  final AccountSnapshot? account;
  final bool signingIn;
  final String? signInError;
  final bool profileLoading;

  /// Lỗi nạp hồ sơ `/auth/me` (kèm tùy chọn "Thử lại" — Req 2.5).
  final String? profileError;

  AuthState copyWith({
    bool? isSignedIn,
    Object? account = _sentinel,
    bool? signingIn,
    Object? signInError = _sentinel,
    bool? profileLoading,
    Object? profileError = _sentinel,
  }) {
    return AuthState(
      isSignedIn: isSignedIn ?? this.isSignedIn,
      account: identical(account, _sentinel)
          ? this.account
          : account as AccountSnapshot?,
      signingIn: signingIn ?? this.signingIn,
      signInError: identical(signInError, _sentinel)
          ? this.signInError
          : signInError as String?,
      profileLoading: profileLoading ?? this.profileLoading,
      profileError: identical(profileError, _sentinel)
          ? this.profileError
          : profileError as String?,
    );
  }

  static const Object _sentinel = Object();
}

/// Điều phối đăng nhập Google + nạp hồ sơ/quota (`/auth/me`).
class AuthController extends StateNotifier<AuthState> {
  AuthController(
    this._auth,
    this._stories, {
    required AppStrings Function() getStrings,
    Duration signInTimeout = const Duration(seconds: 120),
    Duration profileTimeout = const Duration(seconds: 10),
    Duration retryDelay = const Duration(seconds: 5),
    int maxRetries = 3,
  }) : _getStrings = getStrings,
       _signInTimeout = signInTimeout,
       _profileTimeout = profileTimeout,
       _retryDelay = retryDelay,
       _maxRetries = maxRetries,
       super(const AuthState());

  final SupabaseAuthService _auth;
  final StoryRepository _stories;
  final AppStrings Function() _getStrings;
  final Duration _signInTimeout;
  final Duration _profileTimeout;
  final Duration _retryDelay;
  final int _maxRetries;

  /// Bắt đầu luồng OAuth Google; timeout/hủy/lỗi giữ trạng thái chưa đăng nhập
  /// (Req 2.2, 2.10).
  Future<void> signInWithGoogle() async {
    state = state.copyWith(signingIn: true, signInError: null);
    try {
      await _auth.signInWithGoogle().timeout(_signInTimeout);
    } on TimeoutException {
      state = state.copyWith(
        signingIn: false,
        signInError: _getStrings().signInTimeout,
      );
    } catch (_) {
      state = state.copyWith(
        signingIn: false,
        signInError: _getStrings().signInFailed,
      );
    }
  }

  /// Xử lý thay đổi phiên: thiết lập đăng nhập rồi nạp hồ sơ (Req 2.3, 2.4).
  Future<void> onAuthChanged(Object? session) async {
    if (session == null) {
      state = const AuthState();
      return;
    }
    state = state.copyWith(
      isSignedIn: true,
      signingIn: false,
      signInError: null,
    );
    await _loadProfile();
  }

  /// "Thử lại" nạp hồ sơ thủ công (Req 2.5).
  Future<void> retryLoadProfile() => _loadProfile();

  /// Hủy trạng thái "đang đăng nhập" khi quay lại app mà phiên chưa thiết lập
  /// (tránh nút kẹt "Đang đăng nhập..." vĩnh viễn nếu redirect không quay về).
  void cancelSignInIfPending() {
    if (state.signingIn && !state.isSignedIn) {
      state = state.copyWith(signingIn: false);
    }
  }

  Future<void> _loadProfile() async {
    state = state.copyWith(profileLoading: true, profileError: null);
    for (var attempt = 0; attempt <= _maxRetries; attempt++) {
      ApiResponse<AccountSnapshot> response;
      try {
        response = await _stories.getAuthMe().timeout(_profileTimeout);
      } on TimeoutException {
        response = ApiFailure<AccountSnapshot>(
          ApiFailureKind.network,
          _getStrings().profileLoadTimeout,
        );
      }

      if (response is ApiSuccess<AccountSnapshot>) {
        state = state.copyWith(
          account: response.data,
          profileLoading: false,
          profileError: null,
        );
        return;
      }

      final failure = response as ApiFailure<AccountSnapshot>;
      if (attempt < _maxRetries) {
        await Future<void>.delayed(_retryDelay);
      } else {
        state = state.copyWith(
          profileLoading: false,
          profileError: _getStrings().localizeFailure(failure),
        );
      }
    }
  }

  /// Đăng xuất: kết thúc phiên và dọn toàn bộ state (Req 2.7).
  Future<void> signOut() async {
    await _auth.signOut();
    state = const AuthState();
  }

  /// Khôi phục phiên khi khởi động (Req 2.9, 2.11).
  Future<void> restoreOnStartup() async {
    final session = await _auth.restoreSession();
    if (session == null) {
      state = const AuthState();
      return;
    }
    state = state.copyWith(isSignedIn: true);
    await _loadProfile();
  }
}

/// Provider cho [AuthController].
final authControllerProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) {
    return AuthController(
      ref.watch(supabaseAuthServiceProvider),
      ref.watch(storyRepositoryProvider),
      getStrings: () => AppStrings.forLanguage(ref.read(uiOutputLanguageProvider)),
    );
  },
);
