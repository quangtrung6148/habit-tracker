# Yêu cầu Habit Tracker MVP

## Mục tiêu và người dùng

Người dùng cá nhân xây dựng thói quen lặp lại hằng ngày. Một loại tài khoản, chỉ truy cập dữ liệu riêng. MVP có đúng bốn nhóm chức năng: tài khoản, quản lý thói quen, check-in/streak và dashboard. Worker là thành phần kỹ thuật, không phải tính năng UI riêng.

## Quy tắc đã thống nhất

1. Email/mật khẩu do Supabase Auth quản lý. Không lưu mật khẩu hay access token trong localStorage của ứng dụng. Trang cá nhân yêu cầu phiên hợp lệ.
2. Người dùng chọn múi giờ IANA một lần ở bước thiết lập đầu tiên, mặc định `Asia/Ho_Chi_Minh`; không có API đổi múi giờ. Ngày nghiệp vụ lấy từ đồng hồ database và múi giờ tài khoản, không từ ngày gửi bởi trình duyệt.
3. Thói quen có tiêu đề, mô tả, icon, màu và trạng thái hoạt động. Được check-in ngay ngày tạo. Tạm dừng/tiếp tục áp dụng hôm nay, không được chỉnh quá khứ. Thay đổi nhiều lần trong ngày lấy trạng thái cuối.
4. Xóa là xóa mềm và kết thúc sử dụng thói quen. Giữ lịch sử để không thay đổi thống kê những ngày trước. Không có khôi phục thói quen đã xóa trong MVP.
5. Một check-in cho mỗi thói quen/ngày, bảo vệ bằng unique constraint. Gửi lại hoặc gửi đồng thời vẫn có một kết quả hoàn thành. Chỉ check-in hoặc bỏ check-in hôm nay; không bù ngày cũ, không ngày tương lai.
6. Không tạo check-in mới khi đang tạm dừng/đã xóa. Check-in đã có vẫn được giữ khi tạm dừng; tiếp tục trong cùng ngày khôi phục trạng thái hoàn thành. Khi tạm dừng, vẫn có thể bỏ check-in hôm nay; POST lặp với check-in đã tồn tại chỉ trả lại kết quả cũ.
7. Streak là chuỗi ngày lịch liên tiếp có check-in. Hôm nay chưa hoàn thành nhưng hôm qua hoàn thành thì giữ current streak đến hết hôm nay. Nếu cả hôm qua lẫn hôm nay không hoàn thành, current streak bằng 0. Tạm dừng không đóng băng streak. Bỏ check-in hôm nay tính lại current/longest.
8. Mẫu số thống kê mỗi ngày là số thói quen hoạt động trong ngày đó, dựa trên lịch sử trạng thái. Hôm nay lấy trạng thái cuối hiện tại. Số hoàn thành chỉ tính check-in của thói quen thuộc mẫu số. Không có thói quen hoạt động: UI hiện empty state, tỷ lệ số học trả 0.
9. Dashboard đọc trực tiếp dữ liệu chuẩn cho hôm nay và bảy ngày gần nhất; không chờ worker. Worker tổng hợp những ngày địa phương đã đóng, làm bù dữ liệu thiếu và cập nhật lại bảy ngày đã đóng gần nhất bằng upsert.

## Chất lượng và phạm vi

- Mobile-first, tiếng Việt, sáng/tối giản, indigo và xanh thành công; bottom navigation Dashboard/Thói quen/Hồ sơ. Touch target tối thiểu 44px, không tràn ngang ở chiều rộng 360px.
- Form có nhãn, lỗi theo trường; loading/skeleton, empty/error và phản hồi thành công/thất bại rõ ràng. Chặn thao tác lặp trong lúc đang gửi, vẫn bảo vệ tính lặp ở backend/database.
- Backend xác thực JWT Supabase, không nhận `user_id` từ client làm căn cứ phân quyền. RLS và constraint/trigger vẫn bảo vệ khi gọi Supabase REST trực tiếp.
- Worker không truy cập database, chỉ gọi internal API bằng khóa riêng. Có timeout, retry hữu hạn, logging không chứa bí mật, không chạy chồng trong một process và dừng theo SIGTERM.
- Chỉ free tier; không tạo tài nguyên trả phí. Free backend có thể sleep và lịch Actions có thể trễ; không hứa thời gian tổng hợp chính xác.

Không thuộc MVP: lịch lặp theo tuần, reminders, streak freeze, check-in bù, social, team, gamification, analytics nâng cao, offline sync, tài khoản quản trị.
