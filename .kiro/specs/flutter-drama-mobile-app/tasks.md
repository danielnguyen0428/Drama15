# Implementation Plan: Ứng dụng di động Flutter "Drama 15"

## Overview

Kế hoạch này chuyển thiết kế trong `design.md` thành một chuỗi tác vụ lập trình tăng tiến cho một **dự án Flutter hoàn toàn mới** đặt tại `apps/mobile/` (song song với `apps/web` và `apps/api`). Ứng dụng **tái sử dụng nguyên trạng** backend Fastify (`https://drama-api.novelkit.cc`) và Supabase Auth — không tạo backend mới.

Thứ tự thực thi bám theo kiến trúc phân tầng: **hạ tầng cấu hình → mô hình dữ liệu → dịch vụ/client → repository & logic thuần → controller (Riverpod) → màn hình → đấu nối tổng**. Mỗi tác vụ xây trên kết quả của tác vụ trước và kết thúc bằng việc đấu nối vào hệ thống, không để lại mã mồ côi.

Quy ước:
- Ngôn ngữ triển khai: **Dart / Flutter** (thiết kế đã chỉ định cụ thể, không dùng giả mã).
- Tác vụ con đánh dấu `*` là **tùy chọn** (unit/widget/integration/property test) và có thể bỏ qua để ra MVP nhanh.
- Mỗi property-based test dùng **`glados`**, chạy **tối thiểu 100 vòng** (`Explore(numRuns: 100)` hoặc tương đương), và gắn comment tag đúng định dạng:
  `// Feature: flutter-drama-mobile-app, Property {number}: {property_text}`
- Mỗi tác vụ tham chiếu các tiểu mục yêu cầu cụ thể (`_Requirements: x.y_`) và thành phần thiết kế liên quan.

## Tasks

- [ ] 1. Khởi tạo dự án Flutter và hạ tầng cấu hình
  - [x] 1.1 Tạo dự án Flutter `apps/mobile` và khai báo phụ thuộc
    - Chạy `flutter create` tạo dự án tại `apps/mobile/` (tổ chức cạnh `apps/web`, `apps/api`)
    - Thêm phụ thuộc vào `pubspec.yaml`: `flutter_riverpod`, `supabase_flutter`, `http`, `shared_preferences`, `share_plus`, `go_router`, `google_fonts`, `app_links`; `dev_dependencies`: `glados`, `flutter_test`, `integration_test`
    - Tạo cấu trúc thư mục `lib/{config,theme,models,services,repositories,logic,controllers,screens}` và `test/` tương ứng; tạo `main.dart` khung tối thiểu (placeholder) để dự án build được
    - Tài liệu hóa các khóa `--dart-define` cần truyền lúc build: `API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (ví dụ trong `README` của app)
    - _Requirements: 1.1, 1.2_

  - [-] 1.2 Hiện thực `AppConfig` và logic kiểm tra cấu hình
    - Tạo `lib/config/app_config.dart`: `AppConfig` đọc 3 giá trị qua `String.fromEnvironment`; mặc định `API_BASE_URL = https://drama-api.novelkit.cc`
    - Hiện thực hàm thuần `validateHttpsUrl(String)` (dùng `Uri.tryParse`, `scheme == 'https'`, `host` không rỗng) và `ConfigValidation { invalidKeys, isValid }`
    - Cung cấp `AppConfig.validate()`, `isValid`, và `configValidProvider` (bool) để cổng hóa thao tác mạng mới
    - _Requirements: 1.1, 1.2, 1.5, 1.7, 1.9_

  - [~] 1.3 Viết property test cho tính hợp lệ cấu hình
    - **Property 1: Tính hợp lệ cấu hình và cổng thao tác mạng**
    - Generator `anyConfigTriple` (mỗi khóa: HTTPS hợp lệ | `http` | không-URL | rỗng); xác nhận `invalidKeys` đúng bằng tập khóa không hợp lệ và `isValid` ⇔ cho phép thao tác mạng mới
    - **Validates: Requirements 1.1, 1.2, 1.5, 1.7, 1.9**

  - [-] 1.4 Định nghĩa token giao diện `AppTheme`
    - Tạo `lib/theme/app_theme.dart`: ánh xạ token màu web (`pageBg #f1e9d8`, `paper #fbf7ee`, `canvas #fdfaf3`, `ink #1a1611`, `muted #6b6253`, `coral #d7634e`, `coralDark #b9452f`)
    - Cấu hình phông qua `google_fonts`: serif (Fraunces/Lora) cho tiêu đề/nội dung đọc, sans (Inter) cho UI, mono (JetBrains Mono) cho nhãn nhỏ; đặt kích thước chạm tối thiểu ~48 logical px cho nút/thanh trượt
    - Định nghĩa thêm bảng màu Reader riêng `ReaderTheme { light, sepia, dark }` (token độc lập theme app)
    - _Requirements: 14.1, 14.4_

