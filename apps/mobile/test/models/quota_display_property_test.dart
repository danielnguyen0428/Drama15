// Property-based test cho `QuotaSnapshot.display` (Req 7.1).
//
// Feature: flutter-drama-mobile-app, Property 11: Hiển thị hạn mức đúng định dạng

import 'package:glados/glados.dart';

import 'package:drama15_mobile/models/quota.dart';

void main() {
  Glados2<int, int>(
    any.intInRange(0, 1000),
    any.intInRange(0, 1000),
    ExploreConfig(numRuns: 100),
  ).test('display luôn theo định dạng "còn {remaining}/{limit}"', (
    remaining,
    limit,
  ) {
    final quota = QuotaSnapshot(remaining: remaining, limit: limit);
    expect(quota.display, 'còn $remaining/$limit');
  });
}
