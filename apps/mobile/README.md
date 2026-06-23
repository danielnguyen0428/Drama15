# Drama 15 — Mobile (Flutter)

Ứng dụng di động cho nền tảng "Drama 15", dùng lại nguyên trạng backend Fastify
(`https://drama-api.novelkit.cc`) và Supabase Auth (Google OAuth).

## Cấu hình build (bắt buộc)

App đọc 3 giá trị nhúng lúc build qua `--dart-define`:

| Khóa | Bắt buộc | Mặc định |
|---|---|---|
| `API_BASE_URL` | Không | `https://drama-api.novelkit.cc` |
| `SUPABASE_URL` | **Có** | (không có) |
| `SUPABASE_ANON_KEY` | **Có** | (không có) |

Thiếu/sai `SUPABASE_URL` hoặc `SUPABASE_ANON_KEY` → app hiển thị **màn hình lỗi
cấu hình** và chặn mọi request mạng (đúng theo Requirement 1.5/1.9).

### Cách 1 — file env.json (khuyến nghị)

`env.json` đã được sinh sẵn từ `.env` ở gốc repo (đã thêm vào `.gitignore`,
**không commit**). Mẫu công khai: `env.example.json`.

```bash
flutter run            --dart-define-from-file=env.json
flutter build apk      --dart-define-from-file=env.json
flutter build ipa      --dart-define-from-file=env.json
```

Tạo lại `env.json` từ `.env` gốc khi cần:

```bash
# từ thư mục gốc repo
SU=$(grep -E '^SUPABASE_URL=' .env | cut -d= -f2-)
SK=$(grep -E '^SUPABASE_ANON_KEY=' .env | cut -d= -f2-)
printf '{\n  "API_BASE_URL": "https://drama-api.novelkit.cc",\n  "SUPABASE_URL": "%s",\n  "SUPABASE_ANON_KEY": "%s"\n}\n' "$SU" "$SK" > apps/mobile/env.json
```

### Cách 2 — truyền cờ trực tiếp

```bash
flutter run \
  --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJhbGci...
```

## Deep link OAuth

Redirect URI: `cc.novelkit.drama15://login-callback` — đã đăng ký sẵn ở
`android/app/src/main/AndroidManifest.xml` (intent-filter) và
`ios/Runner/Info.plist` (`CFBundleURLTypes`).

**Cần làm phía Supabase**: thêm `cc.novelkit.drama15://login-callback` vào
Supabase Dashboard → Authentication → URL Configuration → **Redirect URLs**.

## Kiểm thử

```bash
flutter analyze
flutter test                       # unit + widget + property tests (20 property tests)
flutter test integration_test \    # cần thiết bị/emulator thật
  --dart-define-from-file=env.json
```