- [ ] 2. Xây dựng mô hình dữ liệu (ánh xạ 1-1 JSON API)
  - [-] 2.1 Mô hình cấu hình truyện và gợi ý
    - Tạo `lib/models/story_config.dart`: `StoryConfig` (+ `toJson`/`fromJson` khớp `StoryConfigSchema`), `StoryControls`, enum `OutputLanguage` (6 giá trị), hằng `NICHES` (13 lựa chọn + nhãn tiếng Việt), giá trị mặc định trùng `DEFAULT_CONFIG` web
    - Tạo `lib/models/style_preset.dart`: `StylePreset { id, displayName, description }`
    - Tạo `lib/models/setup_suggestion.dart`: `SetupSuggestion`, `DraftControls`
    - _Requirements: 3.1, 3.6, 3.7, 3.8, 3.9, 3.10, 4.2_

  - [~] 2.2 Viết property test khứ hồi `StoryConfig`
    - **Property 3: Khứ hồi tuần tự hóa StoryConfig**
    - Generator `anyStoryConfig` (niche gồm `custom`, ngôn ngữ trong tập 6, slider trong miền hợp lệ, `storyControls?`); xác nhận `fromJson(toJson())` tương đương và `toJson()` chứa đủ khóa schema
    - **Validates: Requirements 3.10**

  - [-] 2.3 Mô hình tài khoản và hạn mức + nhãn hiển thị
    - Tạo `lib/models/account.dart`: enum `UserTier { free, pro, premium }`, `AppUser`, `Quota`, `AccountSnapshot` (+ `fromJson` khớp `GET /auth/me`)
    - Hiện thực hàm thuần nhãn hiển thị: `userLabel(AppUser)` (email khi `displayName` rỗng), `tierLabel(UserTier)` (`free→Miễn phí`, `pro→Pro`, `premium→Premium`)
    - _Requirements: 2.6, 7.1, 7.2_

  - [-] 2.4 Mô hình truyện, payload và đồ thị quan hệ + nhãn trạng thái
    - Tạo `lib/models/story.dart`: enum `StoryStatus`, hàm `statusLabel` (`queued→Đang chờ`, `running→Đang viết`, `completed→Hoàn tất`, `failed→Có lỗi`), `SavedStory`, `StoryDetail`
    - Tạo `lib/models/story_payload.dart`: `Concept`, `ChapterPlanItem`, `Chapter` (`index`, `title?`, `content`, `isEmpty`), `StoryPayload`; chuẩn hóa chương từ `GET /stories/:id` (`chapterNumber/text → index/content`) giống `resultFromPayload`
    - Tạo `lib/models/relationship_graph.dart`: `RelationshipNode`, `RelationshipEdge`, `RelationshipGraph` + hàm `normalizeRelationshipGraph` (lọc node/edge theo trường bắt buộc)
    - _Requirements: 8.1, 8.2, 5.4, 5.5, 5.6, 5.7, 11.1_

  - [~] 2.5 Viết property test ánh xạ nhãn hiển thị
    - **Property 4: Tính toàn vẹn của ánh xạ nhãn hiển thị**
    - Xác nhận nhãn người dùng (email/displayName), nhãn gói và nhãn trạng thái ánh xạ đúng cho **mọi** giá trị enum mà không bỏ sót
    - **Validates: Requirements 2.6, 8.2**

  - [-] 2.6 Mô hình sự kiện stream và thao tác truyện
    - Tạo `lib/models/stream_event.dart`: enum `StreamStage` (8 giá trị), `StreamEvent` (+ `fromJson`)
    - Tạo `lib/models/rewrite.dart`: enum `RewriteMode` (6 giá trị + nhãn VN), `RewriteRequest`, `RewriteResult`
    - Tạo `lib/models/results.dart`: `CreateStoryResult`, `ResumeResult`
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 10.2_

  - [-] 2.7 Mô hình thiết lập và vị trí đọc
    - Tạo `lib/models/reading.dart`: enum `ReaderTheme`, `ReaderFontFamily`; `ReadingSettings` (fontSize bước rời rạc {12,16,18,22,28}, theme, brightness∈[0,1], fontFamily; `defaults`) và `ReadingPosition` (`chapterIndex`, `inChapterProgress∈[0,1]`)
    - `fromJson` phải **chuẩn hóa** giá trị (kẹp `fontSize` về bước hợp lệ gần nhất, `brightness`/`inChapterProgress` về [0,1]) để khứ hồi ổn định trước dữ liệu cũ/hỏng
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 12.5, 12.6_

