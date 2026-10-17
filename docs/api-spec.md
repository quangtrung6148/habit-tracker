# API v1

Base `/api/v1` trên Express; `/health` ngoài prefix. Browser đi qua BFF Next.js cùng origin; BFF chuyển JWT tới backend. Các endpoint tài khoản/thói quen/dashboard yêu cầu `Authorization: Bearer <Supabase JWT>`; backend xác minh user, không tin `user_id` trong payload.

Envelope thành công: `{ "success": true, "data": {}, "message": "Success" }`. Lỗi dùng `success:false`, thông điệp an toàn và mã lỗi; không trả stack hoặc lỗi database thô. JSON input được Zod validate; UUID/path/query sai trả 400, thiếu JWT 401, tài nguyên không thuộc mình 404, xung đột nghiệp vụ 409, lỗi phụ thuộc 5xx. Client không dựa vào chuỗi thông báo để phân nhánh.

| Method/path | Chức năng |
|---|---|
| `GET /auth/me` | User đã xác thực và profile/timezone nếu đã thiết lập. |
| `POST /profile` | Tạo profile với `{timezone}` một lần; timezone IANA hợp lệ. |
| `GET /habits?status=active|paused|all&page=1&limit=20` | Danh sách chưa xóa, có thống kê và metadata phân trang. |
| `POST /habits` | Tạo `{title,description?,icon,color,is_active}`; owner lấy từ JWT. |
| `GET /habits/:id` | Chi tiết thói quen của tài khoản và thống kê streak. |
| `PATCH /habits/:id` | Sửa trường mô tả hoặc active; active áp dụng hôm nay. |
| `DELETE /habits/:id` | Xóa mềm, giữ ngày lịch sử; không có khôi phục. |
| `POST /habits/:id/checkin` | Hoàn thành hôm nay; không nhận ngày hoặc owner; gọi lại idempotent. |
| `DELETE /habits/:id/checkin` | Bỏ check-in hôm nay kể cả đang tạm dừng; gọi lại không tạo lỗi dữ liệu. |
| `GET /habits/:id/checkins?page=1&limit=20` | Lịch sử check-in phân trang, mới nhất trước. |
| `GET /dashboard/summary` | Tổng hoạt động, hoàn thành, tỷ lệ và thống kê streak hiện tại. |
| `GET /dashboard/progress?days=7` | Mặc định bảy ngày gần nhất theo timezone; `days` cho phép 1–31. |
| `POST /internal/daily-summary/run` | Batch tổng hợp; khóa service riêng, không dùng JWT người dùng. |
| `GET /health` | Health check không lộ cấu hình hoặc secrets. |

## Contract worker

```http
POST /api/v1/internal/daily-summary/run
Authorization: Bearer SERVICE_API_KEY
Content-Type: application/json
```

```json
{
  "limit": 100,
  "cursor": {
    "user_id": "00000000-0000-4000-8000-000000000001",
    "summary_date": "2026-10-16"
  }
}
```

Lượt đầu bỏ `cursor`; `limit` có thể bỏ để lấy mặc định backend. Response:

```json
{
  "success": true,
  "data": {
    "processed": 100,
    "has_more": true,
    "next_cursor": {
      "user_id": "00000000-0000-4000-8000-000000000002",
      "summary_date": "2026-10-16"
    }
  },
  "message": "Success"
}
```

Khi hết dữ liệu: `has_more:false,next_cursor:null`. Cursor chỉ phục vụ phân trang một lượt, không lưu thành watermark vĩnh viễn. Backend xác định timezone/ngày đã đóng; worker không nhận ngày từ người dùng và không tự quyết định nghiệp vụ. Request sai/thiếu khóa bị từ chối; internal handler chưa có đủ server secrets phải báo unavailable. Retry cùng batch được phép vì upsert unique theo user/ngày. HTTPS bắt buộc production; khóa chỉ nằm trong header, không query string.

Đăng ký/đăng nhập/đăng xuất/callback do Next.js + Supabase Auth xử lý, Express không lưu hay nhận mật khẩu.
