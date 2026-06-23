/// Client REST gọi backend hiện có (API_Client — Req 1, 15).
///
/// Trách nhiệm:
/// - Dựng URI **HTTPS** từ `apiBaseUrl` + path tương đối ([ApiClient.buildUri] —
///   Req 1.8).
/// - Gắn header `Authorization: Bearer <token>` cho endpoint cần auth (Req 1.3).
/// - Chặn yêu cầu **mới** khi cấu hình không hợp lệ (Req 1.9) hoặc thiếu token
///   cho endpoint cần auth (Req 1.10).
/// - Chuẩn hóa mọi kết cục thành [ApiSuccess]/[ApiFailure] với ánh xạ lỗi
///   (network/401/429/409/4xx message/5xx/config — Req 15.1, 15.3, 15.4).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'supabase_auth_service.dart';

/// Phân loại lỗi gọi API để tầng trên ánh xạ sang thông điệp tiếng Việt.
enum ApiFailureKind {
  network,
  unauthorized,
  quota,
  validation,
  notFound,
  conflict,
  server,
  config,
}

/// Kết cục chuẩn hóa của một lời gọi API: thành công ([ApiSuccess]) hoặc thất
/// bại ([ApiFailure]).
sealed class ApiResponse<T> {
  const ApiResponse();
}

/// Thành công: mang dữ liệu đã giải mã và mã HTTP.
class ApiSuccess<T> extends ApiResponse<T> {
  const ApiSuccess(this.data, this.httpStatus);

  final T data;
  final int httpStatus;
}

/// Thất bại: phân loại [kind], thông điệp hiển thị, mã lỗi nghiệp vụ ([code]) và
/// mã HTTP (nếu có).
class ApiFailure<T> extends ApiResponse<T> {
  const ApiFailure(this.kind, this.message, {this.code, this.httpStatus});

  final ApiFailureKind kind;
  final String message;
  final String? code;
  final int? httpStatus;

  /// Ép kiểu thất bại sang một tham số kiểu khác (giữ nguyên nội dung).
  ApiFailure<R> cast<R>() =>
      ApiFailure<R>(kind, message, code: code, httpStatus: httpStatus);
}

/// Thông điệp tiếng Việt mặc định cho từng loại lỗi (dùng khi body không có
/// `error.message`). Tầng UI dùng [AppStrings.localizeFailure] để dịch theo ngôn
/// ngữ đầu ra.
String defaultMessageFor(ApiFailureKind kind) {
  switch (kind) {
    case ApiFailureKind.network:
      return 'Mất kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.';
    case ApiFailureKind.unauthorized:
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case ApiFailureKind.quota:
      return 'Bạn đã dùng hết hạn mức trong ngày.';
    case ApiFailureKind.validation:
      return 'Yêu cầu không hợp lệ.';
    case ApiFailureKind.notFound:
      return 'Không tìm thấy nội dung yêu cầu.';
    case ApiFailureKind.conflict:
      return 'Thao tác xung đột với trạng thái hiện tại.';
    case ApiFailureKind.server:
      return 'Máy chủ gặp sự cố. Vui lòng thử lại sau.';
    case ApiFailureKind.config:
      return 'Cấu hình ứng dụng không hợp lệ.';
  }
}

/// Client REST tới backend Drama 15.
class ApiClient {
  ApiClient({
    required AppConfig config,
    required SupabaseAuthService auth,
    required http.Client httpClient,
    required bool Function() isConfigValid,
    Duration timeout = const Duration(seconds: 120),
  }) : _config = config,
       _auth = auth,
       _httpClient = httpClient,
       _isConfigValid = isConfigValid,
       _timeout = timeout;

  final AppConfig _config;
  final SupabaseAuthService _auth;
  final http.Client _httpClient;
  final bool Function() _isConfigValid;
  final Duration _timeout;

  /// Hàm thuần: dựng URI **HTTPS** từ [baseUrl] và [path] tương đối (Req 1.8).
  ///
  /// Luôn ép `scheme = 'https'` bất kể [baseUrl] dùng scheme nào, ghép path của
  /// base với path tương đối (chuẩn hóa dấu `/`).
  static Uri buildUri(String baseUrl, String path) {
    final base = Uri.parse(baseUrl);
    var basePath = base.path;
    if (basePath.endsWith('/')) {
      basePath = basePath.substring(0, basePath.length - 1);
    }
    final rel = path.startsWith('/') ? path : '/$path';
    return base.replace(scheme: 'https', path: '$basePath$rel');
  }

