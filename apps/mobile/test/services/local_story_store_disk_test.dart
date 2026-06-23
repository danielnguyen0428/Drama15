// Integration test cho LocalStoryStore thật trên đĩa (Req 16.4, 16.5, 16.11).
//
// Dùng thư mục tạm thật (dart:io) để kiểm chứng ghi atomic (không để lại tệp
// .tmp), khứ hồi lưu/nạp, xóa và liệt kê metadata.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:drama15_mobile/models/offline_download.dart';
import 'package:drama15_mobile/models/story_payload.dart';
import 'package:drama15_mobile/services/local_story_store.dart';

OfflineDownload _sample(String id) {
  return OfflineDownload(
    storyId: id,
    title: 'Truyện $id',
    updatedAt: '2024-06-01T00:00:00.000Z',
    payload: StoryPayload(
      title: 'Truyện $id',
      concept: const Concept(logline: 'l', promise: 'p', conflictEngine: 'c'),
      storyBible: const {'note': 'x'},
      chapterPlan: const <ChapterPlanItem>[],
      chapters: const [
        Chapter(index: 0, title: 'C0', content: 'noi dung 0'),
        Chapter(index: 1, title: 'C1', content: 'noi dung 1'),
      ],
    ),
  );
}

void main() {
  late Directory tempDir;
  late FileLocalStoryStore store;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('offline_stories_test');
    store = FileLocalStoryStore(baseDirectory: tempDir);
  });

  tearDown(() async {
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  test(
    'save → load khứ hồi nhan đề và chương theo index tăng (Req 16.11)',
    () async {
      final download = _sample('s1');
      await store.save(download);

      final loaded = await store.load('s1');
      expect(loaded, isNotNull);
      expect(loaded!.title, download.title);
      expect(loaded.payload.title, download.payload.title);
      expect(loaded.payload.chapters, download.payload.chapters);
    },
  );

  test('save không để lại tệp .tmp (atomic rename — Req 16.4)', () async {
    await store.save(_sample('s2'));
    final dir = Directory('${tempDir.path}/offline_stories');
    final tmps = dir
        .listSync()
        .whereType<File>()
        .where((f) => f.path.endsWith('.tmp'))
        .toList();
    expect(tmps, isEmpty);
  });

  test('delete xóa bản tải; load trả null (Req 16.7)', () async {
    await store.save(_sample('s3'));
    expect(await store.load('s3'), isNotNull);
    await store.delete('s3');
    expect(await store.load('s3'), isNull);
  });

  test('delete không tồn tại là no-op', () async {
    await store.delete('khong-co');
    expect(await store.load('khong-co'), isNull);
  });

  test('list trả metadata các bản đã lưu (Req 16.8)', () async {
    await store.save(_sample('a'));
    await store.save(_sample('b'));
    final metas = await store.list();
    expect(metas.map((m) => m.storyId).toSet(), {'a', 'b'});
  });
}