- [ ] 3. Dịch vụ và client (transport)
  - [~] 3.1 Hiện thực `SupabaseAuthService`
    - Tạo `lib/services/supabase_auth_service.dart` bọc `Supabase.instance.client.auth`: `authStateChanges`, `currentSession`, `currentAccessToken()`, `signInWithGoogle()` (redirect `cc.novelkit.drama15://login-callback`), `signOut()`, `restoreSession()`
    - Định nghĩa interface trừu tượng để override trong test
    - _Requirements: 2.2, 2.3, 2.9, 2.11, 1.3, 1.4_

  - [~] 3.2 Hiện thực `ApiClient` (REST + ánh xạ lỗi)
    - Tạo `lib/services/api_client.dart`: `get/post/patch/delete`, ép HTTPS, gắn `Authorization: Bearer <token>` cho endpoint cần auth, dựng URL từ `AppConfig.apiBaseUrl`
    - Định nghĩa `ApiResponse<T>` = `ApiSuccess<T>` | `ApiFailure(kind, message, code?, httpStatus?)` với `ApiFailureKind { network, unauthorized, quota, validation, notFound, conflict, server, config }`; đọc `message` từ `error.message`, `code` từ `error.code`
    - Chặn request mới khi `configValidProvider` false (Req 1.9), không gửi khi thiếu token cho endpoint cần auth (Req 1.10), nhưng cho request đang chạy hoàn tất (Req 1.6)
    - _Requirements: 1.3, 1.6, 1.8, 1.9, 1.10, 15.1, 15.3, 15.4_

  - [~] 3.3 Viết property test dựng URL và mã hóa access_token
    - **Property 2: Dựng URL an toàn và mã hóa access_token khứ hồi**
    - Generator `anyAccessToken` (ký tự đặc biệt + Unicode) và `anyPath`; xác nhận URL luôn scheme `https`, và với URL stream `Uri.queryParameters['access_token']` giải mã lại đúng token ban đầu
    - **Validates: Requirements 1.4, 1.8**

  - [~] 3.4 Hiện thực `SseParser` (hàm thuần)
    - Tạo `lib/services/sse_parser.dart`: `splitBuffer(buffer) -> (blocks, remainder)` tách theo `\n\n`; `parseFrame(rawBlock) -> StreamEvent?` ghép dòng `data:`, `jsonDecode` trong `try/catch` (JSON lỗi → `null`), lọc `stage` ngoài tập hợp lệ → `null`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [~] 3.5 Viết property test phân tích SSE
    - **Property 5: Phân tích SSE khứ hồi và chỉ chấp nhận stage hợp lệ**
    - Generator `anyStreamEventValid` (mã hóa thành khung `data:` chuẩn) và `anyRawFrame` (JSON hỏng + stage lạ); xác nhận round-trip cùng `stage`/trường, và khung hỏng/stage lạ → `null` không ném lỗi
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [~] 3.6 Hiện thực `SseClient` (streamed GET)
    - Tạo `lib/services/sse_client.dart`: mở `GET /stories/:id/stream?access_token=<urlEncoded>` qua `http.Client().send(Request)`, đọc `response.stream.transform(utf8.decoder)`, tích lũy buffer + dùng `SseParser.splitBuffer`/`parseFrame`, phát `Stream<StreamEvent>`; `close()` đóng kết nối
    - _Requirements: 1.4, 5.2, 6.1_

  - [-] 3.7 Hiện thực `LocalStore`
    - Tạo `lib/services/local_store.dart` bọc `shared_preferences`: đọc/ghi JSON theo khóa `reading_settings` (toàn cục) và `reading_position:<storyId>` (theo truyện)
    - _Requirements: 12.1, 12.3_

  - [-] 3.8 Hiện thực `ShareService`
    - Tạo `lib/services/share_service.dart` bọc `share_plus`: `shareText(text, {subject})` trả `ShareOutcome { success, dismissed, failure }` (ánh xạ từ `ShareResult`)
    - _Requirements: 13.1, 13.2, 13.6, 13.7_

