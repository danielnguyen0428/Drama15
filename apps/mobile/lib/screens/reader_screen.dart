/// Trình đọc kiểu Apple Books: scroll + paged (Req 11, 12, 17).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/providers.dart';
import '../config/providers.dart';
import '../controllers/library_controller.dart';
import '../controllers/offline_controller.dart';
import '../controllers/reader_controller.dart';
import '../logic/paginator.dart';
import '../i18n/app_strings.dart';
import '../models/offline_download.dart';
import '../models/reading.dart';
import '../models/story_payload.dart';
import '../theme/app_theme.dart';

/// Hiển thị nội dung chương với điều khiển kiểu chữ, chủ đề, mục lục, tiến độ.
class ReaderScreen extends ConsumerStatefulWidget {
  const ReaderScreen({super.key, required this.storyId});

  final String storyId;

  @override
  ConsumerState<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends ConsumerState<ReaderScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final status = ref
        .read(offlineControllerProvider.notifier)
        .statusOf(widget.storyId);
    List<Chapter> chapters = const <Chapter>[];
    if (status == OfflineDownloadStatus.downloaded) {
      final offline = await ref
          .read(offlineRepositoryProvider)
          .loadOffline(widget.storyId);
      chapters = offline?.payload.chapters ?? const <Chapter>[];
    }
    if (chapters.isEmpty) {
      final opened = ref.read(libraryControllerProvider).openedStory;
      chapters = opened?.storyPayload?.chapters ?? const <Chapter>[];
    }
    await ref
        .read(readerControllerProvider.notifier)
        .openStory(widget.storyId, chapters);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(readerControllerProvider);
    final controller = ref.read(readerControllerProvider.notifier);
    final palette = ReaderPalette.byName(state.settings.theme.name);
    final chapter = state.currentChapter;
    final s = ref.watch(appStringsProvider);

    return Scaffold(
      backgroundColor: palette.background,
      appBar: AppBar(
        backgroundColor: palette.surface,
        title: Text(
          s.readerChapterPos(
            state.currentChapterPos + 1,
            state.chapters.length,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.list),
            onPressed: () => _showToc(context, state, controller, s),
          ),
          IconButton(
            icon: const Icon(Icons.text_fields),
            onPressed: () => _showSettings(context, s),
          ),
        ],
      ),
      body: chapter == null
          ? Center(child: Text(s.noContent))
          : LayoutBuilder(
              builder: (context, constraints) {
                final viewport = Size(
                  constraints.maxWidth - 32,
                  constraints.maxHeight - 32,
                );
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (state.settings.mode == ReadingMode.paged) {
                    controller.recomputePages(viewport);
                  }
                });
                return Opacity(
                  opacity: state.settings.brightness.clamp(0.2, 1.0),
                  child: state.settings.mode == ReadingMode.scroll
                      ? _ScrollView(palette: palette)
                      : _PagedView(palette: palette, viewport: viewport),
                );
              },
            ),
      bottomNavigationBar: BottomAppBar(
        color: palette.surface,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(
              icon: const Icon(Icons.chevron_left),
              onPressed: state.canPrevChapter ? controller.prevChapter : null,
            ),
            Text('${state.progressPercentValue.round()}%'),
            IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: state.canNextChapter ? controller.nextChapter : null,
            ),
          ],
        ),
      ),
    );
  }

  void _showToc(
    BuildContext context,
    ReaderState state,
    ReaderController controller,
    AppStrings s,
  ) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => ListView(
        children: [
          for (var i = 0; i < state.chapters.length; i++)
            ListTile(
              title: Text(
                s.chapterHeading(
                  state.chapters[i].index,
                  state.chapters[i].title,
                ),
              ),
              selected: i == state.currentChapterPos,
              onTap: () {
                controller.goToChapter(i);
                Navigator.pop(context);
              },
            ),
        ],
      ),
    );
  }

  void _showSettings(BuildContext context, AppStrings s) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => _SettingsPanel(strings: s),
    );
  }
}

