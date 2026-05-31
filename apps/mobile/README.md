# Drama 15 — Ứng dụng di động (Flutter)

Ứng dụng di động (iOS + Android) cho nền tảng **Drama 15: Xưởng viết tiểu thuyết ngắn** (NovelKit Studio).
Ứng dụng **tái sử dụng nguyên trạng** backend Fastify (`https://drama-api.novelkit.cc`) và Supabase Auth (Google OAuth) mà bản web đang dùng — không tạo backend mới.

Dự án nằm cạnh `apps/web` và `apps/api` trong monorepo.

## Yêu cầu môi trường

- Flutter SDK (kênh stable), Dart `^3.11.3`
- Xcode (build iOS) / Android SDK (build Android)

Cài đặt phụ thuộc:

```bash
flutter pub get
```

## Cấu hình build qua `--dart-define`

Ứng dụng đọc cấu hình kết nối lúc **build/run** qua các khóa `--dart-define`. Đây là cách nhúng giá trị vào binary thay vì đọc từ file `.env` lúc chạy.

| Khóa | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `API_BASE_URL` | Có | `https://drama-api.novelkit.cc` | URL cơ sở của API backend. **Phải là URL HTTPS hợp lệ.** |
| `SUPABASE_URL` | Có | _(không có)_ | URL dự án Supabase. **Phải là URL HTTPS hợp lệ.** |
| `SUPABASE_ANON_KEY` | Có | _(không có)_ | Khóa `anon` (public) của Supabase để khởi tạo client. **Không được rỗng.** |

> Nếu một trong ba giá trị bị thiếu hoặc không hợp lệ lúc chạy, ứng dụng sẽ hiển thị thông báo lỗi cấu hình và chặn các thao tác mạng mới (Yêu cầu 1.5, 1.9).

### Chạy ở chế độ phát triển

```bash
flutter run \
  --dart-define=API_BASE_URL=https://drama-api.novelkit.cc \
  --dart-define=SUPABASE_URL=https://<your-project>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<your-anon-key>
```

### Build phát hành

```bash
# iOS
flutter build ios \
  --dart-define=API_BASE_URL=https://drama-api.novelkit.cc \
  --dart-define=SUPABASE_URL=https://<your-project>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<your-anon-key>

# Android
flutter build apk \
  --dart-define=API_BASE_URL=https://drama-api.novelkit.cc \
  --dart-define=SUPABASE_URL=https://<your-project>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<your-anon-key>
```

> Mẹo: có thể dùng `--dart-define-from-file=env.json` để truyền cả ba khóa từ một file JSON thay vì liệt kê từng khóa.

## Cấu trúc thư mục

```
lib/
  config/        # AppConfig, kiểm tra cấu hình (--dart-define)
  theme/         # AppTheme: token màu/phông giống bản web, ReaderTheme
  models/        # Mô hình dữ liệu bất biến, ánh xạ 1-1 JSON API
  services/      # ApiClient, SseClient, SupabaseAuthService, LocalStore, ShareService
  repositories/  # StoryRepository, AuthRepository, ReadingRepository
  logic/         # Hàm thuần: SSE parser, reducer, vị từ resume, markdown, tiến độ đọc
  controllers/   # Riverpod notifiers cho từng màn hình/module
  screens/       # Widget/màn hình giao diện
  main.dart      # Điểm khởi đầu ứng dụng

test/            # Unit/widget/property test, phản chiếu cấu trúc lib/
```

## Phụ thuộc chính

- `flutter_riverpod` — quản lý trạng thái
- `supabase_flutter` — xác thực Google OAuth qua Supabase
- `http` — gọi REST + SSE (streamed GET)
- `shared_preferences` — lưu thiết lập/vị trí đọc cục bộ
- `share_plus` — chia sẻ qua share sheet của hệ điều hành
- `go_router` — điều hướng và deep link
- `google_fonts` — phông chữ giống bản web
- `app_links` — bắt deep link redirect sau đăng nhập OAuth

Dev: `glados` (property-based testing), `flutter_test`, `integration_test`.

## Deep link OAuth

Redirect URI dùng cho luồng đăng nhập Google trên di động: `cc.novelkit.drama15://login-callback`
(sẽ được đăng ký trong `Info.plist`/`AndroidManifest.xml` và Supabase Auth → Redirect URLs ở tác vụ 9.1).

## Kiểm thử

```bash
flutter test         # unit + widget + property test
flutter analyze      # phân tích tĩnh
```
