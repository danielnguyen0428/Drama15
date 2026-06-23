/// Màn hình tủ truyện (Req 8, 9.2, 16.6).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/providers.dart';
import '../controllers/library_controller.dart';
import '../controllers/offline_controller.dart';
import '../i18n/app_strings.dart';
import '../logic/story_logic.dart';
import '../models/offline_download.dart';
import '../models/story.dart';
import '../theme/app_theme.dart';

/// Liệt kê truyện đã lưu kèm trạng thái + thao tác offline.
class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key, this.onOpenReader});

  /// Mở Reader cho truyện [storyId].
  final void Function(String storyId)? onOpenReader;

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await ref.read(libraryControllerProvider.notifier).load();
      final stories = ref.read(libraryControllerProvider).stories;
      await ref
          .read(offlineControllerProvider.notifier)
          .checkForUpdates(stories);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(libraryControllerProvider);
    final offline = ref.watch(offlineControllerProvider);
    final libCtrl = ref.read(libraryControllerProvider.notifier);
    final offCtrl = ref.read(offlineControllerProvider.notifier);
    final s = ref.watch(appStringsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(s.libraryTitle),
        actions: [
          IconButton(onPressed: libCtrl.load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: state.loading
          ? const Center(child: CircularProgressIndicator())
          : state.stories.isEmpty
          ? Center(child: Text(s.libraryEmpty))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: state.stories.length,
              itemBuilder: (context, i) {
                final story = state.stories[i];
                final status =
                    offline[story.id] ?? OfflineDownloadStatus.notDownloaded;
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    isThreeLine: true,
                    leading: Container(
                      width: 44,
                      height: 60,
                      decoration: BoxDecoration(
                        color: _statusColor(
                          context,
                          story.status,
                        ).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                        border: Border(
                          left: BorderSide(
                            color: _statusColor(context, story.status),
                            width: 3,
                          ),
                        ),
                      ),
                      child: Icon(
                        Icons.menu_book_outlined,
                        color: _statusColor(context, story.status),
                        size: 22,
                      ),
                    ),
                    title: Text(
                      story.title,
                      style: Theme.of(
                        context,
                      ).textTheme.titleLarge?.copyWith(fontSize: 17),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Text(
                          '${s.statusLabel(story.status)} · '
                          '${s.storyChapterCount(story.chapterCount, totalChapters)}',
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Icon(
                              _offlineIcon(status),
                              size: 14,
                              color: Theme.of(context).colorScheme.secondary,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              s.offlineStatusLabel(status),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ],
                    ),
                    onTap: () {
                      libCtrl.open(story.id);
                      widget.onOpenReader?.call(story.id);
                    },
                    trailing: _StoryMenu(
                      story: story,
                      status: status,
                      strings: s,
                      onRename: (t) => libCtrl.rename(story.id, t),
                      onDelete: () => libCtrl.delete(story.id),
                      onDownload: () => offCtrl.downloadStory(story.id),
                      onRefresh: () => offCtrl.refreshStory(story.id),
                      onRemoveDownload: () => offCtrl.deleteDownload(story.id),
                    ),
                  ),
                );
              },
            ),
    );
  }

  static IconData _offlineIcon(OfflineDownloadStatus status) {
    switch (status) {
      case OfflineDownloadStatus.notDownloaded:
        return Icons.cloud_outlined;
      case OfflineDownloadStatus.downloading:
        return Icons.downloading;
      case OfflineDownloadStatus.downloaded:
        return Icons.offline_pin;
      case OfflineDownloadStatus.updateAvailable:
        return Icons.cloud_sync;
    }
  }

  static Color _statusColor(BuildContext context, StoryStatus status) {
    switch (status) {
      case StoryStatus.completed:
        return AppColors.success;
      case StoryStatus.running:
        return AppColors.terracotta;
      case StoryStatus.queued:
        return AppColors.meta;
      case StoryStatus.failed:
        return AppColors.danger;
    }
  }
}

class _StoryMenu extends StatelessWidget {
  const _StoryMenu({
    required this.story,
    required this.status,
    required this.strings,
    required this.onRename,
    required this.onDelete,
    required this.onDownload,
    required this.onRefresh,
    required this.onRemoveDownload,
  });

  final SavedStory story;
  final OfflineDownloadStatus status;
  final AppStrings strings;
  final ValueChanged<String> onRename;
  final VoidCallback onDelete;
  final VoidCallback onDownload;
  final VoidCallback onRefresh;
  final VoidCallback onRemoveDownload;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      onSelected: (value) async {
        switch (value) {
          case 'rename':
            final title = await _promptTitle(context, story.title);
            if (title != null && title.trim().isNotEmpty) onRename(title);
          case 'delete':
            onDelete();
          case 'resume':
            break;
          case 'download':
            onDownload();
          case 'refresh':
            onRefresh();
          case 'remove-download':
            onRemoveDownload();
        }
      },
      itemBuilder: (context) => [
        PopupMenuItem(value: 'rename', child: Text(strings.rename)),
        PopupMenuItem(value: 'delete', child: Text(strings.delete)),
        if (canResumeStory(story))
          PopupMenuItem(
            value: 'resume',
            child: Text(strings.resumeStory),
          ),
        if (status == OfflineDownloadStatus.notDownloaded)
          PopupMenuItem(
            value: 'download',
            child: Text(strings.downloadOffline),
          ),
        if (status == OfflineDownloadStatus.updateAvailable)
          PopupMenuItem(
            value: 'refresh',
            child: Text(strings.refreshDownload),
          ),
        if (status == OfflineDownloadStatus.downloaded ||
            status == OfflineDownloadStatus.updateAvailable)
          PopupMenuItem(
            value: 'remove-download',
            child: Text(strings.removeDownload),
          ),
      ],
    );
  }

  Future<String?> _promptTitle(BuildContext context, String current) {
    final controller = TextEditingController(text: current);
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(strings.renameStoryTitle),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(strings.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: Text(strings.save),
          ),
        ],
      ),
    );
  }
}
