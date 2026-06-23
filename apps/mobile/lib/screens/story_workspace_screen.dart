/// Màn hình bản thảo: 5 thẻ nội dung + viết lại + tiến độ SSE streaming (Req
/// 5.10, 5.11, 10.1, 10.2).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/providers.dart';
import '../controllers/generation_controller.dart';
import '../controllers/rewrite_controller.dart';
import '../i18n/app_strings.dart';
import '../logic/story_logic.dart';
import '../logic/stream_reducer.dart';
import '../models/rewrite.dart';

/// Hiển thị tiến trình sinh truyện và nội dung qua 5 thẻ.
class StoryWorkspaceScreen extends ConsumerWidget {
  const StoryWorkspaceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(generationControllerProvider);
    final s = ref.watch(appStringsProvider);

    return DefaultTabController(
      length: 5,
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            state.title.isEmpty ? s.workspaceTitle : state.title,
          ),
          bottom: TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: s.tabChapters),
              Tab(text: s.tabConcept),
              Tab(text: s.tabPlan),
              Tab(text: s.tabBible),
              Tab(text: s.tabRelationships),
            ],
          ),
        ),
        body: Column(
          children: [
            if (state.phase == GenerationPhase.running)
              _ProgressBanner(state: state, strings: s),
            if (state.phase == GenerationPhase.needsRetry &&
                state.errorMessage != null)
              _ErrorBanner(message: state.errorMessage!),
            Expanded(
              child: TabBarView(
                children: [
                  const _ChaptersTab(),
                  _TextTab(text: state.concept, empty: s.emptyConcept),
                  _TextTab(text: state.plan, empty: s.emptyPlan),
                  _TextTab(
                    text: state.storyBible?.toString() ?? '',
                    empty: s.emptyBible,
                  ),
                  _TextTab(
                    text: state.relationshipGraph?.toString() ?? '',
                    empty: s.emptyRelationships,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Banner tiến độ trực quan: vòng quay + thanh tiến độ mượt + % + số chương.
class _ProgressBanner extends StatelessWidget {
  const _ProgressBanner({required this.state, required this.strings});

  final StoryWorkspaceState state;
  final AppStrings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final percent = state.progressPercent / 100;
    final written = state.chapters.length;
    return Card(
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2.4),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    state.progressLabel.isEmpty
                        ? strings.writingDraft
                        : state.progressLabel,
                    style: theme.textTheme.titleSmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            TweenAnimationBuilder<double>(
              tween: Tween(
                begin: 0,
                end: state.progressTotal > 0 ? percent : null,
              ),
              duration: const Duration(milliseconds: 400),
              builder: (context, value, _) => ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: state.progressTotal > 0 ? value : null,
                  minHeight: 8,
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              state.progressTotal > 0
                  ? strings.progressChapters(
                      state.progressPercent.round(),
                      written,
                      totalChapters,
                    )
                  : strings.initializing,
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.errorContainer.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber_rounded, color: scheme.error, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text(message)),
        ],
      ),
    );
  }
}

class _ChaptersTab extends ConsumerStatefulWidget {
  const _ChaptersTab();

  @override
  ConsumerState<_ChaptersTab> createState() => _ChaptersTabState();
}

class _ChaptersTabState extends ConsumerState<_ChaptersTab> {
  final _scroll = ScrollController();
  int _lastCount = 0;

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(generationControllerProvider);
    final s = ref.watch(appStringsProvider);
    final running = state.phase == GenerationPhase.running;
    final completed = state.phase == GenerationPhase.completed;

    if (state.chapters.length != _lastCount) {
      _lastCount = state.chapters.length;
      if (running) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scroll.hasClients) {
            _scroll.animateTo(
              _scroll.position.maxScrollExtent,
              duration: const Duration(milliseconds: 350),
              curve: Curves.easeOut,
            );
          }
        });
      }
    }

    if (state.chapters.isEmpty) {
      return Center(
        child: Text(
          running ? s.preparingFirstChapter : s.noChaptersYet,
        ),
      );
    }

    final storyId = ref.read(generationControllerProvider.notifier).storyId;

    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(16),
      itemCount: state.chapters.length + (running ? 1 : 0),
      itemBuilder: (context, i) {
        if (i >= state.chapters.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: 10),
                Text(s.writingNextChapter),
              ],
            ),
          );
        }
        final chapter = state.chapters[i];
        final isLatest = running && i == state.chapters.length - 1;
        return Card(
          color: isLatest
              ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.06)
              : null,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  s.chapterHeading(chapter.index, chapter.title),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(chapter.content),
                if (completed) ...[
                  const Divider(),
                  _RewritePanel(
                    storyId: storyId,
                    chapterIndex: chapter.index,
                    strings: s,
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _RewritePanel extends ConsumerWidget {
  const _RewritePanel({
    this.storyId,
    required this.chapterIndex,
    required this.strings,
  });

  final String? storyId;
  final int chapterIndex;
  final AppStrings strings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(rewriteControllerProvider);
    final controller = ref.read(rewriteControllerProvider.notifier);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButton<RewriteMode>(
          value: state.mode,
          isExpanded: true,
          items: [
            for (final m in RewriteMode.values)
              DropdownMenuItem(
                value: m,
                child: Text(strings.rewriteModeLabel(m)),
              ),
          ],
          onChanged: (m) {
            if (m != null) controller.selectMode(m);
          },
        ),
        TextField(
          key: Key('rewrite-instruction-$chapterIndex'),
          decoration: InputDecoration(labelText: strings.rewriteInstructionLabel),
          onChanged: controller.setInstruction,
        ),
        const SizedBox(height: 8),
        FilledButton(
          key: Key('rewrite-submit-$chapterIndex'),
          onPressed: (state.canSubmit && storyId != null)
              ? () => controller.submit(storyId!, chapterIndex)
              : null,
          child: Text(
            state.submitting ? strings.rewriting : strings.rewriteChapter,
          ),
        ),
      ],
    );
  }
}

class _TextTab extends StatelessWidget {
  const _TextTab({required this.text, required this.empty});

  final String text;
  final String empty;

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) {
      return Center(child: Text(empty));
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Text(text),
    );
  }
}
