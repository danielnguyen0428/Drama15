/// Màn hình lỗi cấu hình (Req 1.5).
library;

import 'package:flutter/material.dart';

/// Hiển thị danh sách khóa cấu hình không hợp lệ.
class ConfigErrorScreen extends StatelessWidget {
  const ConfigErrorScreen({super.key, required this.invalidKeys});

  final List<String> invalidKeys;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48),
                const SizedBox(height: 16),
                Text(
                  'Cấu hình ứng dụng không hợp lệ',
                  style: Theme.of(context).textTheme.titleLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Các giá trị cấu hình sau không sử dụng được:',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                for (final key in invalidKeys)
                  Text(
                    key,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
