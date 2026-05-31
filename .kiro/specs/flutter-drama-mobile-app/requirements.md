# Requirements Document

## Introduction

Tài liệu này mô tả yêu cầu cho một ứng dụng di động (mobile) viết bằng Flutter cho nền tảng "Drama 15: Xưởng viết tiểu thuyết ngắn" (NovelKit Studio). Ứng dụng di động phải tái hiện đầy đủ chức năng sáng tác drama của bản web hiện tại, sử dụng lại chính API backend (Fastify) mà bản web đang dùng tại `VITE_API_URL` (môi trường production: `https://drama-api.novelkit.cc`) và Supabase Auth (Google OAuth). Ứng dụng giữ phong cách thị giác (style) tương tự bản web nhưng được tối ưu cho màn hình di động, đồng thời bổ sung hai nhóm tính năng mới: chế độ đọc (Reader) tương tự Apple Books và chức năng chia sẻ qua share sheet của hệ điều hành.

Phạm vi: ứng dụng client di động (Flutter). Không tạo backend mới; mọi nghiệp vụ sinh truyện, hạn mức và lưu trữ vẫn do API và Supabase hiện có đảm nhiệm. Một bản thảo Drama 15 luôn gồm cố định 15 chương.

## Glossary

- **App**: Ứng dụng di động Flutter được mô tả trong tài liệu này, bao gồm toàn bộ các mô-đun bên dưới.
- **Auth_Module**: Mô-đun xác thực, xử lý đăng nhập Google OAuth qua Supabase và quản lý phiên (session) trên thiết bị di động.
- **API_Client**: Mô-đun gọi API backend hiện có qua HTTPS, gắn token xác thực vào mỗi yêu cầu.
- **Config_Module**: Mô-đun cấu hình truyện, thu thập các tham số `StoryConfig` từ người dùng.
- **Suggest_Module**: Mô-đun gọi `POST /story/setup-suggest` để gợi ý nhan đề, kịch bản và story controls.
- **Generation_Module**: Mô-đun tạo bản thảo, gọi `POST /stories` và nhận sự kiện sinh truyện trực tiếp qua SSE từ `GET /stories/:id/stream`.
- **Quota_Module**: Mô-đun theo dõi và hiển thị hạn mức truyện (`quota`) và hạn mức gợi ý kịch bản (`setupSuggestionQuota`).
- **Library_Module**: Mô-đun tủ truyện, quản lý danh sách truyện đã lưu (liệt kê, mở, viết tiếp, đổi tên, xóa).
- **Rewrite_Module**: Mô-đun viết lại một chương đã hoàn tất, gọi `POST /stories/:id/rewrite`.
- **Reader**: Trình đọc kiểu Apple Books, hiển thị nội dung chương với điều khiển kiểu chữ, chủ đề, độ sáng, mục lục và lưu vị trí đọc.
- **Share_Module**: Mô-đun chia sẻ truyện hoặc chương qua share sheet của hệ điều hành.
- **SSE_Parser**: Thành phần phân tích (parse) các sự kiện Server-Sent Events dạng JSON do API gửi về trong lúc sinh truyện.
- **Reading_Settings**: Tập thiết lập đọc của người dùng (cỡ chữ, họ phông, chủ đề, độ sáng) được lưu trên thiết bị.
- **Reading_Position**: Vị trí đọc gần nhất của một truyện (chương hiện tại và tiến độ trong chương) được lưu trên thiết bị.
- **StoryConfig**: Cấu hình truyện gồm `niche`, `customNiche`, `title`, `seed`, `outputLanguage`, `intensity`, `dialogueRatio`, `hookDensity`, `stylePreset`, `storyControls` (tùy chọn).
- **StoryPayload**: Nội dung truyện trả về từ API gồm `title`, `concept`, `storyBible`, `chapterPlan`, `chapters`, `relationshipGraph` (tùy chọn).
- **SavedStory**: Bản tóm tắt truyện đã lưu gồm `id`, `title`, `status`, `createdAt`, `updatedAt`, `chapterCount`, `canResume`, `error`.
- **Story_Status**: Trạng thái truyện, một trong: `queued`, `running`, `completed`, `failed`.
- **Setup_Suggestion_Quota**: Hạn mức số lượt gợi ý kịch bản trong ngày (gói Free: 10 lượt/ngày).
- **Story_Quota**: Hạn mức số bản thảo truyện được tạo trong ngày theo từng gói (free/pro/premium).
- **TOTAL_CHAPTERS**: Hằng số bằng 15, là số chương cố định của một bản thảo Drama 15 hoàn chỉnh.
- **Access_Token**: Token truy cập (JWT) do Supabase cấp cho phiên đăng nhập hiện tại.

