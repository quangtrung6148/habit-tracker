# Habit Tracker

Ứng dụng theo dõi thói quen hằng ngày, ưu tiên điện thoại: Next.js App Router, Express, Supabase PostgreSQL/Auth và worker Node.js độc lập. Dự án sử dụng Supabase `zqbezrlrijxyealjefsi`; project ID và publishable/anon key là thông tin công khai, service-role key và service API key là bí mật.

Source công khai: [quangtrung6148/habit-tracker](https://github.com/quangtrung6148/habit-tracker).

Ứng dụng: [habit-tracker-lime-xi.vercel.app](https://habit-tracker-lime-xi.vercel.app). API: [health check](https://habit-tracker-api-0lnr.onrender.com/health). Frontend và backend đã triển khai; đăng ký/xác nhận email và worker production cần cấu hình Dashboard còn lại trong [deployment-plan](docs/deployment-plan.md).

## Chức năng

- Đăng ký email/mật khẩu, đăng nhập, đăng xuất và duy trì phiên qua cookie SSR.
- Tạo/sửa/xóa mềm thói quen; tạm dừng và tiếp tục áp dụng từ hôm nay.
- Check-in hoặc bỏ check-in hôm nay, current/longest streak và lịch sử.
- Dashboard hôm nay và biểu đồ bảy ngày; thống kê lịch sử giữ nguyên khi thay đổi thói quen hôm nay.
- Worker tổng hợp ngày đã kết thúc, chạy riêng trong Docker hoặc GitHub Actions.

Mỗi tài khoản chọn múi giờ IANA một lần khi thiết lập, mặc định `Asia/Ho_Chi_Minh`. Không check-in bù, không lịch tuần, không nhắc việc. Ngày tạm dừng chưa hoàn thành vẫn làm đứt streak.

## Chạy local

Yêu cầu Node.js 22, npm, Docker Compose nếu chạy container và kết nối Supabase. Mỗi ứng dụng có lockfile riêng; dùng `npm ci` trong từng thư mục. Trên Windows có thể dùng `npm.cmd` nếu PowerShell chặn `npm.ps1`.

1. Sao chép `.env.example` thành `.env.local` cho frontend/backend/worker; điền khóa tương ứng. Nếu dùng Compose, sao chép thêm `.env.example` ở root thành `.env` để cung cấp Supabase URL/publishable key lúc build frontend. Các file `.env.development`/`.env.production` chỉ chứa giá trị không nhạy cảm.
2. Áp dụng migrations trong `supabase/migrations` theo thứ tự vào project Supabase; kiểm tra cấu hình Auth và redirect URL trước khi thử đăng ký.
3. Chạy frontend port 3000, backend port 5000 và worker theo các lệnh dưới. CLI Node không tự đọc `.env.local`; lệnh dùng `--env-file` để nạp file.

```powershell
cd frontend
npm ci
npm run dev
```

```powershell
cd backend
npm ci
npm run build
node --env-file=.env.local dist/server.js
```

```powershell
cd worker
npm ci
npm run build
node --env-file=.env.local dist/index.js
# Một lượt, gồm toàn bộ các batch:
node --env-file=.env.local dist/index.js --once
```

Khi chạy worker trực tiếp, đặt `BACKEND_URL=http://localhost:5000`. Khi chạy Compose, worker và frontend server dùng `http://backend:5000`; trình duyệt truy cập `http://localhost:3000` và gọi BFF cùng origin. Cấu hình Compose đọc các file môi trường theo `docker-compose.yml` rồi chạy:

```powershell
docker compose up --build
```

Compose chỉ chạy ba ứng dụng; PostgreSQL/Auth được cung cấp bởi Supabase từ xa. Local container dùng `NODE_ENV=development` cho backend/worker để cho phép HTTP nội bộ. Production chỉ dùng HTTPS giữa các dịch vụ.

## Kiểm tra

```powershell
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run build
npm --prefix worker run typecheck
npm --prefix worker test
npm --prefix worker run build
```

Ma trận kiểm chứng và trạng thái thực tế được cập nhật trong [deployment-plan](docs/deployment-plan.md). Test đơn vị không thay thế kiểm tra Auth/RLS với hai tài khoản trên Supabase, Docker runtime hoặc E2E production.

[CI đã qua toàn bộ](https://github.com/quangtrung6148/habit-tracker/actions/runs/39037069363): 26 backend tests, 10 worker tests, ba smoke scenarios, SQL/RLS/timezone integration, đăng ký và email xác nhận thật trên Supabase local, luồng browser đầy đủ, ba Docker builds và Compose runtime gồm worker→backend→database. Production hiện đã qua public login/API smoke; email/tài khoản production và scheduled worker còn chờ Dashboard.

## Triển khai

- Frontend: Vercel, root `frontend`, `API_INTERNAL_URL` trỏ HTTPS tới Render.
- Backend: Render Free Web Service, root `backend`, health check `/health`; không tạo paid Background Worker.
- Worker production: GitHub Actions schedule chạy executable độc lập với `--once`; cần variable `BACKEND_URL`, secret `SERVICE_API_KEY` và `DAILY_SUMMARY_ENABLED=true`.
- Database/Auth: migrations và RLS trong Supabase; cần SMTP phù hợp để đăng ký email của người dùng thật. Không tắt xác nhận email chỉ để vượt qua kiểm thử.

Không commit `.env.local`, service-role key, service API key, access token, `node_modules` hoặc build artifacts. Chỉ backend internal summary dùng service role; request người dùng chạy bằng JWT người dùng và chịu RLS. Cấu hình môi trường theo từng dịch vụ, không sao chép toàn bộ `.env` sang một nơi.

Frontend Vercel và backend Render đã được kiểm chứng public. Luồng đăng nhập có tài khoản thật/xác nhận email và worker production còn cần SMTP/Auth redirect URLs, service-role key trong backend và secrets worker. Vercel đã deploy source bằng CLI; auto deploy từ GitHub cần cấp quyền repository cho integration. Chi tiết: [deployment-plan](docs/deployment-plan.md).

## Tài liệu

- [Yêu cầu](docs/requirements.md), [User stories](docs/user-stories.md).
- [Kiến trúc](docs/architecture.md), [Database](docs/database-design.md), [API](docs/api-spec.md).
- [Thảo luận BMAD](docs/bmad-discussion.md), [Triển khai và kiểm chứng](docs/deployment-plan.md).
