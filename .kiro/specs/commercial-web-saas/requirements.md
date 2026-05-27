# Requirements Document

## Introduction

Tài liệu này đặc tả phiên bản Web thương mại hóa (SaaS) của Drama15 Lite Studio. Phiên bản web phải đạt feature parity với bản desktop hiện tại (sáng tác truyện 10 chương theo niche, story bible, kế hoạch chương, rewrite, history, export PDF/Markdown, gen voice 10 chương qua OmniVoice), nhưng được host công khai trên Internet và phục vụ qua hai gói license: Free_Plan miễn phí mặc định và Paid_Plan thuê bao tháng.

Đăng nhập trong phase 1 chỉ hỗ trợ Google OAuth 2.0 (Authorization Code flow with PKCE). Tài khoản được tạo tự động khi đăng nhập Google lần đầu, sử dụng email Google làm primary identifier, và được gán Free_Plan ngay lập tức. Việc nâng cấp lên Paid_Plan trong phase 1 được thực hiện thủ công bởi quản trị viên qua Admin_Console; tích hợp cổng thanh toán self-service, hóa đơn điện tử và refund được xác định là Out of scope cho phase 1 và sẽ được thiết kế ở phase 2.

Frontend Web không trực tiếp gọi router LLM hay OmniVoice mà đi qua một backend trung gian (API_Gateway) do nhà cung cấp vận hành. Backend này giữ toàn bộ API key của router LLM và OmniVoice, kiểm tra license, áp quota, log audit và proxy yêu cầu tới Existing_Generation_Server. Mục tiêu cốt lõi là: tối đa hóa khó khăn cho việc crack, share license, hoặc trích xuất API key, đồng thời phân biệt rõ giá trị giữa Free_Plan và Paid_Plan.

## Glossary

- **Web_Client**: Single Page Application chạy trên trình duyệt, là phiên bản web của Drama15 Lite Studio.
- **API_Gateway**: Dịch vụ backend do nhà cung cấp vận hành, là điểm vào duy nhất từ Web_Client tới các dịch vụ phía sau.
- **License_Service**: Dịch vụ backend phụ trách phát hành, gia hạn, thu hồi và xác thực license cho Free_Plan và Paid_Plan.
- **Auth_Service**: Dịch vụ backend phụ trách xác thực Google OAuth, quản lý phiên người dùng và phát hành Access_Token.
- **Google_Identity_Provider**: Nhà cung cấp định danh Google (Google Identity Services / OAuth 2.0) dùng để xác thực người dùng cuối.
- **Google_Account**: Tài khoản Google của người dùng cuối, được nhận diện qua trường email với `email_verified=true` trả về từ Google_Identity_Provider.
- **Existing_Generation_Server**: Hạ tầng LLM router (`9router`) và OmniVoice TTS hiện đang dùng cho bản desktop, được Web_Client truy cập gián tiếp qua API_Gateway.
- **Admin_Console**: Giao diện quản trị nội bộ để nhà cung cấp quản lý người dùng, license, nâng cấp plan thủ công và xem logs.
- **Audit_Logger**: Thành phần backend ghi nhận sự kiện bảo mật và hoạt động sử dụng tính năng.
- **Rate_Limiter**: Thành phần backend áp giới hạn tần suất và quota gọi tính năng theo License_Plan.
- **Access_Token**: JSON Web Token có thời gian sống 15 phút dùng cho mỗi yêu cầu từ Web_Client tới API_Gateway, lưu trong bộ nhớ runtime của Web_Client.
- **Refresh_Token**: Token có thời gian sống 7 ngày dùng để cấp Access_Token mới, lưu trong cookie HttpOnly Secure SameSite=Strict.
- **Device_Fingerprint**: Chuỗi định danh tổng hợp từ thông tin trình duyệt, hệ điều hành và môi trường, dùng để nhận diện thiết bị.
- **License_Plan**: Khái niệm gói license của một tài khoản; trong phase 1 chỉ có hai giá trị là Free_Plan hoặc Paid_Plan.
- **Free_Plan**: Gói miễn phí mặc định cho mọi tài khoản mới, không có ngày hết hạn, giới hạn 3 chương mỗi 24 giờ UTC, không cho phép gen voice và không cho phép Automation, ràng buộc theo (email, Device_Fingerprint).
- **Paid_Plan**: Gói thuê bao tháng (chu kỳ 30 ngày), giới hạn 20 truyện full mỗi chu kỳ và 20 truyện voice mỗi chu kỳ, cho phép sử dụng Automation với cap 2 truyện mỗi Automation_Job.
- **Story_Job**: Một lần chạy tạo full truyện 10 chương, có id duy nhất, có thể pause và resume.
- **Voice_Job**: Một lần chạy gen voice 10 chương qua OmniVoice, có id duy nhất, có thể pause và resume.
- **Automation_Job**: Một lần chạy tạo hàng loạt nhiều truyện trong cùng một job, chỉ khả dụng cho Paid_Plan, cap tối đa 2 truyện mỗi job.
- **PII**: Personal Identifiable Information, gồm email, tên hiển thị Google và địa chỉ IP.