## Requirements

### Requirement 1: Cấu hình kết nối API và Supabase hiện có

**User Story:** Là người dùng di động, tôi muốn ứng dụng kết nối tới đúng backend và Supabase mà bản web đang dùng, để dữ liệu và tài khoản của tôi đồng nhất trên mọi nền tảng.

#### Acceptance Criteria

1. THE App SHALL đọc địa chỉ API cơ sở từ giá trị cấu hình `API_BASE_URL` được nhúng lúc build, với giá trị mặc định `https://drama-api.novelkit.cc` cho bản phát hành production, và `API_BASE_URL` phải là một URL HTTPS hợp lệ.
2. THE App SHALL đọc `SUPABASE_URL` và `SUPABASE_ANON_KEY` từ cấu hình build để khởi tạo client Supabase, trong đó `SUPABASE_URL` phải là một URL HTTPS hợp lệ.
3. WHEN App gửi bất kỳ yêu cầu nào tới một endpoint yêu cầu xác thực, THE API_Client SHALL gắn header `Authorization` với giá trị `Bearer <Access_Token>` của access token còn hiệu lực thuộc phiên hiện tại.
4. WHEN App mở luồng SSE tại `GET /stories/:id/stream`, THE API_Client SHALL truyền `Access_Token` còn hiệu lực qua tham số truy vấn `access_token` đã được mã hóa URL.
5. IF một trong các giá trị `API_BASE_URL`, `SUPABASE_URL` hoặc `SUPABASE_ANON_KEY` bị thiếu hoặc không hợp lệ (rỗng, hoặc không phải URL HTTPS hợp lệ đối với `API_BASE_URL` và `SUPABASE_URL`) lúc chạy, THEN THE App SHALL hiển thị thông báo lỗi cấu hình cho biết giá trị cấu hình nào không sử dụng được.
6. WHEN App phát hiện lỗi cấu hình thiếu hoặc không hợp lệ trong lúc một yêu cầu mạng đang diễn ra, THE App SHALL cho phép yêu cầu đang diễn ra đó hoàn tất.
7. WHILE cả ba giá trị `API_BASE_URL`, `SUPABASE_URL` và `SUPABASE_ANON_KEY` đều hiện diện và hợp lệ, THE App SHALL cho phép các thao tác mạng tiếp tục.
8. THE API_Client SHALL gửi mọi yêu cầu tới API qua giao thức HTTPS.
9. IF một trong các giá trị `API_BASE_URL`, `SUPABASE_URL` hoặc `SUPABASE_ANON_KEY` bị thiếu hoặc không hợp lệ lúc chạy, THEN THE App SHALL chặn mọi thao tác yêu cầu mạng mới cho tới khi cả ba giá trị đều hiện diện và hợp lệ.
10. IF App cần gọi một endpoint yêu cầu xác thực nhưng không có access token còn hiệu lực của phiên hiện tại, THEN THE App SHALL không gửi yêu cầu đó, hiển thị thông báo yêu cầu đăng nhập lại, và giữ nguyên trạng thái dữ liệu hiện tại.

### Requirement 2: Đăng nhập Google qua Supabase trên di động

**User Story:** Là người dùng, tôi muốn đăng nhập bằng tài khoản Google trên điện thoại, để gợi ý kịch bản, viết bản thảo và giữ lại tủ truyện của mình.

#### Acceptance Criteria

