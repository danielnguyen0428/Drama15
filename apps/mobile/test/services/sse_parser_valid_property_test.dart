// Property-based test: SseParser.parseFrame trả đúng loại với đầu vào hợp lệ
// (Req 6.1, 6.2).
//
// Feature: flutter-drama-mobile-app, Property 9: SseParser.parseFrame trả đúng loại với đầu vào hợp lệ

import 'dart:convert';

import 'package:glados/glados.dart';

import 'package:drama15_mobile/models/stream_event.dart';
import 'package:drama15_mobile/services/sse_client.dart';

void main() {
  final stageGen = any.choose<String>(kValidStages.toList());
  final intGen = any.intInRange(0, 100);
  final strGen = any.lowercaseLetters;

  Glados3<String, int, String>(
    stageGen,
    intGen,
    strGen,
    ExploreConfig(numRuns: 100),
  ).test('mỗi stage hợp lệ cho ra đúng biến thể StreamEvent với stage khớp', (
    stage,
    n,
    s,
  ) {
    final json = _buildJsonForStage(stage, n, s);
    final frame = 'data: ${jsonEncode(json)}';
    final event = SseParser.parseFrame(frame);

    expect(event, isNotNull);
    expect(event!.stage, stage);

    switch (stage) {
      case 'progress':
        expect(event, isA<ProgressEvent>());
      case 'overview':
        expect(event, isA<OverviewEvent>());
      case 'bible':
        expect(event, isA<BibleEvent>());
      case 'plan':
        expect(event, isA<PlanEvent>());
      case 'relationshipGraph':
        expect(event, isA<RelationshipGraphEvent>());
      case 'chapter':
        expect(event, isA<ChapterEvent>());
      case 'done':
        expect(event, isA<DoneEvent>());
      case 'error':
        expect(event, isA<StreamErrorEvent>());
    }
  });
}

Map<String, dynamic> _buildJsonForStage(String stage, int n, String s) {
  switch (stage) {
    case 'progress':
      return {'stage': stage, 'current': n, 'total': n + 1, 'label': s};
    case 'overview':
      return {'stage': stage, 'title': s, 'concept': s};
    case 'bible':
      return {
        'stage': stage,
        'bible': {'note': s},
      };
    case 'plan':
      return {'stage': stage, 'plan': s};
    case 'relationshipGraph':
      return {
        'stage': stage,
        'relationshipGraph': {'nodes': <dynamic>[], 'edges': <dynamic>[]},
      };
    case 'chapter':
      return {
        'stage': stage,
        'chapter': {'index': n, 'title': s, 'content': s},
      };
    case 'done':
      return {'stage': stage, 'title': s};
    case 'error':
      return {'stage': stage, 'error': s};
    default:
      return {'stage': stage};
  }
}
