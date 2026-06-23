# Implementation Plan: Flutter Drama Mobile App

## Overview

Kế hoạch triển khai ứng dụng di động Flutter (`apps/mobile/`) cho nền tảng "Drama 15", **dùng lại nguyên trạng** backend Fastify (`https://drama-api.novelkit.cc`) và Supabase Auth. Thực thi theo kiến trúc phân tầng tăng tiến: hạ tầng cấu hình → mô hình dữ liệu → dịch vụ/client (transport) → repository & logic thuần → controller (Riverpod) → màn hình → đấu nối tổng. Mỗi bước xây trên bước trước và kết thúc bằng việc đấu nối vào hệ thống, không để mã mồ côi.

Ngôn ngữ triển khai: **Dart/Flutter**. State management: **Riverpod**. PBT: **glados** (mỗi property một test, tối thiểu 100 vòng).

Quy ước property test:
- Tác vụ con đánh dấu `*` là tùy chọn (unit/widget/integration/property test) và **không** được tự triển khai khi chạy task chính.
- Mỗi property-based test dùng `glados`, chạy tối thiểu 100 vòng (`Glados(runs: 100)` khi cần), và gắn comment tag theo định dạng:
  `// Feature: flutter-drama-mobile-app, Property {number}: {property_text}`

## Tasks

- [x] 1. Khởi tạo dự án Flutter và hạ tầng cấu hình
  - [x] 1.1 Tạo khung dự án `apps/mobile` và cấu trúc thư mục theo tầng
    - Khởi tạo dự án Flutter tại `apps/mobile/` (hỗ trợ iOS + Android một codebase)
    - Tạo cây thư mục `lib/{config, theme, models, services, repositories, logic, controllers, screens}`
    - Khai báo dependencies trong `pubspec.yaml`: `flutter_riverpod`, `supabase_flutter`, `http`, `shared_preferences`, `path_provider`, `share_plus`, `app_links`, `go_router`, `google_fonts`; dev: `flutter_lints`, `test`, `glados`
    - Bật `flutter_lints` qua `analysis_options.yaml`
    - _Requirements: 1.1, 1.2, 14.6_

  - [x] 1.2 Triển khai `AppConfig`, `ConfigValidation` và `validateHttpsUrl`
    - Viết hàm thuần `validateHttpsUrl(String)` trong `lib/config/`
    - Viết `AppConfig` đọc `API_BASE_URL`/`SUPABASE_URL`/`SUPABASE_ANON_KEY` qua `--dart-define`, mặc định `API_BASE_URL = https://drama-api.novelkit.cc`
    - Viết `AppConfig.validate()` trả `ConfigValidation(invalidKeys)` và `isValid`; định nghĩa `configValidProvider` (Riverpod) làm cổng cho thao tác mạng mới
    - _Requirements: 1.1, 1.2, 1.5, 1.7, 1.9_

  - [x] 1.3 Viết property test cho `validateHttpsUrl`
    - **Property 1: validateHttpsUrl chỉ chấp nhận URL HTTPS hợp lệ**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 1.4 Viết property test cho `AppConfig.validate`
    - **Property 2: AppConfig hợp lệ khi và chỉ khi cả ba giá trị hợp lệ**
    - **Validates: Requirements 1.5, 1.7, 1.9**

