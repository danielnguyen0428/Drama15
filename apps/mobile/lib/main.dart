import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Điểm khởi đầu của ứng dụng di động "Drama 15".
///
/// Đây là khung tối thiểu (placeholder) để dự án build được. Việc khởi tạo
/// Supabase, kiểm tra cấu hình (`AppConfig`), đăng ký router/`AppShell` và đấu
/// nối toàn bộ provider/controller sẽ được bổ sung ở các tác vụ sau (xem
/// `tasks.md` mục 9.1).
void main() {
  runApp(const ProviderScope(child: Drama15App()));
}

/// Widget gốc của ứng dụng.
class Drama15App extends StatelessWidget {
  const Drama15App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Drama 15',
      debugShowCheckedModeBanner: false,
      home: const _PlaceholderHome(),
    );
  }
}

class _PlaceholderHome extends StatelessWidget {
  const _PlaceholderHome();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Drama 15 — Xưởng viết tiểu thuyết ngắn'),
      ),
    );
  }
}