1. WHEN người dùng chưa đăng nhập mở App, THE App SHALL hiển thị nút "Đăng nhập bằng Google" và nội dung mời đăng nhập.
2. WHEN người dùng chọn "Đăng nhập bằng Google", THE Auth_Module SHALL mở luồng OAuth Google của Supabase trên trình duyệt hệ thống trong vòng 2 giây kể từ thao tác chọn.
3. WHEN nhà cung cấp OAuth chuyển hướng về App qua deep link đã đăng ký, THE Auth_Module SHALL hoàn tất phiên đăng nhập và lưu `Access_Token` của phiên.
4. WHEN phiên đăng nhập được thiết lập, THE App SHALL gọi `GET /auth/me` để nạp hồ sơ người dùng, `Story_Quota` và `Setup_Suggestion_Quota`, và coi lần gọi là thất bại nếu không nhận được phản hồi thành công trong vòng 10 giây.
5. IF việc nạp hồ sơ qua `GET /auth/me` thất bại sau khi phiên đã được thiết lập, THEN THE App SHALL giữ người dùng ở trạng thái đã đăng nhập, hiển thị thông báo lỗi kèm tùy chọn "Thử lại", và tự động thử lại tối đa 3 lần, mỗi lần cách nhau 5 giây, cho tới khi nạp hồ sơ thành công.
6. WHEN người dùng đã đăng nhập, THE App SHALL hiển thị tên hiển thị (hoặc email khi không có tên) và nhãn gói (`Miễn phí`, `Pro`, hoặc `Premium`).
7. WHEN người dùng chọn "Đăng xuất", THE Auth_Module SHALL kết thúc phiên Supabase, đóng mọi luồng SSE đang mở, và xóa hồ sơ người dùng, hạn mức cùng danh sách truyện khỏi màn hình.
8. WHILE người dùng chưa đăng nhập, THE App SHALL chặn các thao tác gợi ý kịch bản, viết bản thảo, viết tiếp, đổi tên, xóa và viết lại chương, đồng thời hiển thị thông báo yêu cầu đăng nhập.
9. WHEN App khởi động lại trong khi phiên Supabase còn hiệu lực, THE Auth_Module SHALL khôi phục phiên đã lưu mà không yêu cầu người dùng đăng nhập lại.
10. IF việc hoàn tất đăng nhập Google thất bại, bị người dùng hủy, hoặc không hoàn tất trong vòng 120 giây, THEN THE Auth_Module SHALL hiển thị thông báo lỗi đăng nhập và giữ người dùng ở trạng thái chưa đăng nhập.
11. IF phiên Supabase đã lưu hết hiệu lực hoặc không hợp lệ khi App khởi động lại, THEN THE Auth_Module SHALL xóa phiên đã lưu và đưa người dùng về trạng thái chưa đăng nhập kèm thông báo yêu cầu đăng nhập lại.

### Requirement 3: Cấu hình truyện

**User Story:** Là người viết, tôi muốn cấu hình dòng truyện, nhan đề, cốt truyện, giọng kể, ngôn ngữ và các thanh trượt cảm xúc, để định hướng bản thảo theo ý mình.

#### Acceptance Criteria

1. THE Config_Module SHALL hiển thị danh sách chọn `niche` gồm đúng 13 lựa chọn: `billionaire_rich_poor_romance`, `humiliation_revenge_justice`, `secret_identity_hidden_heiress`, `toxic_family_betrayal`, `cheating_ex_wedding_drama`, `single_mom_poor_woman_comeback`, `social_injustice_discrimination_drama`, `workplace_ceo_power_struggle`, `medical_hidden_doctor_life_care`, `school_campus_bullying_identity`, `werewolf_luna_alpha_soulmate`, `steamy_alien_captive_romance`, và `custom`, hiển thị nhãn tiếng Việt tương ứng.
2. WHERE người dùng chọn `niche` bằng `custom`, THE Config_Module SHALL hiển thị trường nhập "Nhánh riêng" để nhập `customNiche`.
3. THE Config_Module SHALL cung cấp các trường nhập "Nhan đề dự kiến" (`title`) và "Kịch bản / cốt truyện" (`seed`), cả hai được phép để trống.
4. WHEN App khởi tạo màn hình cấu hình, THE Config_Module SHALL gọi `GET /story/style-presets` và hiển thị danh sách "Giọng kể" (`stylePreset`) từ kết quả trả về.
5. IF không nạp được danh sách style preset, THEN THE Config_Module SHALL hiển thị một giọng kể mặc định dự phòng `co_man_warm_modern_blueprint` để người dùng vẫn tiếp tục được.
6. THE Config_Module SHALL cho phép chọn `outputLanguage` trong tập: `vietnamese`, `english`, `japanese`, `korean`, `spanish`, `portuguese`, với giá trị mặc định `vietnamese`.
7. THE Config_Module SHALL hiển thị thanh trượt "Cường độ cảm xúc" (`intensity`) trong khoảng 0 đến 1 với giá trị mặc định 0.84.
8. THE Config_Module SHALL hiển thị thanh trượt "Tỷ lệ thoại" (`dialogueRatio`) trong khoảng 0.2 đến 0.85 với giá trị mặc định 0.56.
9. THE Config_Module SHALL hiển thị thanh trượt "Mật độ móc câu" (`hookDensity`) trong khoảng 0 đến 1 với giá trị mặc định 0.67.
10. WHEN người dùng gửi cấu hình tới API, THE Config_Module SHALL gửi thân yêu cầu khớp với cấu trúc `StoryConfig` mà API yêu cầu.

