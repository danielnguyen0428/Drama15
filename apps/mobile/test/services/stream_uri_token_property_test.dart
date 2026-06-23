// Property-based test: access_token khứ hồi qua query của stream URI (Req 1.4).
//
// Feature: flutter-drama-mobile-app, Property 4: access_token khứ hồi qua query của stream URI

import 'package:glados/glados.dart';

import 'package:drama15_mobile/services/sse_client.dart';

void main() {
  // Charset kiểu base64url + ký tự đặc biệt thường gặp trong JWT/token.
  const tokenChars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.+/=';
  final tokenGen = any.nonEmptyStringOf(tokenChars);
  final idGen = any.nonEmptyLowercaseLetters;

  Glados2<String, String>(tokenGen, idGen, ExploreConfig(numRuns: 100)).test(
    'queryParameters[access_token] giải mã đúng token đã truyền vào',
    (token, storyId) {
      final uri = SseClient.buildStreamUri(
        'https://drama-api.novelkit.cc',
        storyId,
        token,
      );
      expect(uri.queryParameters['access_token'], token);
    },
  );
}
