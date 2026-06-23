/// Điểm khởi đầu của ứng dụng "Drama 15" và đấu nối vòng đời (Req 1.5, 2.9,
/// 2.11, 16.8).
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config/app_config.dart';
import 'config/providers.dart';
import 'config/router.dart';
import 'controllers/auth_controller.dart';
import 'controllers/offline_controller.dart';
import 'screens/config_error_screen.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final config = AppConfig.fromEnvironment();
  final validation = config.validate();

  // Cấu hình không hợp lệ: hiển thị màn hình lỗi, không khởi tạo Supabase
  // (Req 1.5, 1.9).
  if (!validation.isValid) {
    runApp(
      MaterialApp(
        title: 'Drama 15',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        home: ConfigErrorScreen(invalidKeys: validation.invalidKeys),
      ),
    );
    return;
  }

  await Supabase.initialize(
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    debug: kDebugMode,
  );

  runApp(const ProviderScope(child: Drama15App()));
}

/// Widget gốc: đấu nối router, theme và vòng đời khởi động.
class Drama15App extends ConsumerStatefulWidget {
  const Drama15App({super.key});

  @override
  ConsumerState<Drama15App> createState() => _Drama15AppState();
}

class _Drama15AppState extends ConsumerState<Drama15App>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Đăng ký lắng nghe thay đổi phiên (deep link OAuth do supabase_flutter xử
    // lý) và khôi phục phiên + bản tải khi khởi động.
    final auth = ref.read(supabaseAuthServiceProvider);
    // Log sự kiện auth (chỉ ở bản debug) để chẩn đoán luồng OAuth/deep link.
    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      if (kDebugMode) {
        debugPrint(
          '[AUTH] event=${data.event} session=${data.session != null}',
        );
      }
    });
    auth.authStateChanges.listen((session) {
      ref.read(authControllerProvider.notifier).onAuthChanged(session);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await ref.read(authControllerProvider.notifier).restoreOnStartup();
      await ref.read(offlineControllerProvider.notifier).restoreOnStartup();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Cho supabase_flutter một nhịp để xử lý deep link OAuth (nếu có) rồi mới
      // gỡ trạng thái "đang đăng nhập" nếu phiên vẫn chưa thiết lập.
      Future<void>.delayed(const Duration(milliseconds: 1500), () {
        if (mounted) {
          ref.read(authControllerProvider.notifier).cancelSignInIfPending();
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Drama 15',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: router,
    );
  }
}
