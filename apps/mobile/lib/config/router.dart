/// Khai báo điều hướng bằng `go_router` với gate cấu hình + auth (Req 14.3,
/// 1.5, 2.1).
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../controllers/auth_controller.dart';
import '../screens/app_shell.dart';
import '../screens/auth_screen.dart';
import '../screens/config_error_screen.dart';
import '../screens/reader_screen.dart';
import 'app_config.dart';

/// Listenable cầu nối để `go_router` refresh khi auth/cấu hình đổi.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(this._ref) {
    _ref.listen(authControllerProvider, (_, _) => notifyListeners());
    _ref.listen(configValidProvider, (_, _) => notifyListeners());
  }
  final Ref _ref;
}

/// Provider `GoRouter` của App.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    refreshListenable: refresh,
    initialLocation: '/',
    redirect: (context, state) {
      final configValid = ref.read(configValidProvider);
      if (!configValid) {
        return state.matchedLocation == '/config-error'
            ? null
            : '/config-error';
      }
      final isSignedIn = ref.read(authControllerProvider).isSignedIn;
      final loc = state.matchedLocation;
      if (!isSignedIn) {
        return loc == '/auth' ? null : '/auth';
      }
      if (loc == '/auth' || loc == '/config-error') {
        return '/';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const AppShell()),
      GoRoute(path: '/auth', builder: (context, state) => const AuthScreen()),
      GoRoute(
        path: '/config-error',
        builder: (context, state) {
          final invalid = ref.read(appConfigProvider).validate().invalidKeys;
          return ConfigErrorScreen(invalidKeys: invalid);
        },
      ),
      GoRoute(
        path: '/reader/:id',
        builder: (context, state) =>
            ReaderScreen(storyId: state.pathParameters['id']!),
      ),
    ],
  );
});
