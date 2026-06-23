/// Màn hình cấu hình truyện + gợi ý + hạn mức (Req 3, 4, 7).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../controllers/config_controller.dart';
import '../controllers/generation_controller.dart';
import '../controllers/quota_controller.dart';
import '../models/story_config.dart';
import '../theme/app_theme.dart';

/// Thu thập `StoryConfig`, gọi gợi ý kịch bản và viết bản thảo.
class ConfigScreen extends ConsumerStatefulWidget {
  const ConfigScreen({super.key, this.onGenerate});

  /// Gọi khi bắt đầu viết bản thảo (điều hướng sang tab Bản thảo).
  final VoidCallback? onGenerate;

  @override
  ConsumerState<ConfigScreen> createState() => _ConfigScreenState();
}

class _ConfigScreenState extends ConsumerState<ConfigScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(configControllerProvider.notifier).loadStylePresets();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(configControllerProvider);
    final controller = ref.read(configControllerProvider.notifier);
    final quota = ref.watch(quotaControllerProvider);
    final config = state.config;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Khởi tạo'),
        actions: [
          IconButton(
            key: const Key('draft-controls-button'),
            tooltip: 'Cường độ & nhịp kể',
            onPressed: () => _showDraftControlsDialog(context, config, controller),
            icon: const Icon(Icons.tune),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ─── SECTION 1: Hạn mức hôm nay (tách rõ khỏi form sáng tác) ───
          _QuotaSection(quota: quota),
          const SizedBox(height: 24),
          // ─── SECTION 2: Gợi ý sáng tác ───
          Text('Gợi ý sáng tác', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            key: const Key('niche-dropdown'),
            isExpanded: true,
            initialValue: config.niche,
            decoration: const InputDecoration(labelText: 'Dòng truyện'),
            items: [
              for (final n in kNiches)
                DropdownMenuItem(value: n.value, child: Text(n.label)),
            ],
            onChanged: (value) {
              if (value != null) {
                controller.updateConfig(config.copyWith(niche: value));
              }
            },
          ),
          if (config.niche == kCustomNiche) ...[
            const SizedBox(height: 12),
            TextField(
              decoration: const InputDecoration(labelText: 'Nhánh riêng'),
              onChanged: (v) =>
                  controller.updateConfig(config.copyWith(customNiche: v)),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: TextEditingController(
              text: config.title,
            )..selection = TextSelection.collapsed(offset: config.title.length),
            decoration: const InputDecoration(labelText: 'Nhan đề dự kiến'),
            onChanged: (v) =>
                controller.updateConfig(config.copyWith(title: v)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: TextEditingController(text: config.seed)
              ..selection = TextSelection.collapsed(offset: config.seed.length),
            decoration: const InputDecoration(
              labelText: 'Kịch bản / cốt truyện',
            ),
            maxLines: 3,
            onChanged: (v) => controller.updateConfig(config.copyWith(seed: v)),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: state.presets.any((p) => p.id == config.stylePreset)
                ? config.stylePreset
                : (state.presets.isNotEmpty ? state.presets.first.id : null),
            decoration: const InputDecoration(labelText: 'Giọng kể'),
            items: [
              for (final p in state.presets)
                DropdownMenuItem(value: p.id, child: Text(p.displayName)),
            ],
            onChanged: (value) {
              if (value != null) {
                controller.updateConfig(config.copyWith(stylePreset: value));
              }
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<OutputLanguage>(
            isExpanded: true,
            initialValue: config.outputLanguage,
            decoration: const InputDecoration(labelText: 'Ngôn ngữ đầu ra'),
            items: [
              for (final l in OutputLanguage.values)
                DropdownMenuItem(value: l, child: Text(l.label)),
            ],
            onChanged: (value) {
              if (value != null) {
                controller.updateConfig(config.copyWith(outputLanguage: value));
              }
            },
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            key: const Key('suggest-button'),
            onPressed: (quota.canSuggest && !state.suggesting)
                ? controller.suggest
                : null,
            child: Text(state.suggesting ? 'Đang xử lý...' : 'Gợi ý kịch bản'),
          ),
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('generate-button'),
            onPressed: quota.canCreateStory
                ? () {
                    ref
                        .read(generationControllerProvider.notifier)
                        .createAndStream(
                          ref.read(configControllerProvider).config,
                        );
                    widget.onGenerate?.call();
                  }
                : null,
            child: const Text('Viết bản thảo'),
          ),
          if (!quota.canCreateStory) ...[
            const SizedBox(height: 8),
            const Text(
              'Đã hết hạn mức trong ngày. Nâng cấp lên Pro hoặc Premium.',
            ),
          ],
          if (state.error != null) ...[
            const SizedBox(height: 8),
            Text(
              state.error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }
}

Future<void> _showDraftControlsDialog(
  BuildContext context,
  StoryConfig config,
  ConfigController controller,
) async {
  var draft = config;

  await showDialog<void>(
    context: context,
    builder: (dialogContext) {
      return StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: const Text('Cường độ & nhịp kể'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _Slider(
                    label: 'Cường độ cảm xúc',
                    value: draft.intensity,
                    min: 0,
                    max: 1,
                    onChanged: (v) {
                      setState(() => draft = draft.copyWith(intensity: v));
                      controller.updateConfig(draft);
                    },
                  ),
                  _Slider(
                    label: 'Tỷ lệ thoại',
                    value: draft.dialogueRatio,
                    min: 0.2,
                    max: 0.85,
                    onChanged: (v) {
                      setState(() => draft = draft.copyWith(dialogueRatio: v));
                      controller.updateConfig(draft);
                    },
                  ),
                  _Slider(
                    label: 'Mật độ móc câu',
                    value: draft.hookDensity,
                    min: 0,
                    max: 1,
                    onChanged: (v) {
                      setState(() => draft = draft.copyWith(hookDensity: v));
                      controller.updateConfig(draft);
                    },
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('Đóng'),
              ),
            ],
          );
        },
      );
    },
  );
}

class _QuotaSection extends StatelessWidget {
  const _QuotaSection({required this.quota});

  final QuotaState quota;

  @override
  Widget build(BuildContext context) {
    final storyRemaining = quota.storyQuota?.remaining ?? 0;
    final storyLimit = quota.storyQuota?.limit ?? 5;
    final suggestRemaining = quota.suggestionQuota?.remaining;
    final suggestLimit = quota.suggestionQuota?.limit;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Hạn mức hôm nay',
              style: AppFonts.mono(
                fontSize: 11,
                color: AppColors.terracotta,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(height: 12),
            _QuotaRow(
              icon: Icons.auto_stories,
              label: 'Bản thảo truyện',
              value: 'Hôm nay còn $storyRemaining/$storyLimit',
              highlight: storyRemaining <= 0,
            ),
            const Divider(height: 20),
            _QuotaRow(
              icon: Icons.lightbulb_outline,
              label: 'Gợi ý kịch bản',
              value: suggestRemaining != null
                  ? 'Còn $suggestRemaining/$suggestLimit lượt/ngày'
                  : '10 lượt gợi ý kịch bản/ngày',
              highlight: suggestRemaining != null && suggestRemaining <= 0,
            ),
          ],
        ),
      ),
    );
  }
}

class _QuotaRow extends StatelessWidget {
  const _QuotaRow({
    required this.icon,
    required this.label,
    required this.value,
    this.highlight = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(
          icon,
          size: 20,
          color: highlight ? AppColors.danger : AppColors.muted,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 2),
              Text(
                value,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: highlight ? AppColors.danger : AppColors.meta,
                  fontWeight: highlight ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Slider extends StatelessWidget {
  const _Slider({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  final String label;
  final double value;
  final double min;
  final double max;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$label: ${value.toStringAsFixed(2)}'),
        Slider(
          value: value.clamp(min, max),
          min: min,
          max: max,
          onChanged: onChanged,
        ),
      ],
    );
  }
}