## Requirements

### Requirement 1: Đăng nhập tài khoản qua Google OAuth

**User Story:** Là một khách hàng tiềm năng, tôi muốn đăng nhập bằng tài khoản Google, để tôi có thể sử dụng Web_Client mà không phải tạo và quản lý mật khẩu riêng.

#### Acceptance Criteria

1. THE Auth_Service SHALL chỉ hỗ trợ đăng nhập qua Google OAuth 2.0 Authorization Code flow with PKCE và phải không cung cấp luồng đăng ký hoặc đăng nhập bằng email và mật khẩu.
2. WHEN một khách truy cập bấm `Đăng nhập với Google`, THE Web_Client SHALL chuyển hướng người dùng tới Google_Identity_Provider để xác thực.
3. WHEN Google_Identity_Provider trả về authorization code hợp lệ, THE Auth_Service SHALL đổi code lấy ID token, xác minh chữ ký và issuer của ID token, và sử dụng email từ ID token làm primary identifier của tài khoản.
4. IF email trả về từ Google_Identity_Provider có trường `email_verified` không bằng `true`, THEN THE Auth_Service SHALL từ chối đăng nhập với mã lỗi `google_email_unverified`.
5. IF email trả về từ Google_Identity_Provider chưa từng tồn tại trong hệ thống, THEN THE Auth_Service SHALL tạo tài khoản mới ở trạng thái đã kích hoạt, gắn vào Free_Plan và phát hành Access_Token có thời hạn 15 phút và Refresh_Token có thời hạn 7 ngày.
6. WHEN một tài khoản đã tồn tại đăng nhập lại qua Google, THE Auth_Service SHALL phát hành Access_Token có thời hạn 15 phút và Refresh_Token có thời hạn 7 ngày.
7. THE Auth_Service SHALL xoay vòng Refresh_Token mỗi lần được sử dụng và phải vô hiệu hóa Refresh_Token cũ ngay sau khi cấp Refresh_Token mới.
8. IF Refresh_Token bị thu hồi hoặc đã hết hạn, THEN THE Auth_Service SHALL từ chối yêu cầu cấp Access_Token mới với mã lỗi `refresh_token_invalid` và bắt buộc người dùng đăng nhập lại qua Google.
9. WHEN người dùng đăng xuất, THE Auth_Service SHALL thu hồi Refresh_Token hiện tại và phải xóa cookie Refresh_Token trên Web_Client.

### Requirement 2: Quản lý license theo Free_Plan và Paid_Plan

**User Story:** Là người dùng đã đăng nhập qua Google, tôi muốn được tự động cấp Free_Plan và có thể được nâng cấp lên Paid_Plan, để tôi có thể trải nghiệm tính năng cơ bản và mở khóa tính năng nâng cao khi cần.

#### Acceptance Criteria

1. THE License_Service SHALL hỗ trợ duy nhất hai License_Plan: Free_Plan và Paid_Plan.
2. WHEN một tài khoản mới được tạo qua Google OAuth, THE License_Service SHALL gán Free_Plan cho tài khoản đó với trạng thái đang hoạt động và không có ngày hết hạn.
3. THE License_Service SHALL ràng buộc Free_Plan theo cặp (email, Device_Fingerprint) sao cho mỗi Device_Fingerprint chỉ được liên kết với tối đa một tài khoản Free_Plan đang hoạt động.
4. IF một Device_Fingerprint đã liên kết với một tài khoản Free_Plan đang hoạt động và một tài khoản Free_Plan khác cố gắng đăng nhập từ cùng Device_Fingerprint, THEN THE License_Service SHALL từ chối phiên đăng nhập với mã lỗi `free_plan_device_already_used`.
5. WHEN quản trị viên nâng cấp một tài khoản từ Free_Plan lên Paid_Plan qua Admin_Console, THE License_Service SHALL phát hành Paid_Plan có ngày bắt đầu là thời điểm nâng cấp và ngày hết hạn là thời điểm bắt đầu cộng 30 ngày.
6. WHEN một Paid_Plan sắp hết hạn trong vòng 72 giờ, THE License_Service SHALL gửi thông báo qua email cho chủ tài khoản.
7. WHEN ngày hiện tại vượt quá ngày hết hạn của Paid_Plan, THE License_Service SHALL chuyển Paid_Plan sang trạng thái đã hết hạn và phải chuyển tài khoản về Free_Plan.
8. WHEN quản trị viên thu hồi Paid_Plan của một tài khoản qua Admin_Console, THE License_Service SHALL chuyển Paid_Plan sang trạng thái đã thu hồi, đưa tài khoản về Free_Plan và phải vô hiệu hóa toàn bộ Access_Token và Refresh_Token gắn với tài khoản đó trong vòng 60 giây.
9. THE License_Service SHALL không thực hiện thu phí, lập hóa đơn điện tử, refund hoặc tích hợp cổng thanh toán self-service trong phase 1.
10. WHILE một tài khoản đang ở Free_Plan, THE API_Gateway SHALL từ chối các yêu cầu tới tính năng Automation và tính năng gen voice với mã lỗi `automation_requires_paid` và `voice_requires_paid` tương ứng.