- [x] 2. Mô hình dữ liệu (models, immutable + fromJson/toJson)
  - [x] 2.1 Triển khai `StoryConfig` với `fromJson`/`toJson`
    - Viết model `StoryConfig` (`niche`, `customNiche`, `title`, `seed`, `outputLanguage`, `intensity`, `dialogueRatio`, `hookDensity`, `stylePreset`, `storyControls` tùy chọn) khớp cấu trúc API
    - _Requirements: 3.1, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [x] 2.2 Viết property test cho `StoryConfig` round-trip
    - **Property 6: StoryConfig khứ hồi qua JSON**
    - **Validates: Requirements 3.10**

  - [x] 2.3 Triển khai `Chapter` và `StoryPayload` (sort theo `index` tăng dần)
    - Viết model `Chapter` (`index`, `title`, `content`) và `StoryPayload` (`title`, `concept`, `storyBible`, `chapterPlan`, `chapters`, `relationshipGraph` tùy chọn)
    - `StoryPayload.fromJson` luôn sort `chapters` theo `index` tăng dần; `toJson` giữ thứ tự đó
    - _Requirements: 8.3, 11.1, 16.11_

  - [x] 2.4 Viết property test cho `StoryPayload` round-trip
    - **Property 18: StoryPayload offline khứ hồi lưu/nạp**
    - **Validates: Requirements 16.11**

  - [x] 2.5 Triển khai `ReadingSettings` (gồm `Reading_Mode`) và `ReadingPosition`
    - Viết `ReadingSettings` (cỡ chữ, họ phông, chủ đề, độ sáng, `Reading_Mode` mặc định `paged`) và `ReadingPosition` (`chapterIndex`, `inChapterProgress` ∈ [0,1]) với `fromJson`/`toJson`
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 12.1, 12.3, 17.1, 17.3_

  - [x] 2.6 Viết property test cho `ReadingSettings` round-trip
    - **Property 14: Reading_Settings khứ hồi lưu/nạp**
    - **Validates: Requirements 12.5, 17.3**

  - [x] 2.7 Viết property test cho `ReadingPosition` round-trip
    - **Property 15: Reading_Position khứ hồi lưu/nạp**
    - **Validates: Requirements 12.6, 17.12**

  - [x] 2.8 Triển khai các model còn lại: `StreamEvent`, `QuotaSnapshot`, `SavedStory`, `StoryDetail`, `AccountSnapshot`, `OfflineDownload`/`OfflineDownloadMeta`, `OfflineDownloadStatus`
    - Viết `StreamEvent` (union theo `stage`), `QuotaSnapshot(remaining, limit)` với getter `display`, `SavedStory` (`id`, `title`, `status`, `createdAt`, `updatedAt`, `chapterCount`, `canResume`, `error`), `AccountSnapshot` (hồ sơ + quota), `OfflineDownload`/`OfflineDownloadMeta`, enum `OfflineDownloadStatus`
    - _Requirements: 5.3, 7.1, 8.1, 16.2_

  - [x] 2.9 Viết property test cho `QuotaSnapshot.display`
    - **Property 11: Hiển thị hạn mức đúng định dạng**
    - **Validates: Requirements 7.1**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Dịch vụ/Client tầng transport (services)
  - [x] 4.1 Triển khai `SupabaseAuthService`
    - Viết interface + impl bọc `Supabase.instance.client.auth`: `signInWithGoogle` (redirect `cc.novelkit.drama15://login-callback`), `signOut`, `currentAccessToken`, `restoreSession`, stream `authStateChanges`
    - _Requirements: 2.2, 2.3, 2.7, 2.9, 2.11_

  - [x] 4.2 Triển khai `ApiClient` (REST) và chuẩn hóa `ApiResponse`
    - Viết `ApiClient.buildUri(baseUrl, path)` (hàm thuần, HTTPS), các method `get/post/patch/delete`, gắn `Authorization: Bearer <token>`, đi qua HTTPS, gate `configValidProvider` cho request mới và gate token cho endpoint cần auth
    - Chuẩn hóa kết cục thành `ApiSuccess`/`ApiFailure(kind, message, code?, httpStatus?)` với `ApiFailureKind` và ánh xạ lỗi (network/401/429/409/4xx message/5xx/config)
    - _Requirements: 1.3, 1.8, 1.9, 1.10, 15.1, 15.3, 15.4_

  - [x] 4.3 Triển khai `SseClient` và `SseParser`
    - Viết `SseClient.buildStreamUri(baseUrl, storyId, accessToken)` (hàm thuần, HTTPS, mã hóa `access_token` vào query) và `connect()` qua streamed GET
    - Viết `SseParser.splitBuffer(buffer)` và `SseParser.parseFrame(rawEventBlock)`: ghép dòng `data:`, `jsonDecode` trong try/catch, lọc `stage` theo `kValidStages = {progress, overview, bible, plan, relationshipGraph, chapter, done, error}`, trả `null` khi JSON lỗi/`stage` lạ (không ném ngoại lệ)
    - _Requirements: 1.4, 5.2, 6.1, 6.2, 6.3, 6.4_

  - [x] 4.4 Viết property test cho `buildUri`/`buildStreamUri` HTTPS
    - **Property 3: Mọi URI gọi API đều dùng HTTPS**
    - **Validates: Requirements 1.8**

  - [x] 4.5 Viết property test cho `buildStreamUri` access_token round-trip
    - **Property 4: access_token khứ hồi qua query của stream URI**
    - **Validates: Requirements 1.4**

  - [x] 4.6 Viết property test cho header Authorization Bearer
    - **Property 5: Endpoint cần auth luôn gắn Bearer token**
    - **Validates: Requirements 1.3**

  - [x] 4.7 Viết property test cho `SseParser.parseFrame` với đầu vào hợp lệ
    - **Property 9: SseParser.parseFrame trả đúng loại với đầu vào hợp lệ**
    - **Validates: Requirements 6.1, 6.2**

  - [x] 4.8 Viết property test cho `SseParser.parseFrame` an toàn trước đầu vào bất thường
    - **Property 10: SseParser.parseFrame an toàn trước đầu vào bất thường**
    - **Validates: Requirements 6.3, 6.4**

  - [x] 4.9 Triển khai `LocalStore` (shared_preferences)
    - Viết `LocalStore` bọc `shared_preferences`, lưu/nạp JSON theo khóa `reading_settings` (toàn cục) và `reading_position:<storyId>` (theo truyện)
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 4.10 Triển khai `LocalStoryStore` (tệp JSON + atomic rename)
    - Viết interface `LocalStoryStore` và impl ghi `<appDocs>/offline_stories/<storyId>.json` qua `path_provider`: `save` (ghi `.tmp` rồi `rename` nguyên tử, ném `StorageFullException` khi hết dung lượng), `load`, `delete` (no-op nếu không có), `list` (chỉ metadata)
    - _Requirements: 16.4, 16.7, 16.8_

  - [x] 4.11 Triển khai `ShareService` (share_plus)
    - Viết `ShareService` mở OS share sheet, trả `ShareOutcome` (success/dismissed/failure)
    - _Requirements: 13.1, 13.2, 13.6, 13.7_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Logic thuần và Repositories
  - [x] 6.1 Triển khai reducer SSE `reduceStream` và `upsertChapterByIndex`
    - Viết `reduceStream(StoryWorkspaceState, StreamEvent) -> StoryWorkspaceState` ánh xạ từng `stage` (progress/overview/bible/plan/relationshipGraph/chapter/done) không làm hỏng phần state khác
    - Viết hàm thuần `upsertChapterByIndex(existing, next)`: xóa chương cùng `index` rồi chèn lại, sort theo `index` (idempotent, duy nhất theo index)
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6.5_

  - [x] 6.2 Viết property test cho `reduceStream`
    - **Property 7: reduceStream ánh xạ đúng từng loại sự kiện SSE**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7, 5.9**

  - [x] 6.3 Viết property test cho `upsertChapterByIndex`
    - **Property 8: Áp sự kiện chương là idempotent, duy nhất theo index và sắp tăng**
    - **Validates: Requirements 5.8, 6.5**

  - [x] 6.4 Triển khai `StoryRepository` (API + logic thuần xuất bản/resume)
    - Viết các method API: `getStylePresets`, `getAuthMe`, `setupSuggest`, `listStories`, `createStory`, `getStory`, `resumeStory`, `rewriteChapter`, `renameStory`, `deleteStory`
    - Viết hàm thuần `canResumeStory(SavedStory)`, `buildStoryMarkdown(title, payload)`, `buildChapterShareText(title, chapter)`
    - _Requirements: 2.4, 3.4, 3.5, 4.1, 5.1, 8.1, 8.3, 8.4, 8.5, 9.1, 9.3, 10.3, 13.1, 13.2, 13.3_

  - [x] 6.5 Viết property test cho `canResumeStory`
    - **Property 12: canResumeStory khớp công thức của bản web**
    - **Validates: Requirements 9.1**

  - [x] 6.6 Viết property test cho `buildStoryMarkdown`
    - **Property 16: Markdown bản thảo gồm nhan đề và toàn bộ chương theo index tăng**
    - **Validates: Requirements 13.2, 13.3**

  - [x] 6.7 Triển khai `ReadingRepository`
    - Viết `ReadingRepository` dùng `LocalStore`: `loadSettings`/`saveSettings`, `loadPosition`/`savePosition`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.7_

  - [x] 6.8 Triển khai `OfflineRepository` (download + suy diễn trạng thái)
    - Viết `OfflineRepository` điều phối `ApiClient` (nạp `StoryPayload` qua `getStory`) và `LocalStoryStore`: `download`/`refresh` (không ghi bản dở khi lỗi), `loadOffline`, `remove`, `listDownloaded`
    - Viết hàm thuần `isUpdateAvailable(local, server)` và `deriveStatus({isDownloaded, isDownloading, localUpdatedAt, serverUpdatedAt})`
    - _Requirements: 16.1, 16.4, 16.5, 16.7, 16.8, 16.9, 16.10_

  - [x] 6.9 Viết property test cho `deriveStatus`/`isUpdateAvailable`
    - **Property 17: Suy diễn Offline_Download_Status nhất quán**
    - **Validates: Requirements 16.9**

  - [x] 6.10 Triển khai `Paginator` và `progressPercent`
    - Viết hàm thuần `progressPercent(chapterIndex, inChapterProgress, totalChapters)` ∈ [0,100], đơn điệu theo vị trí
    - Viết `Paginator.paginate(content, viewport, settings)` (đo bằng `TextPainter`, phủ toàn bộ, biên liền mạch), `progressToPageIndex(progress, pageCount)`, `pageIndexToProgress(i, pageCount)`
    - _Requirements: 11.7, 17.4, 17.13_

  - [x] 6.11 Viết property test cho `progressPercent`
    - **Property 13: Tiến độ đọc luôn trong [0,100] và đơn điệu theo vị trí**
    - **Validates: Requirements 11.7**

  - [x] 6.12 Viết property test cho `Paginator.paginate`
    - **Property 19: Phân trang liền mạch và phủ toàn bộ chương**
    - **Validates: Requirements 17.4**

  - [x] 6.13 Viết property test cho `progressToPageIndex` ↔ `pageIndexToProgress`
    - **Property 20: Ánh xạ tiến độ ↔ chỉ số trang ổn định**
    - **Validates: Requirements 17.13**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Controllers (Riverpod Notifiers)
  - [x] 8.1 Triển khai `AuthController`
    - Viết `AuthController` điều phối `SupabaseAuthService` + `StoryRepository.getAuthMe`: cập nhật phiên, nạp hồ sơ/quota (timeout 10s, retry ≤3 lần cách 5s), chặn thao tác cần auth khi chưa đăng nhập, xử lý timeout 120s/hủy đăng nhập, đăng xuất dọn state
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10_

  - [x] 8.2 Triển khai `ConfigController`, `QuotaController` và logic gợi ý kịch bản
    - Viết `ConfigController` giữ `StoryConfig`, nạp style presets (fallback `co_man_warm_modern_blueprint`), gọi `setupSuggest` điền `title`/`seed`/`storyControls`
    - Viết `QuotaController` cập nhật `Story_Quota`/`Setup_Suggestion_Quota` và trạng thái vô hiệu nút theo quota
    - _Requirements: 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.2, 7.3, 7.4, 7.5_

  - [x] 8.3 Triển khai `GenerationController` (SSE + resume)
    - Viết `GenerationController`: `createStory` → mở `SseClient`, áp `reduceStream` cho mỗi `StreamEvent`, xử lý `done`/`error`, đóng luồng và làm mới danh sách+quota; xử lý SSE đứt trước `done` (trạng thái cần thử lại); resume qua `getStory` + `resumeStory` (409 `story_completed`/`story_not_resumable`)
    - _Requirements: 5.1, 5.2, 5.9, 9.3, 9.4, 9.5, 15.2_

  - [x] 8.4 Triển khai `LibraryController` và `RewriteController`
    - Viết `LibraryController`: `listStories`, mở truyện (`getStory`), `renameStory`, `deleteStory`, làm mới; giữ nguyên danh sách khi lỗi
    - Viết `RewriteController`: chọn mode, gọi `rewriteChapter` với `chapterIndex`/`mode`/`instruction`, cập nhật chương + đồ thị quan hệ, vô hiệu nút khi instruction rỗng
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 8.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 8.5 Triển khai `OfflineController`
    - Viết `OfflineController extends StateNotifier<Map<String, OfflineDownloadStatus>>`: `downloadStory`, `refreshStory`, `deleteDownload`, `restoreOnStartup`, `checkForUpdates`, `statusOf`; giữ nguyên trạng thái trước đó khi tải lỗi
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.7, 16.8, 16.9, 16.10_

  - [x] 8.6 Triển khai `ReaderController` và `ShareController`
    - Viết `ReaderController`: nạp/lưu `Reading_Settings`/`Reading_Position`, điều hướng chương, đổi `Reading_Mode`, tính lại `Page` khi đổi cỡ chữ/phông/xoay, ánh xạ tiến độ ↔ trang, đọc offline khi mất mạng
    - Viết `ShareController` dùng `ShareService` + `buildStoryMarkdown`/`buildChapterShareText`, vô hiệu khi không có chương/nội dung rỗng
    - _Requirements: 11.6, 11.8, 11.9, 11.10, 11.11, 11.12, 12.7, 13.4, 13.5, 13.6, 13.7, 16.5, 17.2, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10, 17.11_

  - [x] 8.7 Viết unit tests cho các controller
    - Test ánh xạ `ApiFailure` → thông điệp tiếng Việt, logic retry `getAuthMe` (fake clock), gate cấu hình/auth, rollback trạng thái offline khi lỗi
    - _Requirements: 2.5, 8.7, 15.1, 15.3, 15.4, 16.4_

