// Property-based test: SseParser.parseFrame an toàn trước đầu vào bất thường
// (Req 6.3, 6.4).
//
// Feature: flutter-drama-mobile-app, Property 10: SseParser.parseFrame an toàn trước đầu vào bất thường

import 'dart:convert';

import 'package:glados/glados.dart';

import 'package:drama15_mobile/models/stream_event.dart';
import 'package:drama15_mobile/services/sse_client.dart';

void main() {
  final garbageGen = any.letters; // chuỗi tùy ý, thường không phải JSON object
  final badStageGen = any.lowercaseLetters;

  Glados2<String, String>(
    garbageGen,
    badStageGen,
    ExploreConfig(numRuns: 100),
  ).test('JSON lỗi hoặc stage lạ → trả null, không ném ngoại lệ', (
    garbage,
    badStage,
  ) {
    // (a) JSON không hợp lệ / không phải object có stage hợp lệ.
    expect(SseParser.parseFrame('data: $garbage'), isNull);

    // (b) JSON hợp lệ nhưng stage không thuộc tập hợp lệ.
    final stage = 'x_$badStage'; // bảo đảm không trùng stage hợp lệ
    assert(!kValidStages.contains(stage));
    final frame = 'data: ${jsonEncode(<String, dynamic>{'stage': stage})}';
    expect(SseParser.parseFrame(frame), isNull);
  });
}