### Requirement 3: Xác thực license cho mọi yêu cầu sử dụng tính năng

**User Story:** Là nhà cung cấp, tôi muốn mỗi yêu cầu tới tính năng sáng tác và gen voice đều được xác thực license phía server, để tôi tránh việc client bị crack có thể bypass kiểm tra.

#### Acceptance Criteria

1. THE API_Gateway SHALL từ chối mọi yêu cầu không kèm Access_Token hợp lệ với mã lỗi `unauthenticated`.
2. WHEN API_Gateway nhận yêu cầu kèm Access_Token hợp lệ, THE API_Gateway SHALL truy vấn License_Service để lấy License_Plan và trạng thái license hiện tại của tài khoản trước khi chuyển tiếp yêu cầu tới Existing_Generation_Server.
3. IF License_Service trả về trạng thái không phải đang hoạt động, THEN THE API_Gateway SHALL từ chối yêu cầu với mã lỗi `license_not_active`.
4. THE API_Gateway SHALL không tin vào trường license, plan, quota hoặc role do Web_Client gửi lên trong body hoặc header.
5. THE Access_Token SHALL có thời gian sống tối đa 15 phút.
6. WHEN Access_Token hết hạn, THE Web_Client SHALL gọi Auth_Service với Refresh_Token để xin Access_Token mới.

### Requirement 4: Ràng buộc thiết bị và phiên đồng thời

**User Story:** Là nhà cung cấp, tôi muốn giới hạn việc share license, để tránh nhiều người dùng chung một tài khoản trả phí.

#### Acceptance Criteria

1. WHEN người dùng đăng nhập thành công qua Google, THE Auth_Service SHALL gắn phiên đăng nhập với một Device_Fingerprint cụ thể được Web_Client tính toán phía client và xác minh phía server.
2. WHILE tài khoản ở Free_Plan, THE Auth_Service SHALL cho phép tối đa một Device_Fingerprint hoạt động đồng thời cho tài khoản đó.
3. WHILE tài khoản ở Paid_Plan, THE Auth_Service SHALL cho phép tối đa ba Device_Fingerprint hoạt động đồng thời cho tài khoản đó.
4. IF số Device_Fingerprint hoạt động vượt quá giới hạn của License_Plan hiện tại, THEN THE Auth_Service SHALL từ chối phiên đăng nhập mới với mã lỗi `device_limit_reached` và yêu cầu người dùng đăng xuất một thiết bị khác.
5. WHEN một Access_Token được dùng từ địa chỉ IP khác quốc gia với Refresh_Token đang gắn với phiên trong vòng 10 phút, THE API_Gateway SHALL yêu cầu xác thực lại qua Google_Identity_Provider trước khi cho phép tiếp tục.
6. THE Auth_Service SHALL ghi nhận lần sử dụng cuối của mỗi Device_Fingerprint và phải hiển thị danh sách thiết bị đang đăng nhập trong trang quản lý tài khoản.
7. WHEN người dùng yêu cầu đăng xuất một thiết bị từ trang quản lý, THE Auth_Service SHALL thu hồi Refresh_Token gắn với Device_Fingerprint đó trong vòng 60 giây.

### Requirement 5: Áp quota và rate limit theo License_Plan

