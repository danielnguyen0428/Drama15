// Property-based test cho `AppConfig.validate` (Req 1.5, 1.7, 1.9).
//
// Feature: flutter-drama-mobile-app, Property 2: AppConfig hợp lệ khi và chỉ khi cả ba giá trị hợp lệ

import 'package:glados/glados.dart';

import 'package:drama15_mobile/config/app_config.dart';

void main() {
  // Sinh một URL hợp lệ (https) hoặc không hợp lệ (scheme khác) tùy cờ.
  final urlGen = any.combine2<bool, String, String>(
    any.bool,
    any.nonEmptyLowercaseLetters,
    (valid, host) => valid ? 'https://$host.com' : 'ftp://$host',
  );
  // Sinh anon key: rỗng (không hợp lệ) hoặc không rỗng (hợp lệ) tùy cờ.
  final keyGen = any.combine2<bool, String, String>(
    any.bool,
    any.lowercaseLetters,
    (nonEmpty, s) => nonEmpty ? 'key_$s' : '   ',
  );

  Glados3<String, String, String>(
    urlGen,
    urlGen,
    keyGen,
    ExploreConfig(numRuns: 100),
  ).test('isValid và invalidKeys phản ánh đúng tính hợp lệ của ba giá trị', (
    apiBaseUrl,
    supabaseUrl,
    anonKey,
  ) {
    final config = AppConfig(
      apiBaseUrl: apiBaseUrl,
      supabaseUrl: supabaseUrl,
      supabaseAnonKey: anonKey,
    );
    final validation = config.validate();

    final apiOk = validateHttpsUrl(apiBaseUrl);
    final supaOk = validateHttpsUrl(supabaseUrl);
    final keyOk = anonKey.trim().isNotEmpty;

    expect(validation.isValid, apiOk && supaOk && keyOk);
    expect(config.isValid, apiOk && supaOk && keyOk);

    final expectedInvalid = <String>{
      if (!apiOk) ConfigKeys.apiBaseUrl,
      if (!supaOk) ConfigKeys.supabaseUrl,
      if (!keyOk) ConfigKeys.supabaseAnonKey,
    };
    expect(validation.invalidKeys.toSet(), expectedInvalid);
  });
}
