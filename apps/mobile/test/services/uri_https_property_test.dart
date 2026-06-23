// Property-based test: mọi URI gọi API đều dùng HTTPS (Req 1.8).
//
// Feature: flutter-drama-mobile-app, Property 3: Mọi URI gọi API đều dùng HTTPS

import 'package:glados/glados.dart';

import 'package:drama15_mobile/services/api_client.dart';
import 'package:drama15_mobile/services/sse_client.dart';

void main() {
  final baseUrlGen = any.combine2<String, String, String>(
    any.choose<String>(<String>['https', 'http', 'ftp', 'ws']),
    any.nonEmptyLowercaseLetters,
    (scheme, host) => '$scheme://$host.com',
  );
  final segGen = any.nonEmptyLowercaseLetters;

  Glados3<String, String, String>(
    baseUrlGen,
    segGen, // path segment
    segGen, // storyId
    ExploreConfig(numRuns: 100),
  ).test('buildUri và buildStreamUri luôn cho scheme https', (
    baseUrl,
    seg,
    id,
  ) {
    final uri = ApiClient.buildUri(baseUrl, '/$seg');
    expect(uri.scheme, 'https');

    final streamUri = SseClient.buildStreamUri(baseUrl, id, 'token_$id');
    expect(streamUri.scheme, 'https');
  });
}