**User Story:** Là nhà cung cấp, tôi muốn áp giới hạn quota và tần suất theo từng License_Plan, để bảo vệ Existing_Generation_Server và phân biệt rõ giá trị giữa Free_Plan và Paid_Plan.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL áp giới hạn tần suất tối đa 60 yêu cầu mỗi phút cho mỗi tài khoản trên các endpoint tạo truyện và rewrite.
2. WHILE tài khoản ở Free_Plan, THE Rate_Limiter SHALL cho phép tối đa 3 chương được tạo trong mỗi cửa sổ 24 giờ tính từ 00:00 UTC đến 23:59:59 UTC của cùng ngày.
3. WHEN một tài khoản Free_Plan đã tạo đủ 3 chương trong cửa sổ 24 giờ UTC hiện tại, THE API_Gateway SHALL từ chối yêu cầu tạo chương mới với mã lỗi `free_chapter_quota_exhausted` kèm thời điểm reset là 00:00 UTC ngày hôm sau.
4. WHILE tài khoản ở Paid_Plan, THE Rate_Limiter SHALL cho phép tối đa 20 truyện full với mỗi truyện 10 chương trong mỗi chu kỳ 30 ngày tính từ ngày bắt đầu Paid_Plan.
5. WHEN một tài khoản Paid_Plan đã tạo đủ 20 truyện full trong chu kỳ tháng hiện tại, THE API_Gateway SHALL từ chối yêu cầu tạo truyện mới với mã lỗi `paid_story_quota_exhausted`.
6. WHILE tài khoản ở Paid_Plan, THE Rate_Limiter SHALL cho phép tối đa 20 truyện voice với mỗi truyện voice 10 chương trong mỗi chu kỳ 30 ngày của Paid_Plan.
7. WHEN một tài khoản Paid_Plan đã gen đủ 20 truyện voice trong chu kỳ tháng hiện tại, THE API_Gateway SHALL từ chối yêu cầu gen voice mới với mã lỗi `paid_voice_quota_exhausted`.
8. THE Rate_Limiter SHALL áp giới hạn tối đa 1 Story_Job đang chạy đồng thời cho mỗi tài khoản Free_Plan và tối đa 10 Story_Job đang chạy đồng thời cho mỗi tài khoản Paid_Plan.
9. IF một tài khoản vượt giới hạn tần suất, THEN THE Rate_Limiter SHALL trả về mã lỗi `rate_limited` kèm header `Retry-After` ghi số giây phải chờ.
10. WHEN một chu kỳ 30 ngày của Paid_Plan kết thúc và Paid_Plan được gia hạn, THE License_Service SHALL khôi phục quota truyện full và quota voice của tài khoản về 20 truyện và 20 voice tương ứng.

### Requirement 6: Sáng tác truyện full 10 chương trên Web_Client

**User Story:** Là người dùng đã có license, tôi muốn tạo full truyện 10 chương trên Web_Client như bản desktop, để tôi có thể sản xuất nội dung từ trình duyệt.

#### Acceptance Criteria

1. THE Web_Client SHALL hiển thị form thiết lập truyện gồm gợi ý tiêu đề, niche, ngôn ngữ đầu ra, hạt giống bối cảnh, cường độ, tỷ lệ thoại và mật độ hook tương đương bản desktop.
2. WHEN người dùng bấm `Tự tạo`, THE Web_Client SHALL gọi API_Gateway để sinh tiêu đề, hạt giống bối cảnh và config sáng tác theo niche đã chọn và phải điền kết quả vào form.
3. WHEN người dùng Free_Plan bấm `Tạo Chương`, THE API_Gateway SHALL cho phép tạo từng chương riêng lẻ và phải đếm mỗi chương được tạo vào quota 3 chương mỗi 24 giờ UTC của Free_Plan.
4. WHEN người dùng Paid_Plan bấm `Tạo Toàn Bộ Truyện`, THE Web_Client SHALL khởi tạo một Story_Job mới qua API_Gateway và hiển thị tiến độ theo từng stage gồm tổng quan, kế hoạch, từng chương.
5. WHEN một Story_Job của tài khoản Paid_Plan hoàn tất 10 chương, THE License_Service SHALL trừ một đơn vị quota truyện full Paid_Plan cho Story_Job đó.
6. THE API_Gateway SHALL chuyển tiếp yêu cầu tạo truyện tới Existing_Generation_Server bằng API key do nhà cung cấp giữ và phải không tiết lộ key này cho Web_Client.
7. THE Web_Client SHALL hiển thị kết quả truyện trong ba tab `Tổng Quan`, `Kế Hoạch`, `Chương` tương đương bản desktop.
8. WHILE Story_Job đang chạy, THE Web_Client SHALL cập nhật progress bar và caption tiến độ theo dữ liệu streaming từ API_Gateway.
9. IF Story_Job dừng giữa chừng do lỗi mạng hoặc lỗi server, THEN THE Web_Client SHALL hiển thị nút `Tiếp tục từ chương còn thiếu` và khi người dùng bấm nút này, THE API_Gateway SHALL tiếp tục Story_Job từ chương đầu tiên chưa có nội dung mà không trừ thêm quota.
10. THE Web_Client SHALL hỗ trợ tối thiểu các niche giống bản desktop hiện tại bao gồm tình yêu tỷ phú, sỉ nhục lật kèo, che giấu thân phận, gia đình độc hại, ngoại tình, mẹ đơn thân, bất công xã hội.
11. THE Web_Client SHALL hỗ trợ niche tùy chỉnh do người dùng tự nhập.
12. WHEN người dùng chọn ngôn ngữ đầu ra, THE Web_Client SHALL truyền ngôn ngữ đó cho API_Gateway và Existing_Generation_Server để sinh truyện đúng ngôn ngữ.

