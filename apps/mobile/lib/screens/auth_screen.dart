/// Màn hình đăng nhập (Req 2.1, 2.6).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../controllers/auth_controller.dart';
import '../models/account.dart';
import '../theme/app_theme.dart';

/// Mời đăng nhập Google; khi đã đăng nhập hiển thị tên/email + gói.
class AuthScreen extends ConsumerWidget {
  const AuthScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final controller = ref.read(authControllerProvider.notifier);
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (auth.isSignedIn && auth.account != null) ...[
                    _AccountCard(account: auth.account!),
                    const SizedBox(height: 20),
                    OutlinedButton.icon(
                      onPressed: controller.signOut,
                      icon: const Icon(Icons.logout, size: 18),
                      label: const Text('Đăng xuất'),
                    ),
                  ] else ...[
                    Text(
                      'TRỢ LÝ AI SÁNG TÁC TIỂU THUYẾT DRAMA',
                      style: AppFonts.mono(
                        fontSize: 11,
                        color: AppColors.terracotta,
                        letterSpacing: 1.5,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'Drama 15',
                      style: theme.textTheme.displayLarge,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Sáng tác trọn bộ 15 chương, đọc như một cuốn sách thật. Đăng nhập để gợi ý kịch bản, viết bản thảo và giữ tủ truyện của bạn.',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: AppColors.muted,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),
                    FilledButton.icon(
                      onPressed: auth.signingIn
                          ? null
                          : controller.signInWithGoogle,
                      icon: const Icon(Icons.login, size: 18),
                      label: Text(
                        auth.signingIn
                            ? 'Đang đăng nhập...'
                            : 'Đăng nhập bằng Google',
                      ),
                    ),
                    if (auth.signInError != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        auth.signInError!,
                        style: TextStyle(color: theme.colorScheme.error),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ],
                  if (auth.profileError != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      auth.profileError!,
                      style: TextStyle(color: theme.colorScheme.error),
                      textAlign: TextAlign.center,
                    ),
                    TextButton(
                      onPressed: controller.retryLoadProfile,
                      child: const Text('Thử lại'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Thẻ hồ sơ tài khoản (tên/email + nhãn gói) kiểu editorial.
class _AccountCard extends StatelessWidget {
  const _AccountCard({required this.account});

  final AccountSnapshot account;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: AppColors.terracotta.withValues(alpha: 0.12),
              child: Text(
                account.displayNameOrEmail.isNotEmpty
                    ? account.displayNameOrEmail[0].toUpperCase()
                    : '?',
                style: AppFonts.serif(
                  fontSize: 28,
                  color: AppColors.terracotta,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              account.displayNameOrEmail,
              style: theme.textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              account.email,
              style: theme.textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.terracotta.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                account.plan.label,
                style: AppFonts.sans(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.terracotta,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
