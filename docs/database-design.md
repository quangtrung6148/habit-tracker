# Thiết kế database

Migrations nằm trong `supabase/migrations`, áp dụng theo tên tăng dần. Schema thực thi trong SQL là nguồn chuẩn; tài liệu mô tả ý nghĩa nghiệp vụ.

| Bảng | Vai trò và ràng buộc |
|---|---|
| `auth.users` | Supabase quản lý email/mật khẩu; ứng dụng không tạo bảng password. |
| `profiles` | ID liên kết user, timezone IANA và thời điểm tạo; timezone tạo một lần, không sửa về sau. |
| `habits` | UUID, owner, title, description, icon/color, active, created/updated, deleted_at. Xóa mềm; owner/created_at không được sửa. |
| `habit_activity_days` | Habit/owner, ngày hiệu lực và active. Một mốc mỗi habit/ngày; trạng thái gần nhất trước hoặc bằng ngày cần tính. Không ghi mốc quá khứ/tương lai. |
| `habit_checkins` | Habit/owner, checkin_date DATE và timestamp tạo. Unique `(habit_id, checkin_date)`; chỉ thêm/xóa hôm nay. |
| `daily_summaries` | User/ngày, tổng hoạt động, hoàn thành, tỷ lệ và generated_at. Unique `(user_id, summary_date)`; chỉ internal summary được ghi. |

## Tính toàn vẹn và phân quyền

- RLS trên mọi bảng công khai; owner bằng `auth.uid()`. Composite ownership giữa habit và check-in ngăn ghép `habit_id` của người khác với user của mình.
- Trigger/ràng buộc bảo vệ owner, ngày do server xác định, trạng thái hoạt động, soft deletion và tính bất biến lịch sử. Client không thể gửi ngày cũ dù gọi REST trực tiếp.
- Người dùng không sửa activity history hoặc summary trực tiếp. Hàm đặc quyền chỉ thực hiện nhiệm vụ hẹp, cố định search path và kiểm soát grant; service-role client chỉ tồn tại ở internal summary.
- Index phục vụ lọc owner/trạng thái, lookup check-in theo habit/ngày và lookup mốc hoạt động. Kiểm chứng RLS bằng hai JWT thật; test repository giả không chứng minh RLS.

## Công thức

Ngày D thuộc về timezone profile và đồng hồ database. Habit đủ điều kiện nếu đã được tạo trước/đúng D và mốc hoạt động gần nhất tại D là active. Soft delete hôm nay tạo mốc inactive hôm nay; các ngày cũ giữ mốc cũ.

`completion_rate = completed_habits / total_habits * 100`, nếu mẫu số bằng 0 trả 0 và frontend hiện empty state. Chỉ đếm check-in thuộc tập habit đủ điều kiện của D.

Current streak đếm ngược từ hôm nay nếu đã hoàn thành, hoặc từ hôm qua nếu hôm nay chưa hoàn thành. Không có check-in ở cả hai ngày thì bằng 0. Longest streak là độ dài tối đa các nhóm DATE liên tiếp; không dùng khoảng cách mili giây vì DST có ngày dài/ngắn khác nhau. Một check-in hợp lệ được giữ khi pause cùng ngày; pause không tự tạo check-in hay đóng băng chuỗi.

Summary chỉ tổng hợp ngày địa phương đã đóng. Upsert khiến retry/concurrency không tạo duplicate. Ngày cũ không được người dùng chỉnh nên làm bù có thể tính từ dữ liệu hiện có; job vẫn refresh bảy ngày đã đóng gần nhất để sửa lượt chạy dang dở.