### Requirement 7: Viết lại chương và tiếp tục từ chương còn thiếu

**User Story:** Là người dùng, tôi muốn rewrite một chương theo nhiều chế độ khác nhau, để tôi có thể tinh chỉnh chất lượng truyện như bản desktop.

#### Acceptance Criteria

1. THE Web_Client SHALL hiển thị panel `Viết Lại` cho phép chọn chương mục tiêu, chế độ rewrite và yêu cầu chỉnh sửa.
2. THE Web_Client SHALL hỗ trợ tối thiểu các chế độ rewrite: viết lại toàn chương, viết lại hook mở đầu, viết lại nhịp kết chương, chỉnh giọng điệu hội thoại, tăng nhục mạ giai cấp, tăng độ sắc của trả đũa.
3. WHEN người dùng bấm `Viết Lại Chương`, THE Web_Client SHALL gửi yêu cầu rewrite kèm id Story_Job tới API_Gateway và phải hiển thị nội dung chương mới sau khi nhận kết quả.
4. THE Rate_Limiter SHALL áp giới hạn tối đa 30 yêu cầu rewrite cho mỗi tài khoản trong mỗi cửa sổ 24 giờ UTC.
5. THE API_Gateway SHALL không đếm yêu cầu rewrite vào quota 3 chương mỗi 24 giờ UTC của Free_Plan và phải không đếm yêu cầu rewrite vào quota 20 truyện mỗi chu kỳ tháng của Paid_Plan.
6. IF một tài khoản vượt giới hạn 30 yêu cầu rewrite trong cửa sổ 24 giờ UTC, THEN THE Rate_Limiter SHALL từ chối yêu cầu rewrite với mã lỗi `rewrite_quota_exhausted` kèm header `Retry-After`.
7. WHEN người dùng bấm `Tiếp tục từ chương còn thiếu`, THE API_Gateway SHALL kiểm tra Story_Job và phải sinh ra các chương còn trống mà không tạo lại các chương đã hoàn tất.

### Requirement 8: Tính năng Automation tạo truyện hàng loạt

**User Story:** Là người dùng Paid_Plan, tôi muốn tạo nhiều truyện trong một lượt, để tôi có thể sản xuất nội dung quy mô lớn nhanh hơn.

#### Acceptance Criteria

1. THE Web_Client SHALL hiển thị panel `Automation` cho phép cấu hình một Automation_Job tạo nhiều truyện cùng lúc.
2. IF một tài khoản Free_Plan gửi yêu cầu khởi tạo Automation_Job, THEN THE API_Gateway SHALL từ chối yêu cầu với mã lỗi `automation_requires_paid`.
3. WHEN một tài khoản Paid_Plan khởi tạo một Automation_Job, THE API_Gateway SHALL cho phép Automation_Job tạo tối đa 2 truyện full với mỗi truyện 10 chương trong cùng một lượt.
4. IF tổng số truyện đã tạo trong chu kỳ tháng cộng với số truyện trong Automation_Job mới vượt quá quota 20 truyện của Paid_Plan, THEN THE API_Gateway SHALL từ chối khởi tạo Automation_Job với mã lỗi `paid_story_quota_exhausted`.
5. WHEN một truyện trong Automation_Job hoàn tất 10 chương, THE License_Service SHALL trừ một đơn vị quota truyện full Paid_Plan cho mỗi truyện hoàn tất đó.
6. WHILE một Automation_Job đang chạy, THE Web_Client SHALL hiển thị tiến độ riêng cho từng truyện trong job và phải cho phép Pause, Resume hoặc Stop toàn bộ job.
7. IF một truyện trong Automation_Job thất bại, THEN THE API_Gateway SHALL cho phép retry duy nhất truyện đó mà không phải khởi tạo lại Automation_Job và phải không trừ thêm quota cho lần retry.

### Requirement 9: Gen voice 10 chương qua API_Gateway (Paid_Plan)

**User Story:** Là người dùng Paid_Plan, tôi muốn xuất file voice cho 10 chương ngay trên web, để tôi có thể dùng cho video drama.

#### Acceptance Criteria

