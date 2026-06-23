import 'package:flutter_test/flutter_test.dart';

import 'package:drama15_mobile/i18n/app_strings.dart';
import 'package:drama15_mobile/models/story_config.dart';

void main() {
  test('UI tiếng Việt khi outputLanguage = vietnamese', () {
    final s = AppStrings.forLanguage(OutputLanguage.vietnamese);
    expect(s.navInit, 'Khởi tạo');
    expect(s.writeDraftButton, 'Viết bản thảo');
    expect(s.outputLanguageOption(OutputLanguage.english), 'Tiếng Anh');
  });

  test('UI tiếng Anh khi outputLanguage = english', () {
    final s = AppStrings.forLanguage(OutputLanguage.english);
    expect(s.navInit, 'Setup');
    expect(s.writeDraftButton, 'Write manuscript');
    expect(s.outputLanguageOption(OutputLanguage.vietnamese), 'Vietnamese');
    expect(s.tabChapters, 'Chapters');
    expect(s.nicheLabel('custom'), 'Custom niche');
  });

  test('Các ngôn ngữ khác dùng UI tiếng Anh', () {
    final s = AppStrings.forLanguage(OutputLanguage.japanese);
    expect(s.navLibrary, 'Library');
    expect(s.signInGoogle, 'Sign in with Google');
  });
}
