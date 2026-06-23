// Property-based test cho `validateHttpsUrl` (Req 1.1, 1.2).
//
// Feature: flutter-drama-mobile-app, Property 1: validateHttpsUrl chỉ chấp nhận URL HTTPS hợp lệ

import 'package:glados/glados.dart';

import 'package:drama15_mobile/config/app_config.dart';

void main() {
  // Tập scheme đại diện: chỉ 'https' mới được chấp nhận.
  final schemeGen = any.choose<String>(<String>[
    'https',
    'http',
    'ftp',
    'ws',
    'wss',
    'file',
    '',
  ]);
  // Host không rỗng (chuỗi chữ thường).
  final hostGen = any.nonEmptyLowercaseLetters;

  Glados2<String, String>(schemeGen, hostGen, ExploreConfig(numRuns: 100)).test(
    'validateHttpsUrl đúng khi và chỉ khi scheme là https và có host',
    (scheme, host) {
      final url = '$scheme://$host';
      expect(validateHttpsUrl(url), scheme == 'https');
    },
  );
}
