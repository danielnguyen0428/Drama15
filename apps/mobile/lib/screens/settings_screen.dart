/// Màn hình Cài đặt — chuẩn yêu cầu App Store & Google Play.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/app_theme.dart';

/// Phiên bản hiện tại (hiển thị trong Settings).
const String kAppVersion = '1.0.0';

/// Cài đặt chung cho app: thông tin, chính sách, phiên bản.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Cài đặt')),
      body: ListView(
        children: [
          const SizedBox(height: 8),
          // ─── Giới thiệu ───
          _SectionHeader(title: 'Giới thiệu'),
          _SettingsTile(
            icon: Icons.info_outline,
            title: 'Phiên bản',
            subtitle: kAppVersion,
          ),
          _SettingsTile(
            icon: Icons.description_outlined,
            title: 'Giới thiệu Drama 15',
            subtitle: 'Trợ lý AI sáng tác tiểu thuyết drama 15 chương',
            onTap: () => _showAbout(context),
          ),
          const Divider(height: 32),
          // ─── Pháp lý (bắt buộc cho App Store / Google Play) ───
          _SectionHeader(title: 'Pháp lý'),
          _SettingsTile(
            icon: Icons.privacy_tip_outlined,
            title: 'Chính sách quyền riêng tư',
            onTap: () => _openPolicy(context, 'privacy'),
          ),
          _SettingsTile(
            icon: Icons.gavel_outlined,
            title: 'Điều khoản sử dụng',
            onTap: () => _openPolicy(context, 'terms'),
          ),
          _SettingsTile(
            icon: Icons.delete_outline,
            title: 'Xóa tài khoản & dữ liệu',
            subtitle: 'Yêu cầu xóa toàn bộ dữ liệu cá nhân',
            onTap: () => _showDeleteAccount(context),
          ),
          const Divider(height: 32),
          // ─── Hỗ trợ ───
          _SectionHeader(title: 'Hỗ trợ'),
          _SettingsTile(
            icon: Icons.email_outlined,
            title: 'Liên hệ hỗ trợ',
            subtitle: 'support@novelkit.cc',
            onTap: () {},
          ),
          _SettingsTile(
            icon: Icons.star_outline,
            title: 'Đánh giá ứng dụng',
            onTap: () {}, // TODO: mở store listing
          ),
          const SizedBox(height: 32),
          Center(
            child: Text(
              '© 2024–2025 NovelKit Studio',
              style: theme.textTheme.bodySmall,
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  void _showAbout(BuildContext context) {
    showAboutDialog(
      context: context,
      applicationName: 'Drama 15',
      applicationVersion: kAppVersion,
      applicationLegalese:
          '© 2024–2025 NovelKit Studio.\nMọi quyền được bảo lưu.',
      children: [
        const SizedBox(height: 12),
        const Text(
          'Trợ lý AI sáng tác tiểu thuyết drama 15 chương. '
          'Sáng tác drama với AI, đọc như một cuốn sách thật.',
        ),
      ],
    );
  }

  void _openPolicy(BuildContext context, String type) {
    // Placeholder — sẽ mở WebView hoặc external URL khi có trang chính sách.
    final title = type == 'privacy'
        ? 'Chính sách quyền riêng tư'
        : 'Điều khoản sử dụng';
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: const Text(
          'Nội dung chính sách sẽ được cập nhật tại:\nhttps://drama.novelkit.cc/privacy\nhttps://drama.novelkit.cc/terms',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Đóng'),
          ),
        ],
      ),
    );
  }

  void _showDeleteAccount(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xóa tài khoản'),
        content: const Text(
          'Để xóa tài khoản và toàn bộ dữ liệu, vui lòng gửi email tới '
          'support@novelkit.cc với tiêu đề "Yêu cầu xóa tài khoản". '
          'Chúng tôi sẽ xử lý trong vòng 30 ngày.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Đã hiểu'),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Text(
        title.toUpperCase(),
        style: AppFonts.mono(
          fontSize: 11,
          color: AppColors.meta,
          letterSpacing: 1.0,
        ),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.title,
    this.subtitle,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppColors.muted),
      title: Text(title),
      subtitle: subtitle != null ? Text(subtitle!) : null,
      trailing: onTap != null
          ? const Icon(Icons.chevron_right, color: AppColors.meta)
          : null,
      onTap: onTap,
    );
  }
}