### Requirement 4: Gợi ý kịch bản

**User Story:** Là người viết, tôi muốn nhờ hệ thống gợi ý nhan đề và cốt truyện, để có điểm khởi đầu nhanh khi bí ý tưởng.

#### Acceptance Criteria

1. WHEN người dùng đã đăng nhập chọn "Gợi ý kịch bản", THE Suggest_Module SHALL gọi `POST /story/setup-suggest` với `StoryConfig` hiện tại.
2. WHEN `POST /story/setup-suggest` trả về thành công, THE Suggest_Module SHALL điền `title`, `seed` và `storyControls` nhận được vào cấu hình hiện tại.
3. WHEN phản hồi gợi ý chứa `setupSuggestionQuota`, THE Quota_Module SHALL cập nhật hạn mức gợi ý kịch bản hiển thị.
4. IF API trả về mã 429 với code `setup_suggestion_quota_exceeded`, THEN THE Suggest_Module SHALL hiển thị thông báo đã hết lượt gợi ý kịch bản trong ngày.
5. WHILE `Setup_Suggestion_Quota` còn lại bằng 0, THE Config_Module SHALL vô hiệu hóa nút "Gợi ý kịch bản".
6. WHILE yêu cầu gợi ý đang được xử lý, THE Suggest_Module SHALL hiển thị trạng thái đang xử lý và vô hiệu hóa các nút thao tác sinh truyện.

### Requirement 5: Tạo bản thảo và nhận sinh truyện trực tiếp qua SSE

**User Story:** Là người viết, tôi muốn bấm "Viết bản thảo" và xem truyện được sinh ra theo thời gian thực, để theo dõi tiến trình và đọc từng chương ngay khi hoàn thành.

#### Acceptance Criteria

1. WHEN người dùng đã đăng nhập chọn "Viết bản thảo", THE Generation_Module SHALL gọi `POST /stories` với `StoryConfig` hiện tại.
2. WHEN `POST /stories` trả về 201 kèm `storyId`, THE Generation_Module SHALL mở luồng SSE tại `GET /stories/:id/stream` cho `storyId` đó.
3. WHEN luồng SSE phát sự kiện `progress`, THE Generation_Module SHALL cập nhật phần trăm tiến độ theo `current` và `total`, và hiển thị nhãn từ `detail` hoặc `label`.
4. WHEN luồng SSE phát sự kiện `overview`, THE Generation_Module SHALL hiển thị nhan đề và phần "Ý tưởng" (concept).
5. WHEN luồng SSE phát sự kiện `bible`, THE Generation_Module SHALL lưu và hiển thị nội dung "Hồ sơ" (story bible).
6. WHEN luồng SSE phát sự kiện `plan`, THE Generation_Module SHALL hiển thị "Dàn ý" chương.
7. WHEN luồng SSE phát sự kiện `relationshipGraph`, THE Generation_Module SHALL lưu và hiển thị đồ thị quan hệ nhân vật.
8. WHEN luồng SSE phát sự kiện `chapter`, THE Generation_Module SHALL thêm hoặc cập nhật chương theo `index` và đặt chương đó làm chương đang xem.
9. WHEN luồng SSE phát sự kiện `done`, THE Generation_Module SHALL đặt tiến độ thành 100%, chuyển truyện sang trạng thái hoàn tất, đóng luồng SSE, và làm mới danh sách truyện cùng hạn mức.
10. WHILE luồng SSE đang hoạt động, THE App SHALL hiển thị một hiệu ứng (animation) đang tải cùng nhãn tiến độ.
11. THE App SHALL trình bày năm thẻ (tab) nội dung truyện: "Chương", "Ý tưởng", "Dàn ý", "Hồ sơ", và "Quan hệ".

### Requirement 6: Phân tích sự kiện SSE an toàn

