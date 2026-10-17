# User stories và acceptance criteria

| ID | Story | Điều kiện nghiệm thu |
|---|---|---|
| AUTH-1 | Là người mới, tôi muốn đăng ký email/mật khẩu. | Có validation; Supabase quản lý mật khẩu; thông báo xác nhận email đúng cấu hình; callback không cho redirect tùy ý. |
| AUTH-2 | Tôi muốn đăng nhập và duy trì phiên. | Sai mật khẩu có thông báo; tải lại trang vẫn có phiên; protected route/API từ chối người chưa đăng nhập; đăng xuất kết thúc phiên. |
| PROFILE-1 | Tôi muốn chọn ngày nghiệp vụ phù hợp. | Chọn IANA timezone khi thiết lập, mặc định HCM; thông báo chọn một lần; Hồ sơ hiển thị timezone, không có sửa. |
| HABIT-1 | Tôi muốn tạo và sửa thói quen hằng ngày. | Tiêu đề bắt buộc, giới hạn trường rõ; màu/icon hợp lệ; thói quen mới check-in ngay hôm nay; sửa không đổi lịch sử cũ. |
| HABIT-2 | Tôi muốn tạm dừng rồi tiếp tục. | Có bộ lọc đang hoạt động/tạm dừng; tác động hôm nay; hoàn thành mới bị chặn khi tạm dừng nhưng undo hôm nay được phép; complete→pause→resume trong một ngày vẫn complete nếu không undo. |
| HABIT-3 | Tôi muốn xóa thói quen không còn dùng. | Xác nhận trước khi xóa; giải thích giữ thống kê trước đây; biến mất khỏi danh sách; không sửa/check-in lại. |
| CHECK-1 | Tôi muốn hoàn thành hoặc bỏ hoàn thành hôm nay. | Có nút trên thẻ; request trùng/concurrent không tạo bản ghi trùng; undo chỉ hôm nay; phản hồi lỗi khôi phục UI đúng dữ liệu server. |
| CHECK-2 | Tôi muốn thấy chuỗi nỗ lực. | Current/longest đúng; unfinished today vẫn giữ chuỗi hôm qua; missed whole day ngắt chuỗi; pause không freeze; undo tính lại. |
| DASH-1 | Tôi muốn biết tiến độ hôm nay và tuần gần nhất. | Tổng hoạt động, hoàn thành, tỷ lệ, streak, bảy ngày đúng; không chia 0; cập nhật sau thao tác; ngày cũ không bị sửa bởi pause/delete hôm nay. |
| HISTORY-1 | Tôi muốn xem lịch sử từng thói quen. | Danh sách có phân trang; chỉ dữ liệu của mình; không có điều khiển check-in bù. |
| OPS-1 | Tôi muốn thống kê lịch sử được tổng hợp ổn định. | Worker chỉ gọi backend; sai khóa bị từ chối; chạy lại không trùng; chạy bù ngày thiếu; lỗi có log an toàn; dashboard vẫn dùng được khi job chậm. |

## Kịch bản bắt buộc

- Hai tài khoản A/B: B không đọc/sửa/xóa habit, check-in, profile và summary của A qua Express hoặc Supabase REST trực tiếp.
- Check-in đúng trước/sau nửa đêm tài khoản, trong khi trình duyệt ở múi giờ khác. Không dùng timestamp UTC đơn giản để suy ngày.
- Tạo rồi xóa cùng ngày; complete rồi pause rồi resume cùng ngày; pause qua nửa đêm rồi resume; trạng thái ngày trước không thay đổi.
- Worker nhận 401, 429/503, timeout, network error; hết retry phải thất bại rõ; cursor lặp phải dừng; SIGTERM hủy request/timer.
- Điện thoại 360px: thao tác chính chạm được, không overflow, tab bàn phím và nhãn đọc màn hình dùng được; loading/empty/error đều có giao diện.
