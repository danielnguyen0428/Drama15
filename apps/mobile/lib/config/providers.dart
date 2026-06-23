/// Wiring Riverpod cho services và repositories (DI gốc của App).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../i18n/app_strings.dart';
import '../models/story_config.dart';
import '../repositories/offline_repository.dart';
import '../repositories/reading_repository.dart';
import '../repositories/story_repository.dart';
import '../services/api_client.dart';
import '../services/local_store.dart';
import '../services/local_story_store.dart';
import '../services/share_service.dart';
import '../services/sse_client.dart';
import '../services/supabase_auth_service.dart';
import 'app_config.dart';

/// `http.Client` dùng chung cho REST.
final httpClientProvider = Provider<http.Client>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return client;
});

/// Dịch vụ xác thực Supabase (bọc `Supabase.instance.client.auth`).
final supabaseAuthServiceProvider = Provider<SupabaseAuthService>((ref) {
  return SupabaseAuthServiceImpl(Supabase.instance.client.auth);
});

/// Ngôn ngữ đầu ra điều khiển chuỗi UI (đồng bộ từ dropdown cấu hình).
final uiOutputLanguageProvider = StateProvider<OutputLanguage>(
  (ref) => OutputLanguage.vietnamese,
);

/// Chuỗi UI theo ngôn ngữ đầu ra đã chọn trên màn hình cấu hình.
final appStringsProvider = Provider<AppStrings>((ref) {
  return AppStrings.forLanguage(ref.watch(uiOutputLanguageProvider));
});

/// Client REST.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    config: ref.watch(appConfigProvider),
    auth: ref.watch(supabaseAuthServiceProvider),
    httpClient: ref.watch(httpClientProvider),
    isConfigValid: () => ref.read(configValidProvider),
  );
});

/// Client SSE.
final sseClientProvider = Provider<SseClient>((ref) {
  return SseClient(config: ref.watch(appConfigProvider));
});

/// Lưu trữ bền vững bản tải ngoại tuyến.
final localStoryStoreProvider = Provider<LocalStoryStore>((ref) {
  return FileLocalStoryStore();
});

/// Dịch vụ chia sẻ qua OS share sheet.
final shareServiceProvider = Provider<ShareService>((ref) {
  return const SharePlusShareService();
});

/// Repository truyện.
final storyRepositoryProvider = Provider<StoryRepository>((ref) {
  return StoryRepository(ref.watch(apiClientProvider));
});

/// Repository thiết lập/vị trí đọc.
final readingRepositoryProvider = Provider<ReadingRepository>((ref) {
  return ReadingRepository(ref.watch(localStoreProvider));
});

/// Repository đọc ngoại tuyến.
final offlineRepositoryProvider = Provider<OfflineRepository>((ref) {
  return OfflineRepository(
    ref.watch(storyRepositoryProvider),
    ref.watch(localStoryStoreProvider),
  );
});
