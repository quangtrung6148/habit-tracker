# Triển khai và kiểm chứng

## Trạng thái

Tài liệu này phân biệt source/config đã chuẩn bị với thao tác runtime và triển khai đã kiểm chứng. Không coi migrations, Auth, RLS, Docker hoặc deployment đã thành công chỉ từ việc tồn tại file. Kết quả lệnh thực tế sẽ được bổ sung khi hoàn tất kiểm thử; chưa có URL production được xác nhận trong tài liệu này.

Đã chạy tại môi trường phát triển ngày 17/10/2026: `npm --prefix worker run typecheck`, `npm --prefix worker run build` và `npm --prefix worker test` đều exit 0; **10/10 worker tests** qua. Các test kiểm tra contract/cursor, network/503 retry và jitter, 401 không retry, hết retry, cursor lặp, response sai, timeout, hủy request, chờ giữa các lượt không chạy chồng, config HTTPS. Đây là test fetch giả và clock/sleep inject, chưa chứng minh internal API hoặc dịch vụ production hoạt động.

Root agent đã xác nhận migrations áp dụng trên project thật, SQL integration chạy trong transaction rollback thành công và Supabase security advisors không có cảnh báo; **25 backend tests** qua. Các probe rollback không để lại tài khoản/dữ liệu kiểm thử. Repository GitHub public đã tạo; push, CI Linux, Auth email và deployment runtime chỉ đánh dấu hoàn tất sau khi có kết quả tương ứng.

## Supabase

Project ID `zqbezrlrijxyealjefsi`. Kiểm tra project đang trống hay có dữ liệu trước khi áp dụng migration; không reset database từ xa. Áp dụng SQL theo thứ tự, kiểm tra bảng/constraint/RLS/function/grant và advisors. Lấy publishable/anon key cho frontend/backend và service-role key chỉ cho backend internal summary.

Auth cần cấu hình Site URL, callback local/production, email confirmation và SMTP cho đăng ký thật. Kiểm thử bằng hai tài khoản có quyền riêng; dùng JWT A/B để thử cả Express lẫn Supabase REST. Không ghi password/token vào source hoặc logs.

## GitHub, Vercel và Render

1. Tạo repository public khi có quyền tài khoản; kiểm tra secrets trước push và cấu hình CI dùng lockfile từng ứng dụng.
2. Render Free Web Service root `backend`, `npm ci && npm run build`, start `npm start`, health `/health`, bind `0.0.0.0:$PORT`. `FRONTEND_URL` là origin Vercel cụ thể, không wildcard; trust proxy theo ingress thực tế.
3. Vercel root `frontend`, build Next.js. Đặt `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (hoặc `NEXT_PUBLIC_SUPABASE_ANON_KEY` tương thích cũ), server-only `API_INTERNAL_URL=https://<render-host>` và `APP_URL=https://<vercel-host>`. Không đưa service-role/service key vào biến public. `LOCAL_DOCKER` chỉ bật cho Docker local, không bật production.
4. Backend cần `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FRONTEND_URL`, `NODE_ENV=production`, khóa `SUPABASE_SERVICE_ROLE_KEY` và `SERVICE_API_KEY` để bật internal summary. Khóa service ngẫu nhiên ít nhất 32 ký tự và giống phía worker.
5. Sửa Supabase allowed redirects theo domain thật, kiểm tra callback và đăng xuất, rồi chạy E2E.

Không tạo paid instance, paid cron hay paid worker. Không tự nâng plan khi quota free hết. Render có cold start; frontend phải hiển thị trạng thái chờ/lỗi có thể thử lại, không giả thành dữ liệu rỗng.

## Worker production

GitHub Actions chạy phút 23 mỗi giờ và hỗ trợ workflow_dispatch. Chỉ bật khi repository variable `DAILY_SUMMARY_ENABLED=true`; mặc định chưa chạy. Checkout → Node22 → `npm ci` trong worker → build → `node dist/index.js --once`. Job concurrency một nhóm, không cancel lượt đang chạy; giới hạn 30 phút và quyền repository `contents:read`. Repository variable `BACKEND_URL` phải là HTTPS origin, repository secret `SERVICE_API_KEY` riêng; không echo khóa.

CI trong `.github/workflows/ci.yml` cài ba ứng dụng từ lockfile, secret scan, test/typecheck/build; khởi động Supabase local CLI 2.121.0 với migrations, SQL integration và kiểm thử Auth/API/browser thật, sau đó build ba Docker image. CI dùng khóa fixture local, mask trước khi xuất môi trường, không dùng khóa project thật. Workflow đã viết không đồng nghĩa đã chạy thành công trên GitHub.

Worker cố gắng tối đa ba lần cho mỗi request transient, mỗi attempt timeout 120 giây; delay 1/2 giây cộng jitter dưới 500ms. Endpoint chạy batch100 và trả cursor. Cold start hoặc Actions trễ có thể làm một lượt chậm/thất bại; lượt kế tiếp bắt đầu từ đầu, upsert an toàn và làm bù. Không dùng lịch này để hứa thống kê đúng phút hoặc giữ Render luôn thức. Scheduled workflow trên public repo có giới hạn/điều kiện hoạt động của nhà cung cấp; theo dõi Actions và chạy thủ công nếu cần.

## Ma trận nghiệm thu

| Nhóm | Kiểm tra | Bằng chứng yêu cầu |
|---|---|---|
| Build | Typecheck/build frontend, backend, worker | Worker đã qua; frontend/backend chờ cập nhật kết quả tổng thể. |
| Auth | Signup, confirm, login, wrong password, refresh, logout | E2E local/production theo cấu hình SMTP thật. |
| Ownership | A không truy cập B qua Express và REST | Hai JWT thật; ghi mã status, không ghi token. |
| Habits | Create/edit/soft-delete, validation, pause/resume | Test API + browser; ngày lịch sử giữ nguyên. |
| Check-in | Duplicate/concurrent, undo, today-only, streak gap | DB integration + test ngày cố định; midnight khác timezone browser. |
| Dashboard | Đủ bảy ngày, mẫu số theo lịch sử, zero state | So sánh với dữ liệu nguồn đã biết. |
| Worker | Success/retry/401/timeout/cursor/SIGTERM | Automated worker tests và internal API integration. |
| SQL | Unique, RLS, grants, DATE và composite ownership | Áp migration + SQL/REST probes trực tiếp. |
| Docker | Compose build/start, health, service networking | Docker runtime thật; `compose config` chỉ chứng minh cấu hình parse được. |
| Production | HTTPS frontend→API, Auth callback, job run | URL, health, browser E2E và log đã lọc secrets. |

## Trở ngại triển khai cần cấu hình thật

- Push/CI và repository secrets trên GitHub; quyền liên kết Vercel/Render. Repository public đã tạo, không còn là trở ngại tạo repository.
- Service-role key đặt bằng Dashboard/secret store ở backend; không yêu cầu người dùng dán bí mật vào chat/source.
- SMTP/Auth redirect URLs cho signup sử dụng thật. Nếu email bị giới hạn, báo đúng bước chưa kiểm chứng.
- Docker engine nếu môi trường chỉ có CLI hoặc không có Docker; không báo Compose runtime thành công khi chưa chạy được.

Sau khi có quyền/cấu hình, hoàn tất các bước chưa được xác minh, cập nhật kết quả với lệnh/URL thực tế và các giới hạn còn lại. Không cần thiết kế thêm tính năng để vượt qua trở ngại hạ tầng.
