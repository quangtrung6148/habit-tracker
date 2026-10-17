# BMAD: kiểm tra, thảo luận và quyết định

## Trạng thái phương pháp

Ban đầu repository chưa có BMAD; vòng xem xét ban đầu chỉ là mô phỏng BA/PM/Architect, không được coi là đã chạy BMAD. Sau đó BMAD Method **6.12.4** đã được cài trong repository và ba agent thực sự được giao vai trò theo installed skills `bmad-agent-analyst`, `bmad-agent-pm`, `bmad-agent-architect`.

Các agent đọc SKILL.md và cấu hình persona/config liên quan trước hai vòng thảo luận mới. Lúc kích hoạt PM, `uv` chưa nằm trên PATH nên lệnh resolver thất bại; PM dùng fallback đọc `customize.toml`, `_bmad/config.toml` và các lớp override (không có override PM). Sau đó runtime uv được cài tại `.tools`; resolver config đã chạy thành công với cache trong workspace, xác nhận người dùng Trung, ngôn ngữ trao đổi và tài liệu là tiếng Việt. Không tuyên bố các workflow PRD/architecture tự động đã chạy nếu chỉ đọc skill và thảo luận.

## Vòng 1 — đề xuất của ba agent

| Vai trò | Đề xuất |
|---|---|
| Mary — BA | Chốt ngày theo timezone tài khoản; check-in hôm nay idempotent và undo hôm nay; streak giữ chuỗi hôm qua trong hôm nay; soft delete giữ lịch sử; kiểm chứng ownership, midnight và thao tác đồng thời. |
| John — PM | Giữ đúng bốn nhóm UI MVP, mobile check-in trực tiếp trên thẻ, bộ lọc tạm dừng, empty/error/loading rõ; tránh reminders/lịch tuần/analytics phức tạp. Worker là kỹ thuật hỗ trợ; chậm tổng hợp không được chặn dashboard. |
| Winston — Architect | Next SSR/BFF chuyển JWT tới Express; getUser và RLS bằng JWT người dùng; DB constraint/trigger khóa business rules khi gọi REST trực tiếp; worker độc lập gọi internal API và Actions thay paid worker. |

## Bất đồng và lựa chọn sản phẩm

- Múi giờ sửa được linh hoạt nhưng gây đổi ngày, tính lại lịch sử và thao tác lặp khi đi qua đường đổi ngày. Người dùng chọn **múi giờ cố định sau thiết lập**, mặc định HCM.
- Chỉ archive vĩnh viễn sẽ đơn giản hơn nhưng người dùng yêu cầu **pause/resume**. Chọn bảng mốc `habit_activity_days` nhỏ thay hệ thống lịch tổng quát; chỉ sửa ngày hiện tại, cùng ngày trạng thái cuối thắng.
- Xóa cứng làm mất dữ liệu biểu đồ trước đây. Chọn soft delete, giữ lịch sử và không có UI khôi phục.
- Render Background Worker luôn chạy sẽ thêm chi phí. Chọn một executable worker, local continuous và production Actions `--once` theo giờ; chấp nhận trễ và làm bù.

## Vòng 2 — phản biện và thống nhất trước implementation

Mary xác nhận check-in hợp lệ được giữ khi tạm dừng rồi tiếp tục cùng ngày; ngày cũ không chỉnh được. John yêu cầu giải thích timezone chọn một lần, pause không freeze streak, xác nhận xóa giữ lịch sử và mẫu số không đổi ngược ngày trước. Winston bảo vệ quy tắc cả ở database, tách service-role client khỏi user repositories và phân trang batch tổng hợp để giới hạn mỗi request.

Ba agent thống nhất:

1. Streak tính theo DATE liên tiếp; pause không đóng băng, ngày pause không check-in làm ngắt chuỗi.
2. Hôm nay paused/deleted loại khỏi cả tử và mẫu dashboard; check-in đã tồn tại giữ lại để resume hôm nay vẫn complete. Các ngày trước lấy mốc trạng thái lịch sử.
3. JWT đã xác minh + RLS + ownership constraint + DB guard cùng bảo vệ tài khoản và dữ liệu; không dùng service role trong CRUD người dùng.
4. Dashboard live bảy ngày độc lập summaries. Worker làm bù mọi ngày đã đóng còn thiếu, refresh bảy ngày đã đóng gần nhất, cursor batch và upsert idempotent.
5. Worker có timeout/retry hữu hạn, HTTPS production, hủy SIGTERM và log an toàn; không Redis/queue service/cron trả phí hoặc anti-sleep ping.

## Bằng chứng cần hoàn tất

Hai vòng thảo luận installed-skill đã thực hiện trước khi agent bắt đầu code. Việc build/test/runtime/deploy phải ghi theo kết quả lệnh thực tế trong deployment-plan; nội dung thảo luận không thay thế bằng chứng kiểm chứng.
