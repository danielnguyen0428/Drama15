// Property-based test: ánh xạ tiến độ ↔ chỉ số trang ổn định (Req 17.13).
//
// Feature: flutter-drama-mobile-app, Property 20: Ánh xạ tiến độ ↔ chỉ số trang ổn định

import 'package:glados/glados.dart';

import 'package:drama15_mobile/logic/paginator.dart';

void main() {
  final pageCountGen = any.intInRange(1, 50);

  Glados<int>(pageCountGen, ExploreConfig(numRuns: 100)).test(
    'progressToPageIndex(pageIndexToProgress(i)) == i với mọi trang hợp lệ',
    (pageCount) {
      for (var i = 0; i < pageCount; i++) {
        final progress = Paginator.pageIndexToProgress(i, pageCount);
        expect(progress, inInclusiveRange(0, 1));
        final back = Paginator.progressToPageIndex(progress, pageCount);
        expect(back, i);
      }
    },
  );
}