- [x] 9. Màn hình (screens) và đấu nối UI ↔ controller
  - [x] 9.1 Triển khai theme tokens và `ThemeData`
    - Viết `lib/theme/`: bảng màu (nền giấy ngà, nhấn coral), phông serif (tiêu đề/đọc) + sans (UI) qua `google_fonts`, kích thước chạm ~48 logical px
    - _Requirements: 14.1, 14.4_

  - [x] 9.2 Triển khai `AuthScreen`
    - Viết màn hình mời đăng nhập + nút "Đăng nhập bằng Google", hiển thị tên/email + nhãn gói; đấu nối `AuthController`
    - _Requirements: 2.1, 2.6_

  - [x] 9.3 Triển khai `AppShell` (BottomNavigationBar) và `go_router`
    - Viết shell 3 tab (Cấu hình, Bản thảo, Tủ truyện), khai báo route (gồm Reader push, màn hình lỗi cấu hình), reflow một cột, hỗ trợ xoay màn hình
    - _Requirements: 14.2, 14.3, 14.5_

  - [x] 9.4 Triển khai `ConfigScreen` (cấu hình + gợi ý + hạn mức)
    - Viết màn hình: chọn `niche` (13 lựa chọn + custom), trường `title`/`seed`, `stylePreset`, `outputLanguage`, ba slider (intensity/dialogueRatio/hookDensity), nút "Gợi ý kịch bản"/"Viết bản thảo", hiển thị quota; đấu nối `ConfigController`/`QuotaController`/`GenerationController`
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 3.8, 3.9, 4.5, 4.6, 7.1, 7.2, 7.3_

  - [x] 9.5 Triển khai `StoryWorkspaceScreen` (5 thẻ nội dung + viết lại)
    - Viết tab Bản thảo với `TabBar`/`TabBarView` 5 thẻ "Chương/Ý tưởng/Dàn ý/Hồ sơ/Quan hệ", animation tiến độ khi SSE chạy, bảng viết lại chương; đấu nối `GenerationController`/`RewriteController`/`ShareController`
    - _Requirements: 5.10, 5.11, 10.1, 10.2_

  - [x] 9.6 Triển khai `LibraryScreen`
    - Viết tủ truyện: danh sách `SavedStory` + nhãn trạng thái tiếng Việt, mở/đổi tên/xóa/viết tiếp, hiển thị `Offline_Download_Status` + nút tải/làm mới/xóa bản tải; đấu nối `LibraryController`/`OfflineController`
    - _Requirements: 8.1, 8.2, 9.2, 16.6_

  - [x] 9.7 Triển khai `ReaderScreen` (scroll + paged)
    - Viết Reader: hiển thị chương theo `index`, điều khiển cỡ chữ (5 bước 12–28, mặc định 18), 3 chủ đề, độ sáng, chọn phông, mục lục, tiến độ %, điều hướng chương (vô hiệu ở biên), chuyển `Reading_Mode`, lật trang `paged` (vô hiệu ở biên trang), áp settings tức thời; đấu nối `ReaderController`/`ShareController`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 17.1, 17.2, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10, 17.11_

  - [x] 9.8 Viết widget tests cho UI
    - Test 5 tab, vô hiệu nút theo quota/instruction/biên chương/biên trang, mục lục, áp settings tức thời, theme/màu/phông, reflow một cột, kích thước chạm, xoay màn hình
    - _Requirements: 5.11, 10.5, 11.10, 11.11, 11.12, 14.1, 14.2, 14.4, 14.5_