- [ ] 4. Repository và logic thuần (dễ unit/property test)
  - [~] 4.1 Hiện thực `StoryRepository` (phương thức gọi API)
    - Tạo `lib/repositories/story_repository.dart`: `getStylePresets` (fallback `co_man_warm_modern_blueprint` khi lỗi), `getAuthMe`, `setupSuggest`, `listStories`, `createStory`, `getStory`, `resumeStory`, `rewriteChapter`, `renameStory`, `deleteStory` — tất cả trả `ApiResponse<T>` và dùng `ApiClient`
    - _Requirements: 3.4, 3.5, 2.4, 4.1, 5.1, 8.1, 8.3, 8.4, 8.5, 9.3, 10.3_

  - [~] 4.2 Hiện thực logic truyện thuần
    - Tạo `lib/logic/story_logic.dart`: `canResumeStory(SavedStory)` (`status != completed && (canResume == true || 0 < chapterCount < TOTAL_CHAPTERS)`); `upsertChapterByIndex(existing, next)` (xóa cùng index, chèn lại, sort tăng theo index); `buildStoryMarkdown(title, payload)`; `buildChapterShareText(title, chapter)`; hằng `TOTAL_CHAPTERS = 15`
    - _Requirements: 9.1, 6.5, 5.8, 13.1, 13.2, 13.3_

  - [~] 4.3 Viết property test vị từ viết tiếp
    - **Property 8: Vị từ "có thể viết tiếp truyện"**
    - Generator `anySavedStory` (status bất kỳ, `canResume` null/true/false, `chapterCount` 0..16); xác nhận `canResumeStory` đúng iff điều kiện hợp lệ
    - **Validates: Requirements 9.1**

  - [~] 4.4 Viết property test tính lũy đẳng nạp chương
    - **Property 6: Tính lũy đẳng (idempotent) của việc nạp chương qua SSE**
    - Generator `anyChapterEventSequence` (index trùng, thứ tự ngẫu nhiên); xác nhận áp dụng một lần và nhiều lần qua `upsertChapterByIndex` cho cùng tập chương (mỗi index một lần, nội dung event cuối, sort tăng theo index)
    - **Validates: Requirements 6.5, 5.8**

  - [~] 4.5 Viết property test thứ tự Markdown bản thảo
    - **Property 13: Markdown bản thảo theo thứ tự index tăng dần**
    - Generator `anyChapters` (index xáo trộn, có thể thưa); xác nhận `buildStoryMarkdown` chứa nhan đề và toàn bộ chương, vị trí xuất hiện đơn điệu tăng theo `index`
    - **Validates: Requirements 13.2, 13.3**

  - [~] 4.6 Viết unit test dựng văn bản chia sẻ chương
    - Kiểm tra `buildChapterShareText` ghép nhan đề truyện + nội dung chương đúng định dạng cho ví dụ thường và biên
    - _Requirements: 13.1_

  - [~] 4.7 Hiện thực `AuthRepository`
    - Tạo `lib/repositories/auth_repository.dart` điều phối `SupabaseAuthService` + `StoryRepository.getAuthMe`: đăng nhập/đăng xuất, khôi phục phiên, nạp `AccountSnapshot`
    - _Requirements: 2.3, 2.4, 2.7, 2.9, 2.11_

  - [~] 4.8 Hiện thực `ReadingRepository`
    - Tạo `lib/repositories/reading_repository.dart` dùng `LocalStore`: `loadSettings`/`saveSettings`, `loadPosition(storyId)`/`savePosition(storyId, position)` qua `toJson`/`fromJson`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.7_

  - [~] 4.9 Viết property test khứ hồi `Reading_Settings`
    - **Property 11: Khứ hồi lưu/nạp Reading_Settings**
    - Generator `anyReadingSettings`; dùng `SharedPreferences.setMockInitialValues` (LocalStore in-memory); xác nhận lưu rồi nạp lại cho tập tương đương
    - **Validates: Requirements 12.5**

  - [~] 4.10 Viết property test khứ hồi `Reading_Position`
    - **Property 12: Khứ hồi lưu/nạp Reading_Position**
    - Generator `anyReadingPosition` + `storyId` bất kỳ; xác nhận lưu rồi nạp lại cho vị trí tương đương
    - **Validates: Requirements 12.6**