1. THE Web_Client SHALL hiển thị panel Voice gồm chọn Voice ID, tốc độ và pitch tương đương bản desktop.
2. IF một tài khoản Free_Plan gửi yêu cầu gen voice, THEN THE API_Gateway SHALL từ chối yêu cầu với mã lỗi `voice_requires_paid`.
3. WHEN người dùng Paid_Plan bấm `Voice ID`, THE Web_Client SHALL gọi API_Gateway để lấy danh sách Voice ID khả dụng từ OmniVoice và hiển thị trong dropdown.
4. WHEN người dùng Paid_Plan bấm `Gen Voice 10 Chương` và truyện hiện tại đã đủ 10 chương, THE Web_Client SHALL khởi tạo một Voice_Job mới qua API_Gateway.
5. WHEN một Voice_Job hoàn tất đủ 10 chương, THE License_Service SHALL trừ một đơn vị quota voice Paid_Plan cho Voice_Job đó.
6. THE API_Gateway SHALL gọi tới OmniVoice của Existing_Generation_Server bằng credential do nhà cung cấp giữ và phải không tiết lộ credential này cho Web_Client.
7. WHILE Voice_Job đang chạy, THE Web_Client SHALL hiển thị tiến độ từng chương và phải cho phép người dùng bấm Pause, Stop, Resume hoặc Retry.
8. WHEN Voice_Job hoàn tất một chương, THE API_Gateway SHALL lưu file âm thanh kết quả vào kho lưu trữ riêng của tài khoản và phải phát hành URL có chữ ký với thời hạn tối đa 60 phút cho Web_Client để tải.
9. IF gen voice một chương thất bại, THEN THE API_Gateway SHALL trả về lỗi cụ thể cho Web_Client và phải cho phép Retry chương đó mà không phải gen lại các chương đã thành công và không trừ thêm quota cho lần retry.
10. THE Web_Client SHALL không hiển thị địa chỉ thật của OmniVoice server.

### Requirement 10: History và quản lý truyện

**User Story:** Là người dùng, tôi muốn xem lại các bộ truyện đã tạo và mở lại nhanh, tương đương bản desktop có lịch sử.

#### Acceptance Criteria

1. THE Web_Client SHALL hiển thị danh sách các Story_Job đã tạo của tài khoản, sắp xếp theo thời gian tạo giảm dần.
2. WHEN người dùng chọn một mục trong lịch sử, THE Web_Client SHALL gọi API_Gateway để lấy nội dung tổng quan, kế hoạch và chương tương ứng và phải hiển thị lại trên giao diện.
3. WHEN người dùng yêu cầu xóa một mục lịch sử, THE API_Gateway SHALL xóa nội dung Story_Job và mọi file voice liên quan trong vòng 24 giờ.
4. THE API_Gateway SHALL trả về lịch sử của duy nhất tài khoản đang đăng nhập và phải từ chối truy cập tới Story_Job của tài khoản khác với mã lỗi `forbidden`.

### Requirement 11: Export Markdown và PDF

**User Story:** Là người dùng, tôi muốn xuất từng chương thành Markdown và xuất full truyện thành PDF, tương đương bản desktop.

#### Acceptance Criteria

1. WHEN người dùng bấm `Lưu Từng Chương .md`, THE Web_Client SHALL tải về một file .zip chứa từng chương ở định dạng Markdown.
2. WHEN người dùng bấm `Xuất PDF Cả Truyện`, THE API_Gateway SHALL sinh PDF của 10 chương kèm tổng quan và phải trả về URL có chữ ký với thời hạn tối đa 60 phút.
3. THE PDF xuất ra SHALL chứa watermark hiển thị email tài khoản và id Story_Job ở footer của mỗi trang.
4. THE Markdown xuất ra SHALL chèn một dòng comment ẩn ở cuối mỗi file ghi email tài khoản và id Story_Job để hỗ trợ truy vết khi nội dung bị phát tán.

### Requirement 12: Bảo vệ API key và proxy ra Existing_Generation_Server

**User Story:** Là nhà cung cấp, tôi muốn API key của router LLM và OmniVoice không rời khỏi backend, để tránh bị trích xuất và lạm dụng.

#### Acceptance Criteria

1. THE API_Gateway SHALL là điểm duy nhất gọi tới Existing_Generation_Server.
2. THE Web_Client SHALL không nhận và phải không lưu bất kỳ API key nào của router LLM hoặc OmniVoice.
3. THE API_Gateway SHALL lưu API key của Existing_Generation_Server trong kho bí mật được mã hóa và phải chỉ giải mã trong bộ nhớ tại thời điểm gọi.
4. THE API_Gateway SHALL loại bỏ các header có thể tiết lộ thông tin upstream khỏi response trả về Web_Client, gồm các header server, via, x-powered-by và bất kỳ header có tiền tố x-router.
5. IF Existing_Generation_Server trả về thông báo lỗi chứa địa chỉ host hoặc đường dẫn nội bộ, THEN THE API_Gateway SHALL chuẩn hóa thông báo lỗi để không lộ thông tin upstream trước khi trả về Web_Client.
6. THE API_Gateway SHALL chỉ chấp nhận request đến từ origin của Web_Client đã đăng ký trong cấu hình CORS và phải từ chối các origin khác.
7. THE API_Gateway SHALL áp dụng giao thức HTTPS với TLS 1.2 trở lên cho mọi kết nối từ Web_Client và phải từ chối kết nối HTTP thuần.

