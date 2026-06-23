/// Màn hình Cài đặt — chuẩn yêu cầu App Store & Google Play.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/providers.dart';
import '../config/providers.dart';
import '../i18n/app_strings.dart';
import '../theme/app_theme.dart';

/// Phiên bản hiện tại (hiển thị trong Settings).
const String kAppVersion = '1.0.0';

/// Cài đặt chung cho app: thông tin, chính sách, phiên bản.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final s = ref.watch(appStringsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.settingsTitle)),
      body: ListView(
        children: [
          const SizedBox(height: 8),
          _SectionHeader(title: s.sectionAbout),
          _SettingsTile(
            icon: Icons.info_outline,
            title: s.versionLabel,
            subtitle: kAppVersion,
          ),
          _SettingsTile(
            icon: Icons.description_outlined,
            title: s.aboutAppTitle,
            subtitle: s.aboutAppSubtitle,
            onTap: () => _showAbout(context, s),
          ),
          const Divider(height: 32),
          _SectionHeader(title: s.sectionLegal),
          _SettingsTile(
            icon: Icons.privacy_tip_outlined,
            title: s.privacyPolicy,
            onTap: () => _openPolicy(context, 'privacy', s),
          ),
          _SettingsTile(
            icon: Icons.gavel_outlined,
            title: s.termsOfUse,
            onTap: () => _openPolicy(context, 'terms', s),
          ),
          _SettingsTile(
            icon: Icons.delete_outline,
            title: s.deleteAccountTitle,
            subtitle: s.deleteAccountSubtitle,
            onTap: () => _showDeleteAccount(context, s),
          ),
          const Divider(height: 32),
          _SectionHeader(title: s.sectionSupport),
          _SettingsTile(
            icon: Icons.email_outlined,
            title: s.contactSupport,
            subtitle: 'support@novelkit.cc',
            onTap: () {},
          ),
          _SettingsTile(
            icon: Icons.star_outline,
            title: s.rateApp,
            onTap: () {},
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

  void _showAbout(BuildContext context, AppStrings s) {
    showAboutDialog(
      context: context,
      applicationName: 'Drama 15',
      applicationVersion: kAppVersion,
      applicationLegalese: s.aboutLegalese,
      children: [
        const SizedBox(height: 12),
        Text(s.aboutDescription),
      ],
    );
  }

  void _openPolicy(BuildContext context, String type, AppStrings s) {
    final title = type == 'privacy' ? s.privacyPolicy : s.termsOfUse;
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(s.policyPlaceholder),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(s.close),
          ),
        ],
      ),
    );
  }

  void _showDeleteAccount(BuildContext context, AppStrings s) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(s.deleteAccountDialogTitle),
        content: Text(s.deleteAccountDialogBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(s.understood),
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
