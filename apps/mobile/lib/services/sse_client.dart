/// Client SSE và bộ phân tích khung sự kiện (SSE_Parser — Req 1.4, 5, 6).
///
/// Dart không có `EventSource` dựng sẵn, nên ta triển khai SSE bằng streamed
/// HTTP GET và phân tích thủ công các khung `data:`. Phần phân tích thuần
/// ([SseParser]) tách khỏi I/O để dễ property test (Property 9, 10):
/// - [SseParser.splitBuffer]: tách buffer luỹ kế thành các block hoàn chỉnh và
///   phần dư còn lại (ranh giới sự kiện là `\n\n`).
/// - [SseParser.parseFrame]: ghép dòng `data:`, `jsonDecode` trong try/catch,
///   lọc `stage` theo [kValidStages]; trả `null` (không ném) khi JSON lỗi hoặc
///   `stage` lạ (Req 6.3, 6.4).
library;

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/stream_event.dart';
import 'api_client.dart';

/// Bộ phân tích SSE thuần (không I/O).
class SseParser {
  const SseParser._();

  /// Tách [buffer] luỹ kế thành danh sách block hoàn chỉnh và phần dư.
  ///
  /// Ranh giới sự kiện SSE là một dòng trống (`\n\n`). Chuẩn hóa `\r\n` về `\n`
  /// trước khi tách. Phần tử cuối cùng (sau dấu phân tách cuối) là phần **chưa
  /// hoàn chỉnh** và được trả về làm remainder để ghép với chunk kế tiếp.
  static (List<String> blocks, String remainder) splitBuffer(String buffer) {
    final normalized = buffer.replaceAll('\r\n', '\n');
    final parts = normalized.split('\n\n');
    if (parts.isEmpty) {
      return (const <String>[], '');
    }
    final remainder = parts.removeLast();
    return (parts, remainder);
  }

  /// Phân tích một block sự kiện thành [StreamEvent]; `null` nếu không hợp lệ.
  ///
  /// Ghép nội dung mọi dòng bắt đầu bằng `data:` (bỏ tiền tố và một dấu cách
  /// tùy chọn), nối bằng `\n`, rồi `jsonDecode`. Trả `null` khi: không có dòng
  /// `data:`, JSON lỗi (Req 6.3), không phải object, hoặc `stage` không thuộc
  /// [kValidStages] (Req 6.4).
  static StreamEvent? parseFrame(String rawEventBlock) {
    final normalized = rawEventBlock.replaceAll('\r\n', '\n');
    final dataParts = <String>[];
    for (final line in normalized.split('\n')) {
      if (line.startsWith('data:')) {
        var content = line.substring(5);
        if (content.startsWith(' ')) {
          content = content.substring(1);
        }
        dataParts.add(content);
      }
    }
    if (dataParts.isEmpty) {
      return null;
    }

    dynamic json;
    try {
      json = jsonDecode(dataParts.join('\n'));
    } catch (_) {
      return null;
    }
    if (json is! Map) {
      return null;
    }

    final stage = json['stage'];
    if (stage is! String || !kValidStages.contains(stage)) {
      return null;
    }

    final map = Map<String, dynamic>.from(json);
    switch (stage) {
      case 'progress':
        return ProgressEvent.fromJson(map);
      case 'overview':
        return OverviewEvent.fromJson(map);
      case 'bible':
        return BibleEvent.fromJson(map);
      case 'plan':
        return PlanEvent.fromJson(map);
      case 'relationshipGraph':
        return RelationshipGraphEvent.fromJson(map);
      case 'chapter':
        return ChapterEvent.fromJson(map);
      case 'done':
        return DoneEvent.fromJson(map);
      case 'error':
        return StreamErrorEvent.fromJson(map);
    }
    return null;
  }
}

/// Client mở luồng SSE tại `GET /stories/:id/stream` (Req 1.4, 5.2).
class SseClient {
  SseClient({required AppConfig config, http.Client Function()? clientFactory})
    : _config = config,
      _clientFactory = clientFactory ?? (() => http.Client());

  final AppConfig _config;
  final http.Client Function() _clientFactory;
  http.Client? _client;

  /// Hàm thuần: dựng URI stream **HTTPS**, mã hóa `access_token` vào query
  /// (Req 1.4, 1.8).
  static Uri buildStreamUri(
    String baseUrl,
    String storyId,
    String accessToken,
  ) {
    final base = ApiClient.buildUri(baseUrl, '/stories/$storyId/stream');
    return base.replace(
      queryParameters: <String, String>{'access_token': accessToken},
    );
  }

  /// Mở luồng SSE và phát các [StreamEvent] đã phân tích & lọc.
  ///
  /// Tự đóng client khi luồng kết thúc hoặc bị hủy.
  Stream<StreamEvent> connect(
    String storyId, {
    required String accessToken,
  }) async* {
    final client = _clientFactory();
    _client = client;
    try {
      final uri = buildStreamUri(_config.apiBaseUrl, storyId, accessToken);
      final request = http.Request('GET', uri)
        ..headers['Accept'] = 'text/event-stream';
      final response = await client.send(request);

      var buffer = '';
      await for (final chunk in response.stream.transform(utf8.decoder)) {
        buffer += chunk;
        final (blocks, remainder) = SseParser.splitBuffer(buffer);
        buffer = remainder;
        for (final block in blocks) {
          final event = SseParser.parseFrame(block);
          if (event != null) {
            yield event;
          }
        }
      }
      // Xử lý phần dư cuối cùng (block cuối không có `\n\n` kết thúc).
      if (buffer.trim().isNotEmpty) {
        final event = SseParser.parseFrame(buffer);
        if (event != null) {
          yield event;
        }
      }
    } finally {
      client.close();
      if (identical(_client, client)) {
        _client = null;
      }
    }
  }

  /// Đóng luồng SSE đang mở (nếu có) — Req 2.7, 5.9.
  void close() {
    _client?.close();
    _client = null;
  }
}