  Future<ApiResponse<T>> get<T>(
    String path, {
    bool authRequired = true,
    T Function(dynamic json)? decode,
  }) {
    return _request<T>('GET', path, authRequired: authRequired, decode: decode);
  }

  Future<ApiResponse<T>> post<T>(
    String path, {
    Object? body,
    bool authRequired = true,
    T Function(dynamic json)? decode,
  }) {
    return _request<T>(
      'POST',
      path,
      body: body,
      authRequired: authRequired,
      decode: decode,
    );
  }

  Future<ApiResponse<T>> patch<T>(
    String path, {
    Object? body,
    T Function(dynamic json)? decode,
  }) {
    return _request<T>('PATCH', path, body: body, decode: decode);
  }

  Future<ApiResponse<void>> delete(String path) {
    return _request<void>('DELETE', path, decode: (_) {});
  }

  Future<ApiResponse<T>> _request<T>(
    String method,
    String path, {
    Object? body,
    bool authRequired = true,
    T Function(dynamic json)? decode,
  }) async {
    // Chặn yêu cầu mới khi cấu hình không hợp lệ (Req 1.9).
    if (!_isConfigValid()) {
      return ApiFailure<T>(
        ApiFailureKind.config,
        defaultMessageFor(ApiFailureKind.config),
      );
    }

    String? token;
    if (authRequired) {
      token = await _auth.currentAccessToken();
      // Không gửi yêu cầu khi thiếu token cho endpoint cần auth (Req 1.10).
      if (token == null) {
        return ApiFailure<T>(
          ApiFailureKind.unauthorized,
          defaultMessageFor(ApiFailureKind.unauthorized),
        );
      }
    }

    final uri = buildUri(_config.apiBaseUrl, path);
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
    final encodedBody = body == null ? null : jsonEncode(body);

    try {
      final http.Response response;
      switch (method) {
        case 'GET':
          response = await _httpClient
              .get(uri, headers: headers)
              .timeout(_timeout);
        case 'POST':
          response = await _httpClient
              .post(uri, headers: headers, body: encodedBody)
              .timeout(_timeout);
        case 'PATCH':
          response = await _httpClient
              .patch(uri, headers: headers, body: encodedBody)
              .timeout(_timeout);
        case 'DELETE':
          response = await _httpClient
              .delete(uri, headers: headers, body: encodedBody)
              .timeout(_timeout);
        default:
          throw ArgumentError('Phương thức HTTP không hỗ trợ: $method');
      }
      return _handleResponse<T>(response, decode);
    } on SocketException catch (e) {
      if (kDebugMode) debugPrint('[API] SocketException $method $path: $e');
      return _networkFailure<T>();
    } on http.ClientException catch (e) {
      if (kDebugMode) debugPrint('[API] ClientException $method $path: $e');
      return _networkFailure<T>();
    } on TimeoutException catch (e) {
      if (kDebugMode) debugPrint('[API] Timeout $method $path: $e');
      return _networkFailure<T>();
    } catch (e) {
      if (kDebugMode) debugPrint('[API] Unknown error $method $path: $e');
      return _networkFailure<T>();
    }
  }

  ApiResponse<T> _handleResponse<T>(
    http.Response response,
    T Function(dynamic json)? decode,
  ) {
    final status = response.statusCode;
    dynamic json;
    if (response.body.isNotEmpty) {
      try {
        json = jsonDecode(response.body);
      } catch (_) {
        json = null;
      }
    }

    if (status >= 200 && status < 300) {
      final data = decode != null ? decode(json) : json as T;
      return ApiSuccess<T>(data, status);
    }

    String? message;
    String? code;
    if (json is Map) {
      final error = json['error'];
      if (error is Map) {
        message = error['message'] is String
            ? error['message'] as String
            : null;
        code = error['code'] is String ? error['code'] as String : null;
      } else if (json['message'] is String) {
        message = json['message'] as String;
      }
    }

    final kind = _kindForStatus(status);
    return ApiFailure<T>(
      kind,
      message ?? defaultMessageFor(kind),
      code: code,
      httpStatus: status,
    );
  }

  static ApiFailureKind _kindForStatus(int status) {
    if (status == 401) return ApiFailureKind.unauthorized;
    if (status == 429) return ApiFailureKind.quota;
    if (status == 409) return ApiFailureKind.conflict;
    if (status == 404) return ApiFailureKind.notFound;
    if (status >= 500) return ApiFailureKind.server;
    return ApiFailureKind.validation;
  }

  ApiFailure<T> _networkFailure<T>() => ApiFailure<T>(
    ApiFailureKind.network,
    defaultMessageFor(ApiFailureKind.network),
  );
}