class _ScrollView extends ConsumerWidget {
  const _ScrollView({required this.palette});
  final ReaderPalette palette;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(readerControllerProvider);
    final chapter = state.currentChapter!;
    final s = ref.watch(appStringsProvider);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            s.chapterHeading(chapter.index, chapter.title),
            style: AppFonts.serif(fontSize: 22, color: palette.text),
          ),
          const SizedBox(height: 12),
          Text(
            chapter.content,
            style: Paginator.styleFor(
              state.settings,
            ).copyWith(color: palette.text),
          ),
        ],
      ),
    );
  }
}

class _PagedView extends ConsumerWidget {
  const _PagedView({required this.palette, required this.viewport});
  final ReaderPalette palette;
  final Size viewport;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(readerControllerProvider);
    final controller = ref.read(readerControllerProvider.notifier);
    final chapter = state.currentChapter!;
    if (state.pages.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    final page =
        state.pages[state.currentPageIndex.clamp(0, state.pages.length - 1)];
    final text = chapter.content.substring(
      page.startOffset.clamp(0, chapter.content.length),
      page.endOffset.clamp(0, chapter.content.length),
    );
    return GestureDetector(
      onTapUp: (details) {
        final width = MediaQuery.of(context).size.width;
        if (details.globalPosition.dx > width / 2) {
          controller.nextPage();
        } else {
          controller.prevPage();
        }
      },
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          text,
          style: Paginator.styleFor(
            state.settings,
          ).copyWith(color: palette.text),
        ),
      ),
    );
  }
}

class _SettingsPanel extends ConsumerWidget {
  const _SettingsPanel({required this.strings});

  final AppStrings strings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(readerControllerProvider);
    final controller = ref.read(readerControllerProvider.notifier);
    final settings = state.settings;
    final s = strings;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s.fontSizeLabel),
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.remove),
                onPressed: () {
                  final i = kReaderFontSizeSteps.indexOf(settings.fontSize);
                  if (i > 0) {
                    controller.updateSettings(
                      settings.copyWith(fontSize: kReaderFontSizeSteps[i - 1]),
                    );
                  }
                },
              ),
              Text('${settings.fontSize.round()}'),
              IconButton(
                icon: const Icon(Icons.add),
                onPressed: () {
                  final i = kReaderFontSizeSteps.indexOf(settings.fontSize);
                  if (i >= 0 && i < kReaderFontSizeSteps.length - 1) {
                    controller.updateSettings(
                      settings.copyWith(fontSize: kReaderFontSizeSteps[i + 1]),
                    );
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(s.themeLabel),
          Wrap(
            spacing: 8,
            children: [
              for (final t in ReaderTheme.values)
                ChoiceChip(
                  label: Text(s.readerThemeLabel(t.name)),
                  selected: settings.theme == t,
                  onSelected: (_) =>
                      controller.updateSettings(settings.copyWith(theme: t)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(s.fontFamilyLabel),
          Wrap(
            spacing: 8,
            children: [
              for (final f in ReaderFontFamily.values)
                ChoiceChip(
                  label: Text(
                    f == ReaderFontFamily.serif ? s.serifFont : s.sansFont,
                  ),
                  selected: settings.fontFamily == f,
                  onSelected: (_) => controller.updateSettings(
                    settings.copyWith(fontFamily: f),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(s.brightnessLabel),
          Slider(
            value: settings.brightness,
            onChanged: (v) =>
                controller.updateSettings(settings.copyWith(brightness: v)),
          ),
          const SizedBox(height: 8),
          Text(s.readingModeLabel),
          Wrap(
            spacing: 8,
            children: [
              for (final m in ReadingMode.values)
                ChoiceChip(
                  label: Text(m == ReadingMode.paged ? s.pagedMode : s.scrollMode),
                  selected: settings.mode == m,
                  onSelected: (_) => controller.setReadingMode(m),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