- [~] 5. Checkpoint - Bảo đảm tầng dữ liệu/dịch vụ/logic ổn định
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Controllers (Riverpod) và logic trạng thái
  - [~] 6.1 Hiện thực reducer stream thuần
    - Tạo `lib/logic/stream_reducer.dart`: `reduceStream(StoryWorkspaceState, StreamEvent) -> StoryWorkspaceState` xử lý `progress` (phần trăm theo `current/total`, kẹp [0,100], nhãn ưu tiên `detail` rồi `label`), `overview/bible/plan/relationshipGraph`, `chapter` (qua `upsertChapterByIndex`, đặt chương đang xem), `done` (100%, hoàn tất), `error`
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [~] 6.2 Viết property test phần trăm tiến độ sinh truyện
    - **Property 7: Phần trăm tiến độ sinh truyện luôn hợp lệ**
    - Generator `anyProgressEvent` (gồm `total = 0`); xác nhận phần trăm ∈ [0,100] và nhãn ưu tiên `detail` rồi `label`
    - **Validates: Requirements 5.3**

  - [~] 6.3 Hiện thực `GenerationController`
    - Tạo `lib/controllers/generation_controller.dart` (Riverpod notifier): `createStory` (POST /stories → mở SSE qua `SseClient` → áp `reduceStream`), `resume` (GET /stories/:id → POST resume → mở lại SSE), đóng SSE + chuyển "cần thử lại" khi đứt trước `done`, làm mới danh sách + quota khi `done`
    - Xử lý 429 `quota_exceeded`, 409 `story_completed`/`story_not_resumable` (ánh xạ từ `ApiFailure.code`)
    - _Requirements: 5.1, 5.2, 5.9, 5.10, 7.4, 9.3, 9.4, 9.5, 15.2_

  - [~] 6.4 Viết unit test luồng sinh truyện và viết tiếp
    - Các nhánh reduce overview/bible/plan/graph/done (5.4–5.9), trình tự resume (9.3), 409 (9.4, 9.5), 429 quota (7.4), SSE đứt trước `done` chuyển "cần thử lại" (15.2)
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.9, 7.4, 9.3, 9.4, 9.5, 15.2_

  - [~] 6.5 Hiện thực `AuthController`
    - Tạo `lib/controllers/auth_controller.dart`: theo dõi `authStateChanges`, khôi phục phiên khi khởi động (xóa khi hết hạn → chưa đăng nhập), gọi `/auth/me` với **retry ≤3 lần cách 5s** và timeout 10s, đăng xuất (đóng SSE + xóa state hồ sơ/quota/danh sách); chặn thao tác khi chưa đăng nhập
    - _Requirements: 2.3, 2.4, 2.5, 2.7, 2.8, 2.9, 2.11, 1.10_

  - [~] 6.6 Viết unit test xác thực
    - Retry `/auth/me` với fake timer (2.5), khôi phục/hết hạn phiên (2.9, 2.11), không gửi khi thiếu token + nhắc đăng nhập lại (1.10), 401 nhắc đăng nhập lại (15.4)
    - _Requirements: 2.5, 2.9, 2.11, 1.10, 15.4_

  - [~] 6.7 Hiện thực `ConfigController` + gợi ý kịch bản
    - Tạo `lib/controllers/config_controller.dart`: giữ `StoryConfig`, nạp style preset (fallback khi lỗi), hiện trường `customNiche` khi niche=`custom`; `setupSuggest` merge `title`/`seed`/`storyControls` vào cấu hình, trạng thái "đang xử lý" vô hiệu hóa nút sinh, xử lý 429 `setup_suggestion_quota_exceeded`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1, 4.2, 4.4, 4.6_

  - [~] 6.8 Viết unit test cấu hình và gợi ý
    - Fallback style preset (3.5), merge sau gợi ý (4.2), thông báo 429 setup_suggestion (4.4)
    - _Requirements: 3.5, 4.2, 4.4_

  - [~] 6.9 Hiện thực `QuotaController`
    - Tạo `lib/controllers/quota_controller.dart`: hiển thị "còn {remaining}/{limit}" cho `Story_Quota`, hạn mức gợi ý (Free: 10 lượt/ngày khi chưa có dữ liệu), cập nhật từ `quota`/`setupSuggestionQuota` của `POST /stories`, `/auth/me`, `setup-suggest`; vô hiệu nút theo quota=0
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 4.3, 4.5_

  - [~] 6.10 Hiện thực `LibraryController`
    - Tạo `lib/controllers/library_controller.dart`: `listStories`, mở truyện (`getStory`), `renameStory`, `deleteStory`, làm mới; dùng `canResumeStory` để hiện cờ "viết tiếp"; giữ nguyên danh sách cũ khi thao tác lỗi
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2_

  - [~] 6.11 Viết unit test tủ truyện
    - Đổi tên/xóa/làm mới phản ánh đúng (8.4–8.6), giữ danh sách cũ khi lỗi (8.7)
    - _Requirements: 8.4, 8.5, 8.6, 8.7_

  - [~] 6.12 Hiện thực `RewriteController`
    - Tạo `lib/controllers/rewrite_controller.dart`: hiện bảng viết lại khi truyện hoàn tất, chọn `RewriteMode`, gửi `rewriteChapter` khi hướng dẫn không rỗng, cập nhật chương + đồ thị quan hệ từ kết quả, vô hiệu nút khi hướng dẫn rỗng, trạng thái "Đang viết lại..."
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [~] 6.13 Viết unit test viết lại chương
    - Cập nhật chương + graph từ kết quả (10.4), vô hiệu khi hướng dẫn rỗng (10.5), trạng thái xử lý (10.6)
    - _Requirements: 10.4, 10.5, 10.6_

  - [~] 6.14 Hiện thực `ReaderController` + logic đọc thuần
    - Tạo `lib/logic/reading_logic.dart`: `progressPercent(currentIndex, inChapterProgress, totalChapters)` (∈[0,100], 0 ở đầu chương đầu, 100 ở cuối chương cuối)
    - Tạo `lib/controllers/reader_controller.dart`: sắp chương theo `index` tăng dần, `goToChapter/nextChapter/prevChapter` (vô hiệu ở biên), `updateSettings` áp tức thời + lưu, khôi phục `Reading_Position` (mở chương đầu nếu chưa có), đọc offline từ state đã nạp
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 12.4, 12.7, 15.5_

  - [~] 6.15 Viết property test thứ tự chương Reader
    - **Property 9: Reader hiển thị chương theo thứ tự index tăng dần**
    - Generator `anyChapters` (index thứ tự bất kỳ); xác nhận danh sách/mục lục sort tăng theo index, "chương trước" vô hiệu iff index nhỏ nhất, "chương kế" vô hiệu iff index lớn nhất
    - **Validates: Requirements 11.1, 11.6, 11.11, 11.12**

  - [~] 6.16 Viết property test phần trăm tiến độ đọc
    - **Property 10: Phần trăm tiến độ đọc luôn hợp lệ và đơn điệu**
    - Generator `anyReaderState` (currentIndex hợp lệ, inChapterProgress∈[0,1], total≥1); xác nhận `progressPercent` ∈[0,100], không giảm khi tiến độ tăng/chuyển chương sau, =0 đầu chương đầu, =100 cuối chương cuối
    - **Validates: Requirements 11.7**

  - [~] 6.17 Viết unit test khôi phục vị trí và đọc offline
    - Khôi phục `Reading_Position` đã lưu (12.4), mở chương đầu khi chưa có (12.7), đọc offline từ state phiên (15.5)
    - _Requirements: 12.4, 12.7, 15.5_

  - [~] 6.18 Hiện thực `ShareController`
    - Tạo `lib/controllers/share_controller.dart`: chia sẻ chương (`buildChapterShareText`) và toàn truyện (`buildStoryMarkdown`) qua `ShareService`; tắt chia sẻ toàn truyện khi `chapterCount == 0`, tắt chia sẻ chương khi nội dung rỗng; xử lý `dismissed` (không báo lỗi) và `failure` (báo lỗi, giữ màn hình)
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.6, 13.7_

  - [~] 6.19 Viết unit test chia sẻ
    - Vô hiệu theo chapterCount=0 (13.4) / nội dung rỗng (13.5), `ShareOutcome.failure` báo lỗi (13.6), `dismissed` không báo lỗi (13.7)
    - _Requirements: 13.4, 13.5, 13.6, 13.7_