**User Story:** Là người viết, tôi muốn ứng dụng xử lý đúng các sự kiện sinh truyện, để nội dung hiển thị không bị sai lệch hay treo khi gặp dữ liệu bất thường.

#### Acceptance Criteria

1. WHEN SSE_Parser nhận một dòng dữ liệu sự kiện, THE SSE_Parser SHALL phân tích phần thân JSON thành một đối tượng sự kiện có trường `stage`.
2. THE SSE_Parser SHALL xử lý đúng tất cả giá trị `stage` hợp lệ: `progress`, `overview`, `bible`, `plan`, `relationshipGraph`, `chapter`, `done`, `error`.
3. IF một sự kiện SSE chứa JSON không hợp lệ, THEN THE SSE_Parser SHALL bỏ qua sự kiện đó và giữ nguyên trạng thái truyện hiện có.
4. IF một sự kiện SSE có `stage` không nằm trong tập hợp lệ, THEN THE SSE_Parser SHALL bỏ qua sự kiện đó mà không làm dừng luồng.
5. WHEN SSE_Parser phân tích cùng một tập sự kiện `chapter` nhiều lần, THE Generation_Module SHALL tạo ra cùng một tập chương theo `index` (kết quả không phụ thuộc số lần áp dụng trùng).

### Requirement 7: Quản lý hạn mức truyện

**User Story:** Là người dùng, tôi muốn biết mình còn bao nhiêu lượt viết bản thảo và gợi ý trong ngày, để chủ động trước khi hết hạn mức.

#### Acceptance Criteria

1. THE Quota_Module SHALL hiển thị số bản thảo truyện còn lại trên tổng giới hạn trong ngày theo định dạng "còn {remaining}/{limit}".
2. THE Quota_Module SHALL hiển thị số lượt gợi ý kịch bản còn lại trong ngày, và với gói Free hiển thị nội dung "Free: 10 lượt gợi ý kịch bản/ngày" khi chưa có dữ liệu hạn mức cụ thể.
3. WHILE `Story_Quota` còn lại bằng 0, THE Config_Module SHALL vô hiệu hóa nút "Viết bản thảo" và hiển thị lời mời nâng cấp lên Pro hoặc Premium.
4. IF `POST /stories` trả về mã 429 với code `quota_exceeded`, THEN THE Generation_Module SHALL hiển thị thông báo đã hết bản thảo trong ngày kèm lời mời nâng cấp.
5. WHEN `POST /stories` hoặc `GET /auth/me` trả về dữ liệu `quota`, THE Quota_Module SHALL cập nhật số liệu hạn mức hiển thị theo giá trị mới nhất.

### Requirement 8: Tủ truyện

**User Story:** Là người viết, tôi muốn xem và quản lý tủ truyện đã lưu, để mở lại, đổi tên hoặc xóa các bản thảo.

#### Acceptance Criteria

1. WHEN người dùng đã đăng nhập mở tủ truyện, THE Library_Module SHALL gọi `GET /stories` và hiển thị danh sách `SavedStory` kèm `title` và nhãn `Story_Status`.
2. THE Library_Module SHALL hiển thị nhãn trạng thái tiếng Việt tương ứng: `queued` → "Đang chờ", `running` → "Đang viết", `completed` → "Hoàn tất", `failed` → "Có lỗi".
3. WHEN người dùng chọn mở một truyện, THE Library_Module SHALL gọi `GET /stories/:id` và hiển thị `StoryPayload` của truyện đó qua các thẻ nội dung.
4. WHEN người dùng đổi tên một truyện và nhập tiêu đề hợp lệ, THE Library_Module SHALL gọi `PATCH /stories/:id` với tiêu đề mới và cập nhật danh sách sau khi thành công.
5. WHEN người dùng xác nhận xóa một truyện, THE Library_Module SHALL gọi `DELETE /stories/:id` và loại truyện đó khỏi danh sách sau khi thành công.
6. WHEN tủ truyện được làm mới, THE Library_Module SHALL hiển thị danh sách phản ánh kết quả mới nhất từ `GET /stories`.
7. IF một thao tác tủ truyện trả về lỗi, THEN THE Library_Module SHALL hiển thị thông báo lỗi tương ứng và giữ nguyên trạng thái danh sách trước đó.

### Requirement 9: Viết tiếp truyện dang dở

