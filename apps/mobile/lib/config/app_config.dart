import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Tên các khóa cấu hình được nhúng lúc build qua `--dart-define`.
///
/// Dùng làm phần tử của [ConfigValidation.invalidKeys] để màn hình lỗi cấu
/// hình có thể nêu rõ khóa nào không sử dụng được (Req 1.5).
class ConfigKeys {
  ConfigKeys._();

  static const String apiBaseUrl = 'API_BASE_URL';
  static const String supabaseUrl = 'SUPABASE_URL';
  static const String supabaseAnonKey = 'SUPABASE_ANON_KEY';
}

/// Giá trị mặc định của [AppConfig.apiBaseUrl] cho bản phát hành production
/// khi không có giá trị `--dart-define API_BASE_URL` (Req 1.1).
const String kDefaultApiBaseUrl = 'https://drama-api.novelkit.cc';

/// Hàm thuần kiểm tra một chuỗi có phải URL **HTTPS hợp lệ** hay không.
///
/// Quy tắc (Req 1.1, 1.2): parse được bằng [Uri.tryParse], có `scheme == 'https'`
/// và `host` không rỗng. Không có tác dụng phụ — dễ property test.
bool validateHttpsUrl(String value) {
  final uri = Uri.tryParse(value);
  if (uri == null) {
    return false;
  }
  return uri.scheme == 'https' && uri.host.isNotEmpty;
}

/// Kết quả kiểm tra cấu hình: danh sách các khóa không hợp lệ.
///
/// [isValid] đúng khi và chỉ khi không có khóa nào không hợp lệ. Khi không hợp
/// lệ, [invalidKeys] cho biết chính xác khóa nào hỏng để hiển thị thông báo
/// lỗi cấu hình (Req 1.5).
class ConfigValidation {
  const ConfigValidation(this.invalidKeys);

  /// Ví dụ: `['API_BASE_URL']`. Rỗng nghĩa là toàn bộ cấu hình hợp lệ.
  final List<String> invalidKeys;

  bool get isValid => invalidKeys.isEmpty;
}

/// Cấu hình kết nối tới backend và Supabase hiện có (Req 1).
///
/// Đọc ba giá trị nhúng lúc build qua `--dart-define`:
/// - `API_BASE_URL` (mặc định [kDefaultApiBaseUrl])
/// - `SUPABASE_URL`
/// - `SUPABASE_ANON_KEY`
///
/// Constructor mặc định nhận trực tiếp ba giá trị nên dễ unit/property test;
/// factory [AppConfig.fromEnvironment] mới đọc từ môi trường build thực tế.
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    required this.supabaseUrl,
    required this.supabaseAnonKey,
  });

  /// Đọc cấu hình từ các giá trị `--dart-define` nhúng lúc build.
  ///
  /// `API_BASE_URL` mặc định về [kDefaultApiBaseUrl] khi không được cung cấp
  /// (Req 1.1). Hai giá trị Supabase mặc định rỗng để [validate] phát hiện
  /// thiếu cấu hình (Req 1.5).
  factory AppConfig.fromEnvironment() {
    return const AppConfig(
      apiBaseUrl: String.fromEnvironment(
        ConfigKeys.apiBaseUrl,
        defaultValue: kDefaultApiBaseUrl,
      ),
      supabaseUrl: String.fromEnvironment(ConfigKeys.supabaseUrl),
      supabaseAnonKey: String.fromEnvironment(ConfigKeys.supabaseAnonKey),
    );
  }

  /// Địa chỉ API cơ sở (URL HTTPS hợp lệ — Req 1.1).
  final String apiBaseUrl;

  /// URL dự án Supabase (URL HTTPS hợp lệ — Req 1.2).
  final String supabaseUrl;

  /// Khóa ẩn danh (anon key) của Supabase; chỉ cần không rỗng (Req 1.2).
  final String supabaseAnonKey;

  /// Kiểm tra cấu hình và trả về tập khóa không hợp lệ.
  ///
  /// - [apiBaseUrl] và [supabaseUrl] phải là URL HTTPS hợp lệ.
  /// - [supabaseAnonKey] chỉ cần không rỗng (sau khi cắt khoảng trắng).
  ConfigValidation validate() {
    final invalidKeys = <String>[];

    if (!validateHttpsUrl(apiBaseUrl)) {
      invalidKeys.add(ConfigKeys.apiBaseUrl);
    }
    if (!validateHttpsUrl(supabaseUrl)) {
      invalidKeys.add(ConfigKeys.supabaseUrl);
    }
    if (supabaseAnonKey.trim().isEmpty) {
      invalidKeys.add(ConfigKeys.supabaseAnonKey);
    }

    return ConfigValidation(invalidKeys);
  }

  /// `true` khi cả ba giá trị đều hiện diện và hợp lệ (Req 1.7).
  bool get isValid => validate().isValid;
}

/// Cung cấp [AppConfig] đọc từ môi trường build.
///
/// Có thể override trong test bằng cách dùng `ProviderScope(overrides: [...])`.
final appConfigProvider = Provider<AppConfig>((ref) {
  return AppConfig.fromEnvironment();
});

/// Cổng (gate) bool cho mọi thao tác mạng **mới**.
///
/// Khi `false` (cấu hình thiếu/không hợp lệ), tầng mạng chặn yêu cầu mới
/// (Req 1.9); khi `true`, cho phép thao tác tiếp tục (Req 1.7).
final configValidProvider = Provider<bool>((ref) {
  return ref.watch(appConfigProvider).isValid;
});