- [x] 10. Đấu nối tổng (bootstrap ứng dụng)
  - [x] 10.1 Viết `main.dart` và đấu nối toàn bộ vòng đời
    - Khởi tạo `WidgetsFlutterBinding`, `AppConfig.validate()` (gate màn hình lỗi cấu hình nêu khóa hỏng), `Supabase.initialize`, `ProviderScope`, `restoreSession` khi khởi động, `OfflineController.restoreOnStartup`, đăng ký deep link OAuth, gắn `go_router` vào `MaterialApp.router`
    - _Requirements: 1.5, 2.9, 2.11, 16.8_

  - [x] 10.2 Viết integration tests
    - Test deep link OAuth Supabase, khôi phục/hết hạn phiên khi khởi động lại, đọc/ghi `LocalStoryStore` thật (atomic rename rollback), mở OS share sheet
    - _Requirements: 2.3, 2.9, 2.11, 13.1, 16.4, 16.5_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tác vụ đánh dấu `*` là tùy chọn (unit/widget/integration/property test) và có thể bỏ qua để ra MVP nhanh; tác vụ chính không đánh dấu `*` thì bắt buộc triển khai.
- Mỗi tác vụ tham chiếu requirement cụ thể để truy vết.
- Checkpoint bảo đảm kiểm chứng tăng tiến.
- 20 property test (P1–P20) phủ trọn các hàm thuần có bất biến/khứ hồi; mỗi property một test `glados` ≥100 vòng, gắn comment tag `// Feature: flutter-drama-mobile-app, Property {n}: ...`.
- Mỗi tác vụ kết thúc bằng việc đấu nối thành phần vào hệ thống; không để mã mồ côi.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.3", "2.5", "2.8"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.2", "2.4", "2.6", "2.7", "2.9"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3", "4.9", "4.10", "4.11"] },
    { "id": 4, "tasks": ["4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 5, "tasks": ["6.1", "6.4", "6.7", "6.8", "6.10"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.5", "6.6", "6.9", "6.11", "6.12", "6.13"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6"] },
    { "id": 8, "tasks": ["9.1", "8.7"] },
    { "id": 9, "tasks": ["9.2", "9.3", "9.4", "9.5", "9.6", "9.7"] },
    { "id": 10, "tasks": ["9.8", "10.1"] },
    { "id": 11, "tasks": ["10.2"] }
  ]
}
```