**User Story:** Là người viết, tôi muốn viết tiếp một truyện chưa hoàn tất, để hoàn thiện đủ 15 chương mà không tốn thêm hạn mức.

#### Acceptance Criteria

1. THE Library_Module SHALL xác định một truyện là có thể viết tiếp khi `Story_Status` khác `completed` và (`canResume` bằng true hoặc `chapterCount` lớn hơn 0 và nhỏ hơn `TOTAL_CHAPTERS`).
2. WHERE một truyện có thể viết tiếp, THE App SHALL hiển thị nút "Viết tiếp truyện" cho truyện đó.
3. WHEN người dùng chọn "Viết tiếp truyện", THE Generation_Module SHALL nạp bản thảo dang dở qua `GET /stories/:id`, gọi `POST /stories/:id/resume`, rồi mở lại luồng SSE để nhận các chương còn thiếu.
4. IF `POST /stories/:id/resume` trả về mã 409 với code `story_completed`, THEN THE App SHALL hiển thị thông báo truyện đã hoàn tất.
5. IF `POST /stories/:id/resume` trả về mã 409 với code `story_not_resumable`, THEN THE App SHALL hiển thị thông báo truyện chưa có bản thảo từng phần để viết tiếp.

### Requirement 10: Viết lại chương

**User Story:** Là người viết, tôi muốn viết lại một chương đã hoàn tất theo hướng dẫn cụ thể, để tinh chỉnh giọng văn và nhịp truyện.

#### Acceptance Criteria

1. WHILE truyện đang xem ở trạng thái hoàn tất, THE Rewrite_Module SHALL hiển thị bảng viết lại cho chương đang chọn.
2. THE Rewrite_Module SHALL cho phép chọn chế độ viết lại trong tập: `full_chapter`, `opening_hook`, `closing_beat`, `dialogue_tone`, `class_humiliation`, `retaliation_sharpness`, hiển thị nhãn tiếng Việt tương ứng.
3. WHEN người dùng gửi yêu cầu viết lại kèm hướng dẫn không rỗng, THE Rewrite_Module SHALL gọi `POST /stories/:id/rewrite` với `chapterIndex`, `mode` và `instruction`.
4. WHEN `POST /stories/:id/rewrite` trả về thành công, THE Rewrite_Module SHALL cập nhật nội dung chương và đồ thị quan hệ theo dữ liệu trả về.
5. IF trường hướng dẫn viết lại để trống, THEN THE Rewrite_Module SHALL vô hiệu hóa nút "Viết lại chương".
6. WHILE yêu cầu viết lại đang được xử lý, THE Rewrite_Module SHALL hiển thị trạng thái "Đang viết lại..." và vô hiệu hóa nút gửi.

### Requirement 11: Trình đọc kiểu Apple Books

**User Story:** Là độc giả, tôi muốn một chế độ đọc thoải mái giống Apple Books, để đọc các chương đã sinh với kiểu chữ và chủ đề tùy chỉnh.

#### Acceptance Criteria

1. WHEN người dùng mở Reader cho một truyện, THE Reader SHALL hiển thị nội dung các chương trong `StoryPayload.chapters` theo thứ tự `index` tăng dần, mỗi chương gồm tiêu đề chương và toàn bộ nội dung văn bản của chương đó.
2. THE Reader SHALL cung cấp điều khiển điều chỉnh cỡ chữ đọc theo ít nhất 5 bước rời rạc, trải từ cỡ nhỏ nhất 12 đến cỡ lớn nhất 28 (đơn vị logical pixel), với cỡ mặc định 18.
3. THE Reader SHALL cung cấp ít nhất ba chủ đề đọc: sáng (light), giấy ngà (sepia) và tối (dark).
4. THE Reader SHALL cung cấp điều khiển điều chỉnh độ sáng nội dung đọc trong khoảng 0 đến 1 với giá trị mặc định 1.
5. THE Reader SHALL cung cấp lựa chọn họ phông chữ đọc gồm ít nhất một phông có chân (serif) và một phông không chân (sans-serif).
6. THE Reader SHALL hiển thị mục lục (table of contents) liệt kê toàn bộ các chương trong `StoryPayload.chapters` theo thứ tự `index` tăng dần, và khi người dùng chọn một chương trong mục lục, hiển thị nội dung của chương được chọn.
7. THE Reader SHALL hiển thị chỉ báo tiến độ đọc của truyện hiện tại dưới dạng phần trăm từ 0% đến 100%, tính theo chỉ số chương hiện tại và tiến độ trong chương trên tổng số chương có trong `StoryPayload.chapters`, kèm nhãn "chương {n}/{tổng số chương}".
8. WHEN người dùng chọn chuyển sang chương kế tiếp hoặc chương trước, THE Reader SHALL hiển thị nội dung của chương có `index` liền kề tương ứng.
9. WHEN người dùng rời Reader rồi mở lại cùng một truyện, THE Reader SHALL khôi phục `Reading_Position` đã lưu của truyện đó.
10. WHEN người dùng thay đổi `Reading_Settings`, THE Reader SHALL áp dụng thiết lập mới cho nội dung đang đọc trong vòng 1 giây mà không yêu cầu người dùng rời khỏi Reader hoặc tải lại nội dung.
11. IF chương đang đọc là chương có `index` nhỏ nhất trong `StoryPayload.chapters`, THEN THE Reader SHALL vô hiệu hóa điều khiển chuyển về chương trước.
12. IF chương đang đọc là chương có `index` lớn nhất trong `StoryPayload.chapters`, THEN THE Reader SHALL vô hiệu hóa điều khiển chuyển sang chương kế tiếp.

