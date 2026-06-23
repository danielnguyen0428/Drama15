// Property-based test: progressPercent trong [0,100] và đơn điệu theo vị trí
// (Req 11.7).
//
// Feature: flutter-drama-mobile-app, Property 13: Tiến độ đọc luôn trong [0,100] và đơn điệu theo vị trí

import 'package:glados/glados.dart';

import 'package:drama15_mobile/logic/reader_progress.dart';

void main() {
  // total ≥ 1; với mỗi total, quét tất định các cặp vị trí trên cùng truyện.
  final totalGen = any.intInRange(1, 16);

  Glados<int>(totalGen, ExploreConfig(numRuns: 100)).test(
    'với mọi vị trí: trong [0,100]; vị trí xa hơn cho phần trăm không nhỏ hơn',
    (total) {
      for (var c1 = 0; c1 <= total; c1++) {
        for (final p1 in <double>[0.0, 0.5, 1.0]) {
          final v1 = progressPercent(c1, p1, total);
          expect(v1, inInclusiveRange(0, 100));

          for (var c2 = c1; c2 <= total; c2++) {
            for (final p2 in <double>[0.0, 0.5, 1.0]) {
              final farther = c2 > c1 || (c2 == c1 && p2 >= p1);
              if (!farther) continue;
              final v2 = progressPercent(c2, p2, total);
              expect(
                v2 >= v1,
                isTrue,
                reason: '($c2,$p2) phải ≥ ($c1,$p1) khi xa hơn',
              );
            }
          }
        }
      }
    },
  );
}
