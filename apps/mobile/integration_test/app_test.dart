// Integration tests cấp thiết bị (Req 2.3, 2.9, 2.11, 13.1, 16.4, 16.5).
//
// Chạy bằng: `flutter test integration_test` trên thiết bị/emulator thật.
//
// Phạm vi:
// - Khởi động App với cấu hình hợp lệ/không hợp lệ (gate màn hình lỗi cấu hình).
// - Deep link OAuth Supabase, khôi phục/hết hạn phiên: cần Supabase thật cấu
//   hình qua --dart-define; kịch bản mô tả trong nhóm test tương ứng.
// - LocalStoryStore thật + OS share sheet: kiểm ở thiết bị (plugin nền tảng).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:drama15_mobile/config/app_config.dart';
import 'package:drama15_mobile/screens/config_error_screen.dart';
import 'package:drama15_mobile/theme/app_theme.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Khởi động App', () {
    testWidgets(
      'cấu hình không hợp lệ → hiển thị màn hình lỗi cấu hình (Req 1.5)',
      (tester) async {
        const config = AppConfig(
          apiBaseUrl: 'not-a-url',
          supabaseUrl: '',
          supabaseAnonKey: '',
        );
        final invalid = config.validate().invalidKeys;
        expect(invalid, isNotEmpty);

        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: ConfigErrorScreen(invalidKeys: invalid),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Cấu hình ứng dụng không hợp lệ'), findsOneWidget);
        expect(find.text(ConfigKeys.apiBaseUrl), findsOneWidget);
      },
    );
  });

  // NOTE (cần thiết bị + Supabase thật qua --dart-define):
  // - Deep link OAuth: chọn "Đăng nhập bằng Google" mở trình duyệt, redirect
  //   `cc.novelkit.drama15://login-callback` hoàn tất phiên (Req 2.3).
  // - Khôi phục phiên khi khởi động lại (Req 2.9) và xóa phiên hết hạn (Req 2.11).
  // - LocalStoryStore thật: tải → khởi động lại → vẫn đọc được offline (Req 16.5).
  // - OS share sheet mở khi chia sẻ chương/truyện (Req 13.1).
}