### Requirement 12: Lưu thiết lập đọc và vị trí đọc trên thiết bị

**User Story:** Là độc giả, tôi muốn ứng dụng nhớ tùy chỉnh đọc và vị trí đang đọc của tôi, để không phải thiết lập lại mỗi lần mở app.

#### Acceptance Criteria

1. WHEN người dùng thay đổi `Reading_Settings`, THE Reader SHALL lưu thiết lập đó vào bộ nhớ cục bộ của thiết bị.
2. WHEN App khởi động, THE Reader SHALL nạp `Reading_Settings` đã lưu và áp dụng làm thiết lập mặc định.
3. WHEN người dùng đọc tới một vị trí trong một truyện, THE Reader SHALL lưu `Reading_Position` (chương hiện tại và tiến độ trong chương) cho truyện đó vào bộ nhớ cục bộ.
4. WHEN người dùng mở lại một truyện đã có `Reading_Position` đã lưu, THE Reader SHALL khôi phục đúng vị trí đã lưu.
5. THE Reader SHALL bảo đảm rằng việc lưu rồi nạp lại `Reading_Settings` cho ra một tập thiết lập tương đương với tập đã lưu (thuộc tính khứ hồi lưu/nạp).
6. THE Reader SHALL bảo đảm rằng việc lưu rồi nạp lại `Reading_Position` cho ra một vị trí tương đương với vị trí đã lưu (thuộc tính khứ hồi lưu/nạp).
7. IF không có `Reading_Position` đã lưu cho một truyện, THEN THE Reader SHALL mở truyện đó tại chương đầu tiên.

### Requirement 13: Chia sẻ truyện và chương

**User Story:** Là người dùng, tôi muốn chia sẻ một truyện hoặc một chương, để gửi cho bạn bè hoặc đăng lên nền tảng khác.

#### Acceptance Criteria

1. WHEN người dùng chọn chia sẻ một chương có nội dung văn bản khác rỗng, THE Share_Module SHALL mở share sheet của hệ điều hành trong vòng 2 giây với nội dung văn bản của chương đó kèm nhan đề truyện.
2. WHEN người dùng chọn chia sẻ toàn bộ truyện, THE Share_Module SHALL mở share sheet của hệ điều hành trong vòng 2 giây với nội dung bản thảo định dạng Markdown gồm nhan đề truyện và toàn bộ các chương.
3. THE Share_Module SHALL sinh nội dung Markdown của bản thảo gồm nhan đề truyện và toàn bộ các chương theo thứ tự `index` tăng dần.
4. WHILE truyện hiện tại có số chương bằng 0, THE Share_Module SHALL vô hiệu hóa thao tác chia sẻ toàn bộ truyện.
5. WHILE chương đang xem có nội dung văn bản rỗng, THE Share_Module SHALL vô hiệu hóa thao tác chia sẻ chương đó.
6. IF hệ điều hành không thể mở share sheet, THEN THE Share_Module SHALL hiển thị thông báo lỗi cho biết không thể chia sẻ và giữ nguyên màn hình hiện tại.
7. IF thao tác chia sẻ bị người dùng hủy, THEN THE App SHALL trở lại màn hình trước đó mà không hiển thị thông báo lỗi.