### Requirement 13: Bảo mật phía Web_Client và chống tamper

**User Story:** Là nhà cung cấp, tôi muốn Web_Client khó bị tamper hoặc đảo ngược, để tăng chi phí cho người muốn crack.

#### Acceptance Criteria

1. THE Web_Client SHALL được build dưới dạng minified và obfuscated trước khi triển khai.
2. THE Web_Client SHALL áp dụng Subresource Integrity cho mọi tài nguyên JavaScript và CSS bên thứ ba được tải từ CDN.
3. THE Web_Client SHALL gửi một header `X-Client-Integrity` chứa giá trị băm của bản build hiện tại và API_Gateway phải xác minh giá trị băm này nằm trong danh sách bản build hợp lệ.
4. IF API_Gateway nhận giá trị `X-Client-Integrity` không nằm trong danh sách bản build hợp lệ, THEN THE API_Gateway SHALL từ chối yêu cầu với mã lỗi `client_integrity_failed`.
5. THE Web_Client SHALL áp dụng Content Security Policy chỉ cho phép script và style từ origin của chính Web_Client, origin của API_Gateway và domain của Google_Identity_Provider.
6. THE Web_Client SHALL không lưu Refresh_Token trong localStorage hoặc sessionStorage.
7. THE Web_Client SHALL lưu Refresh_Token duy nhất trong cookie có thuộc tính HttpOnly, Secure và SameSite=Strict.
8. THE Web_Client SHALL lưu Access_Token chỉ trong bộ nhớ runtime và phải không lưu xuống storage bền vững.
9. WHERE trình duyệt mở DevTools và phát hiện được, THE Web_Client SHALL hiển thị cảnh báo và phải ghi sự kiện qua Audit_Logger.

### Requirement 14: Audit logging và phát hiện lạm dụng

**User Story:** Là nhà cung cấp, tôi muốn ghi log đầy đủ các sự kiện bảo mật và phát hiện sớm hành vi bất thường, để có bằng chứng và phản ứng nhanh.

#### Acceptance Criteria

1. THE Audit_Logger SHALL ghi nhận các sự kiện đăng nhập qua Google, đăng xuất, đăng nhập thất bại, gán Free_Plan tự động, nâng cấp Paid_Plan, hết hạn Paid_Plan, thu hồi Paid_Plan, phát hành Access_Token, từ chối Access_Token, và mọi yêu cầu bị từ chối do license hoặc quota.
2. THE Audit_Logger SHALL gắn mỗi bản ghi với id tài khoản, Device_Fingerprint, địa chỉ IP, mã ngôn ngữ trình duyệt và thời điểm UTC.
3. WHEN số lần đăng nhập thất bại từ một dải IP vượt 100 lần trong một giờ, THE API_Gateway SHALL thêm dải IP đó vào danh sách chặn tạm thời trong 24 giờ.
4. WHEN một tài khoản phát sinh hơn 50 yêu cầu bị từ chối do `client_integrity_failed` trong 24 giờ, THE License_Service SHALL gắn cờ tài khoản đó để Admin_Console xem xét thủ công.
5. THE Audit_Logger SHALL giữ log tối thiểu 365 ngày và phải lưu ở dạng chỉ ghi thêm và phải không cho phép sửa đổi tại chỗ.

### Requirement 15: Bảo vệ dữ liệu người dùng và PII

**User Story:** Là người dùng, tôi muốn dữ liệu cá nhân và truyện của tôi được bảo vệ, để tôi yên tâm sử dụng dịch vụ.

#### Acceptance Criteria

1. THE API_Gateway SHALL mã hóa dữ liệu truyện và file voice của người dùng khi lưu trữ bằng AES-256.
2. THE API_Gateway SHALL chỉ cho phép tài khoản chủ truy cập dữ liệu truyện và file voice của tài khoản đó, ngoại trừ vai trò quản trị viên có quyền truy cập có ghi log.
3. WHEN người dùng yêu cầu xóa tài khoản, THE License_Service SHALL chuyển tài khoản sang trạng thái chờ xóa, ẩn dữ liệu khỏi mọi truy vấn và phải xóa vĩnh viễn dữ liệu PII và dữ liệu truyện trong vòng 30 ngày.
4. THE Audit_Logger SHALL không ghi Access_Token nguyên dạng, Refresh_Token nguyên dạng, hoặc Google OAuth authorization code vào log.
5. WHEN một sự cố làm lộ PII xảy ra, THE License_Service SHALL gửi thông báo cho người dùng bị ảnh hưởng trong vòng 72 giờ kể từ khi sự cố được xác nhận.

