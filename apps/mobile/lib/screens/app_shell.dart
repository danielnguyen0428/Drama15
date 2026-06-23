/// Khung điều hướng chính với BottomNavigationBar 3 tab (Req 14.2, 14.3).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../config/providers.dart';
import 'config_screen.dart';
import 'auth_screen.dart';
import 'library_screen.dart';
import 'settings_screen.dart';
import 'story_workspace_screen.dart';

/// Shell 3 tab: Cấu hình, Bản thảo, Tủ truyện.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  int _index = 0;

  void _goTo(int index) => setState(() => _index = index);

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(appStringsProvider);
    final pages = <Widget>[
      ConfigScreen(onGenerate: () => _goTo(1)),
      const StoryWorkspaceScreen(),
      LibraryScreen(
        onOpenReader: (storyId) => context.push('/reader/$storyId'),
      ),
      const AuthScreen(),
      const SettingsScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: _goTo,
        items: [
          BottomNavigationBarItem(
            icon: const Icon(Icons.edit_note),
            label: s.navInit,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.auto_stories),
            label: s.navDraft,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.library_books),
            label: s.navLibrary,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.account_circle),
            label: s.navAccount,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.settings_outlined),
            label: s.navSettings,
          ),
        ],
      ),
    );
  }
}