### Requirement 14: Giao diện tối ưu cho di động, giữ phong cách bản web

**User Story:** Là người dùng di động, tôi muốn một giao diện hợp với màn hình nhỏ nhưng vẫn mang phong cách của bản web, để trải nghiệm quen thuộc và thoải mái khi thao tác bằng cảm ứng.

#### Acceptance Criteria

1. THE App SHALL áp dụng bảng màu và phong cách thị giác tương tự bản web (nền giấy ngà, ngôn ngữ màu nhấn coral, phông chữ có chân cho tiêu đề và nội dung đọc).
2. THE App SHALL bố trí lại layout dạng nhiều cột của bản web thành luồng một cột hoặc điều hướng theo thẻ/đáy phù hợp với màn hình di động.
3. THE App SHALL cung cấp lối điều hướng di động giữa các khu vực: Cấu hình truyện, Bản thảo (các thẻ nội dung), Tủ truyện, và Trình đọc.
4. THE App SHALL bảo đảm các phần tử chạm (nút, thẻ, thanh trượt) có kích thước phù hợp thao tác cảm ứng.
5. WHEN thiết bị xoay giữa chiều dọc và chiều ngang, THE App SHALL hiển thị nội dung vừa khít với kích thước màn hình hiện tại.
6. THE App SHALL hiển thị toàn bộ nhãn và thông báo giao diện bằng tiếng Việt, đồng nhất với bản web.

### Requirement 15: Xử lý lỗi mạng và trạng thái ngoại tuyến

**User Story:** Là người dùng di động, tôi muốn ứng dụng phản hồi rõ ràng khi mất mạng hoặc API lỗi, để biết chuyện gì xảy ra và cách tiếp tục.

#### Acceptance Criteria

1. IF một yêu cầu API thất bại do lỗi mạng, THEN THE App SHALL hiển thị thông báo lỗi kết nối và giữ nguyên dữ liệu đang hiển thị.
2. IF luồng SSE bị ngắt kết nối trước khi nhận sự kiện `done`, THEN THE Generation_Module SHALL đóng luồng, chuyển truyện sang trạng thái cần thử lại, và hiển thị hướng dẫn bấm "Viết tiếp truyện" để nối lại các chương còn thiếu.
3. WHEN một yêu cầu API trả về mã lỗi kèm `error.message`, THE App SHALL hiển thị thông điệp `error.message` đó cho người dùng.
4. IF một yêu cầu API trả về mã 401 (chưa xác thực), THEN THE App SHALL nhắc người dùng đăng nhập lại.
5. WHILE thiết bị đang ngoại tuyến, THE Reader SHALL vẫn cho phép đọc các truyện đã được nạp nội dung trong phiên hiện tại.
6. WHEN kết nối mạng được khôi phục sau khi gián đoạn, THE App SHALL cho phép người dùng thử lại thao tác đã thất bại.

## Giả định và quyết định cần xác nhận

Các nội dung dưới đây là giả định ban đầu; cần người dùng xác nhận hoặc điều chỉnh:

1. **Nền tảng mục tiêu**: Giả định hỗ trợ cả iOS và Android. Cần xác nhận có ưu tiên một nền tảng trước không.
2. **Deep link OAuth**: Giả định dùng deep link/redirect URI riêng cho ứng dụng di động để Supabase trả về sau đăng nhập Google. Cần xác nhận scheme/redirect URI và việc cấu hình tương ứng trong Supabase.
3. **Đọc ngoại tuyến lâu dài**: Giả định Reader chỉ đọc ngoại tuyến với nội dung đã nạp trong phiên (không lưu trữ bền vững toàn bộ truyện để đọc offline). Cần xác nhận có cần tải truyện về máy để đọc offline về sau không.
4. **Phạm vi chia sẻ**: Giả định chia sẻ ở dạng văn bản/Markdown qua share sheet. Cần xác nhận có cần chia sẻ kèm ảnh bìa, ảnh trích đoạn hoặc liên kết web tới truyện không.
5. **CORS/whitelist**: Bản web cấu hình `CORS_ORIGINS` cho domain web; ứng dụng di động gọi API trực tiếp (không qua trình duyệt) nên không bị ràng buộc CORS, nhưng cần xác nhận backend không có chặn theo `Origin`/User-Agent với client di động.