### Requirement 16: Admin Console quản trị

**User Story:** Là quản trị viên của nhà cung cấp, tôi muốn quản lý người dùng, license và xem log, để tôi vận hành dịch vụ và xử lý lạm dụng.

#### Acceptance Criteria

1. THE Admin_Console SHALL chỉ cho phép truy cập với tài khoản có vai trò quản trị viên đã bật xác thực hai yếu tố TOTP.
2. THE Admin_Console SHALL hỗ trợ tra cứu tài khoản theo email, id, hoặc Device_Fingerprint.
3. WHEN quản trị viên nâng cấp một tài khoản từ Free_Plan lên Paid_Plan qua Admin_Console, THE License_Service SHALL áp dụng phát hành Paid_Plan như mô tả ở Requirement 2.
4. WHEN quản trị viên thu hồi Paid_Plan của một tài khoản qua Admin_Console, THE License_Service SHALL áp dụng thu hồi như mô tả ở Requirement 2.
5. THE Admin_Console SHALL hiển thị bảng theo dõi các tài khoản bị gắn cờ do `client_integrity_failed` và phải cho phép bỏ cờ hoặc khóa tài khoản.
6. THE Admin_Console SHALL hiển thị lịch sử Audit_Logger với khả năng lọc theo tài khoản, loại sự kiện và khoảng thời gian.
7. THE Admin_Console SHALL ghi nhận hành động của quản trị viên vào Audit_Logger với id quản trị viên thực hiện.

### Requirement 17: Hiệu năng và tính sẵn sàng

**User Story:** Là người dùng, tôi muốn dịch vụ phản hồi nhanh và ổn định, để tôi có thể sản xuất nội dung trơn tru.

#### Acceptance Criteria

1. THE Web_Client SHALL hoàn tất lần tải trang đầu tiên trong tối đa 3 giây trên kết nối 10 Mbps và phần cứng tương đương Chrome bản phát hành mới nhất trên máy tính bàn.
2. THE API_Gateway SHALL phản hồi các endpoint đăng nhập, lấy lịch sử và lấy thông tin license với thời gian phản hồi trung vị tối đa 300 ms khi tải bình thường.
3. WHEN một Story_Job được khởi chạy, THE API_Gateway SHALL bắt đầu trả dữ liệu streaming chương đầu tiên trong tối đa 10 giây.
4. THE API_Gateway SHALL đạt tỷ lệ sẵn sàng tối thiểu 99.5% tính theo tháng.
5. WHEN Existing_Generation_Server không phản hồi trong 60 giây, THE API_Gateway SHALL hủy yêu cầu thượng nguồn và phải trả về mã lỗi `upstream_timeout` cho Web_Client.

### Requirement 18: Tương thích trình duyệt và truy cập

**User Story:** Là người dùng, tôi muốn sử dụng Web_Client trên các trình duyệt phổ biến, để tôi không phải đổi máy hay đổi trình duyệt.

#### Acceptance Criteria

1. THE Web_Client SHALL hỗ trợ Chrome, Edge, Firefox và Safari các phiên bản phát hành trong 12 tháng gần nhất.
2. THE Web_Client SHALL chặn truy cập từ trình duyệt không hỗ trợ ECMAScript 2022 và phải hiển thị thông báo nâng cấp trình duyệt.
3. WHEN người dùng truy cập Web_Client từ thiết bị di động có chiều rộng màn hình dưới 768 pixel, THE Web_Client SHALL hiển thị bố cục thu gọn vẫn cho phép thực hiện đầy đủ các chức năng tạo truyện và gen voice.

### Requirement 19: Bản địa hóa giao diện

**User Story:** Là người dùng nói tiếng Việt hoặc tiếng Anh, tôi muốn giao diện hiển thị đúng ngôn ngữ tôi chọn, để tôi sử dụng thuận tiện.

#### Acceptance Criteria

1. THE Web_Client SHALL hỗ trợ giao diện tiếng Việt và tiếng Anh.
2. WHEN người dùng chọn ngôn ngữ giao diện trong cài đặt tài khoản, THE Web_Client SHALL lưu lựa chọn và phải hiển thị toàn bộ nhãn theo ngôn ngữ đó từ lần tải tiếp theo.
3. THE Web_Client SHALL phân tách hoàn toàn ngôn ngữ giao diện khỏi ngôn ngữ đầu ra của truyện được sinh.