- [~] 7. Checkpoint - Bảo đảm controller và logic ổn định
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Màn hình giao diện và điều hướng
  - [~] 8.1 Đấu nối điều hướng và `AppShell`
    - Tạo `lib/screens/app_shell.dart` + cấu hình `go_router`: `BottomNavigationBar` 3 mục (Cấu hình, Bản thảo, Tủ truyện); cổng cấu hình (Splash → màn hình lỗi cấu hình nêu khóa hỏng khi không hợp lệ; → Auth khi chưa đăng nhập; → Shell khi đã đăng nhập); Reader push chồng; reflow lưới 3 cột web thành luồng một cột theo tab; áp `AppTheme`
    - _Requirements: 1.5, 14.2, 14.3_

  - [~] 8.2 Hiện thực `AuthScreen`
    - Tạo `lib/screens/auth_screen.dart`: nút "Đăng nhập bằng Google" + nội dung mời đăng nhập (khi chưa đăng nhập), hiển thị tên/email + nhãn gói khi đã đăng nhập, lỗi đăng nhập + "Thử lại" cho `/auth/me`, đăng xuất
    - _Requirements: 2.1, 2.5, 2.6, 2.7, 2.10_

  - [~] 8.3 Hiện thực `ConfigScreen`
    - Tạo `lib/screens/config_screen.dart`: chọn `niche` (13 mục) + trường "Nhánh riêng" khi `custom`, trường "Nhan đề"/"Kịch bản", chọn "Giọng kể" + `outputLanguage`, ba thanh trượt (intensity/dialogueRatio/hookDensity), nút "Gợi ý kịch bản" (vô hiệu khi hết lượt/đang xử lý) và "Viết bản thảo" (vô hiệu khi quota=0 + mời nâng cấp), hiển thị hạn mức
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 3.8, 3.9, 4.5, 4.6, 7.1, 7.2, 7.3_

  - [~] 8.4 Hiện thực `StoryWorkspaceScreen` (5 thẻ)
    - Tạo `lib/screens/story_workspace_screen.dart`: `TabBar`/`TabBarView` 5 thẻ "Chương / Ý tưởng / Dàn ý / Hồ sơ / Quan hệ", hiệu ứng tải + nhãn tiến độ khi SSE chạy, bảng viết lại chương, nút "Đọc" (push Reader) và "Chia sẻ"; thông báo lỗi 429/409 + hướng dẫn "Viết tiếp truyện"
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 10.1, 13.1, 13.2, 15.2_

  - [~] 8.5 Hiện thực `LibraryScreen`
    - Tạo `lib/screens/library_screen.dart`: danh sách `SavedStory` + nhãn trạng thái VN, mở truyện, đổi tên, xóa (xác nhận), nút "Viết tiếp truyện" khi `canResumeStory`, làm mới; thông báo lỗi giữ nguyên danh sách
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.2_

  - [~] 8.6 Hiện thực `ReaderScreen`
    - Tạo `lib/screens/reader_screen.dart`: hiển thị chương theo index tăng, điều khiển cỡ chữ (≥5 bước 12–28), 3 chủ đề (light/sepia/dark), thanh độ sáng, chọn serif/sans, mục lục, chỉ báo % + "chương {n}/{tổng}", nút chương trước/kế (vô hiệu ở biên), lưu/khôi phục vị trí, nút "Chia sẻ"
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 13.1_

  - [~] 8.7 Viết widget test giao diện
    - Nút đăng nhập khi chưa đăng nhập (2.1), `custom` hiện trường nhánh riêng (3.2), 5 thẻ đúng nhãn (5.11), vô hiệu nút theo quota/instruction/empty (4.5, 7.3, 10.5, 13.4, 13.5), mục lục chọn chương (11.6), áp `Reading_Settings` tức thời (11.10), bottom-nav + push Reader (14.3), hai orientation (14.5)
    - _Requirements: 2.1, 3.2, 5.11, 4.5, 7.3, 10.5, 13.4, 13.5, 11.6, 11.10, 14.3, 14.5_

- [ ] 9. Đấu nối tổng và khởi tạo ứng dụng
  - [~] 9.1 Hoàn thiện `main.dart` và cấu hình nền tảng
    - Cập nhật `lib/main.dart`: bọc `ProviderScope`, gọi `Supabase.initialize` từ `AppConfig`, chạy `AppConfig.validate()` (cổng `configValidProvider`), đăng ký router/`AppShell`, đấu nối toàn bộ provider/controller; đăng ký deep link `cc.novelkit.drama15://login-callback` trong `Info.plist` (iOS) và `AndroidManifest.xml` (Android)
    - _Requirements: 1.1, 1.2, 1.5, 1.7, 2.3, 14.6_

  - [~] 9.2 Viết integration/smoke test
    - Integration: OAuth mở trình duyệt + hoàn tất qua deep link (2.2, 2.3), khôi phục/hết hạn phiên Supabase (2.9, 2.11), mở share sheet OS (13.1, 13.2); Smoke: theme tokens khớp web (14.1), kích thước chạm tối thiểu (14.4), nhãn UI tiếng Việt (14.6)
    - _Requirements: 2.2, 2.3, 2.9, 2.11, 13.1, 13.2, 14.1, 14.4, 14.6_

- [~] 10. Checkpoint cuối - Bảo đảm toàn bộ test pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tác vụ đánh dấu `*` là tùy chọn (test) và có thể bỏ qua để ra MVP nhanh; tác vụ không có `*` là phần triển khai cốt lõi phải thực hiện.
- 13 thuộc tính đúng đắn ↔ 13 property-based test (`glados`, ≥100 vòng), mỗi test gắn tag `// Feature: flutter-drama-mobile-app, Property {n}: ...` và đặt sát phần triển khai để bắt lỗi sớm.
- Logic thuần (config validate, dựng URL, parse SSE, upsert chương, reducer, vị từ resume, (de)serialize, markdown, tiến độ đọc) tách khỏi transport/UI để test độc lập.
- Round-trip lưu cục bộ (P11/P12) dùng `SharedPreferences.setMockInitialValues` (in-memory), không chạm I/O thật.
- Mỗi tác vụ tham chiếu yêu cầu cụ thể để truy vết; checkpoint bảo đảm kiểm chứng tăng tiến.
- Không gồm tác vụ triển khai/marketing/đào tạo; chỉ gồm tác vụ viết, sửa, kiểm thử mã.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.1", "2.3", "2.4", "2.6", "2.7", "3.7", "3.8"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.5", "3.1", "3.4", "4.2"] },
    { "id": 3, "tasks": ["3.2", "3.5", "3.6", "4.3", "4.4", "4.5", "4.6", "4.8", "6.1"] },
    { "id": 4, "tasks": ["3.3", "4.1", "4.9", "4.10", "6.2"] },
    { "id": 5, "tasks": ["4.7", "6.3", "6.7", "6.9", "6.10", "6.12", "6.14", "6.18"] },
    { "id": 6, "tasks": ["6.4", "6.5", "6.8", "6.11", "6.13", "6.15", "6.16", "6.17", "6.19"] },
    { "id": 7, "tasks": ["6.6", "8.2", "8.3", "8.4", "8.5", "8.6"] },
    { "id": 8, "tasks": ["8.1", "8.7"] },
    { "id": 9, "tasks": ["9.1"] },
    { "id": 10, "tasks": ["9.2"] }
  ]
}
```
