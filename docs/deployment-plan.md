# Triển khai và kiểm chứng

## Đợt ổn định ngày 20/10/2026

- Frontend chỉ tự thử lại GET khi lỗi mạng/timeout hoặc HTTP 408/502/503/504: tối đa ba lượt, timeout 45 giây/lượt, chờ 1 rồi 2 giây. POST/PATCH/DELETE không tự gửi lại; khi mất kết nối, người dùng được hướng dẫn tải lại dữ liệu để xác minh kết quả.
- HTML, JSON hỏng hoặc envelope sai từ upstream được chuyển thành lỗi máy chủ an toàn 502 (giữ 408/502/503/504 nếu có). JSON body sai do client vẫn là 400 `INVALID_JSON`; lỗi validation/xác thực hợp lệ từ backend được giữ nguyên. Trạng thái tải có thông báo bằng chữ.
- Local: 49 tests qua (26 backend, 13 frontend, 10 worker), typecheck ba ứng dụng và build cả ba ứng dụng qua, secret scan qua. Browser recovery được bổ sung vào harness Supabase local; chưa coi là đã chạy cho đến khi CI xác nhận.
- Review bổ sung: lượt tải tự động từ interval/visibility không chồng lên lượt đang chạy. Khi mutation có thể đã commit nhưng kết quả chưa xác nhận (HTTP 408/5xx hoặc mất kết nối), UI hướng dẫn kiểm tra dữ liệu và đóng modal tạo/sửa để nút tải lại truy cập được. Harness mô phỏng POST commit 201 nhưng phản hồi tới browser là 503, xác minh chỉ tạo một habit.
- Kiểm tra vận hành: Render đang Free/Singapore và auto deploy theo commit `main`. Vercel chưa có Git link; CLI kết nối `quangtrung6148/habit-tracker` thất bại vì chưa truy cập được repository. Không tạo project trùng.
- GitHub hiện có variable `BACKEND_URL`, không có repository secret và chưa có `DAILY_SUMMARY_ENABLED`. Worker production chưa đủ điều kiện bật. Người dùng xác nhận chưa có SMTP; đăng ký công khai chưa nghiệm thu.

### Hoàn tất các bước cần Dashboard

1. Git: mở [Vercel Git settings](https://vercel.com/rannn/habit-tracker/settings/git), kết nối repository `quangtrung6148/habit-tracker`. Nếu cần, cấp quyền repository cho ứng dụng Vercel trong [GitHub installations](https://github.com/settings/installations). Xác nhận một push mới tạo deployment đúng commit trước khi đánh dấu auto deploy hoàn tất.
2. Worker: trong [Render Environment](https://dashboard.render.com/web/srv-db9ncqbbc2fs73chtdbg/env), đặt `SUPABASE_SERVICE_ROLE_KEY` và `SERVICE_API_KEY` ngẫu nhiên ít nhất 32 ký tự. Lấy service-role key từ Supabase Dashboard, không đặt ở frontend. Lưu và deploy; `/health` phải báo `worker_configured:true`.
3. Đặt cùng `SERVICE_API_KEY` tại [GitHub Actions secrets](https://github.com/quangtrung6148/habit-tracker/settings/secrets/actions). Chưa bật lịch khi backend hoặc secret chưa sẵn sàng. Sau khi cấu hình xong, bật repository variable `DAILY_SUMMARY_ENABLED=true`, chạy workflow thủ công, kiểm tra job thành công và summary được tạo; nếu lỗi thì tắt variable, xử lý rồi chạy lại. Việc bật variable cho phép cả chạy thủ công và lịch mỗi giờ.
4. Email: cấu hình nhà cung cấp SMTP và địa chỉ gửi đã xác minh tại [Supabase Auth email](https://supabase.com/dashboard/project/zqbezrlrijxyealjefsi/auth/smtp). Kiểm tra Site URL/redirect về origin Vercel, bật xác nhận email; đăng ký bằng hộp thư thật và hoàn tất callback trước khi mở đăng ký công khai. Không coi SMTP mặc định hoặc email thử trong CI là bằng chứng gửi email công khai.

Không dán secret vào chat, commit hay log. Chỉ đánh dấu từng bước sau khi có bằng chứng runtime. Đợt này chưa bổ sung lịch tuần, nhắc nhở hoặc thống kê tháng.

## Trạng thái

Tài liệu này phân biệt source/config đã chuẩn bị với thao tác runtime và triển khai đã kiểm chứng. Không coi migrations, Auth, RLS, Docker hoặc deployment đã thành công chỉ từ việc tồn tại file.

Đã chạy tại môi trường phát triển ngày 17/10/2026: `npm --prefix worker run typecheck`, `npm --prefix worker run build` và `npm --prefix worker test` đều exit 0; **10/10 worker tests** qua. Các test kiểm tra contract/cursor, network/503 retry và jitter, 401 không retry, hết retry, cursor lặp, response sai, timeout, hủy request, chờ giữa các lượt không chạy chồng, config HTTPS. Đây là test fetch giả và clock/sleep inject, chưa chứng minh internal API hoặc dịch vụ production hoạt động.

Root agent đã xác nhận migrations áp dụng trên project thật, SQL integration chạy trong transaction rollback thành công và Supabase security advisors không có cảnh báo; **26 backend tests**, **10 worker tests**, **3 Playwright smoke scenarios**, frontend build/typecheck qua. Các probe rollback không để lại tài khoản/dữ liệu kiểm thử. Source đã push lên [repository public](https://github.com/quangtrung6148/habit-tracker).

Kiểm tra database sau rollback: users/habits/check-ins đều 0, mọi bảng ứng dụng bật RLS; security advisors 0 cảnh báo. Performance advisors chỉ có INFO unused index trên database mới, không còn missing foreign-key index.

SQL integration có kiểm tra đường đổi ngày quốc tế tất định: hai tài khoản `Pacific/Honolulu` và `Pacific/Kiritimati` chênh đúng 24 giờ, nên ngày nghiệp vụ khác nhau ở mọi thời điểm chạy. Test gọi RPC thực của ứng dụng và kiểm tra ngày check-in lưu cùng streak theo từng tài khoản; toàn bộ SQL suite đã chạy rollback thành công trên project thật.

[CI cuối cùng](https://github.com/quangtrung6148/habit-tracker/actions/runs/39037069363) tại commit `cf0ceb4d0b533260e32e56e55232d6fbdc52b102` đã **SUCCESS toàn bộ**: install/secret scan/unit tests, typecheck/build ba ứng dụng; Supabase local migrations và SQL integration; JWT thật, ownership, concurrent check-in, quy tắc ngày, summary replay; browser đăng ký→email xác nhận thật qua Mailpit→profile→habit CRUD/check-in/undo/pause/resume/lịch sử/xóa→mobile→logout/login; ba smoke scenarios; build ba Docker image; Compose config/up frontend/backend/worker, `/health`, login page và worker thực sự gọi backend→database hoàn thành summary. Cleanup Compose và Supabase đều thành công.

Các email/tài khoản integration chỉ ở Supabase local trong CI, không phải người dùng production. Harness giữ đúng hành vi chi tiết archived sau xóa và đóng modal bằng nút trước khi điều hướng; không dùng force-click để che lỗi.

## Production đã kiểm chứng

- Vercel deployment `dpl_5Vm7fAJxVe89J7VmYiP7W84jKn11` READY tại [habit-tracker-lime-xi.vercel.app](https://habit-tracker-lime-xi.vercel.app).
- Render Free Web Service `srv-db9ncqbbc2fs73chtdbg`, deployment `dep-db9nefijnfac73cuss7g` LIVE tại [habit-tracker-api-0lnr.onrender.com](https://habit-tracker-api-0lnr.onrender.com/health).
- Browser production: login page 200, nhập sai mật khẩu trả 400 qua Auth Vercel→Supabase, không overflow mobile hoặc pageerror; BFF Origin guard trả 403.
- API production: `/health` 200 và `worker_configured:false`; anonymous protected endpoint 401. Worker production chưa được bật, không coi đây là job summary đã chạy.
- Chưa kiểm chứng production: đăng ký/xác nhận email bằng SMTP thật, toàn bộ luồng tài khoản đã đăng nhập và scheduled worker với secrets thật.

Render được tạo qua API tool chưa hỗ trợ rootDir/healthCheckPath: service thực tế dùng root repository, build `npm ci --prefix backend && npm run build --prefix backend` với `NPM_CONFIG_INCLUDE=dev`, start `npm start --prefix backend`; provider dùng TCP health, đồng thời `/health` đã probe 200. `render.yaml` là cấu hình chuẩn root `backend`, build include dev và `/health`, đã chuẩn bị nhưng chưa được attach/sync vào service thực tế. Không nói service đang do Blueprint quản lý.

Vercel kết nối GitHub tự động thất bại vì integration chưa có quyền repository. Deployment source bằng CLI đã thành công và là deployment đang public. Cần cấp quyền repository cho integration để các push sau tự deploy; không coi auto deploy đã bật.

## Supabase

Project ID `zqbezrlrijxyealjefsi`. Kiểm tra project đang trống hay có dữ liệu trước khi áp dụng migration; không reset database từ xa. Áp dụng SQL theo thứ tự, kiểm tra bảng/constraint/RLS/function/grant và advisors. Lấy publishable/anon key cho frontend/backend và service-role key chỉ cho backend internal summary.

Auth cần cấu hình Site URL, callback local/production, email confirmation và SMTP cho đăng ký thật. Kiểm thử bằng hai tài khoản có quyền riêng; dùng JWT A/B để thử cả Express lẫn Supabase REST. Không ghi password/token vào source hoặc logs.

## GitHub, Vercel và Render

1. Tạo repository public khi có quyền tài khoản; kiểm tra secrets trước push và cấu hình CI dùng lockfile từng ứng dụng.
2. Khi triển khai bằng cấu hình chuẩn: Render Free Web Service root `backend`, `npm ci --include=dev && npm run build`, start `npm start`, health `/health`, bind `0.0.0.0:$PORT`. `FRONTEND_URL` là origin Vercel cụ thể, không wildcard; trust proxy theo ingress thực tế. Service hiện tại dùng lệnh prefix từ root như đã ghi phía trên.
3. Vercel root `frontend`, build Next.js. Đặt `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (hoặc `NEXT_PUBLIC_SUPABASE_ANON_KEY` tương thích cũ), server-only `API_INTERNAL_URL=https://<render-host>` và `APP_URL=https://<vercel-host>`. Không đưa service-role/service key vào biến public. `LOCAL_DOCKER` chỉ bật cho Docker local, không bật production.
4. Backend cần `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FRONTEND_URL`, `NODE_ENV=production`, khóa `SUPABASE_SERVICE_ROLE_KEY` và `SERVICE_API_KEY` để bật internal summary. Khóa service ngẫu nhiên ít nhất 32 ký tự và giống phía worker.
5. Sửa Supabase allowed redirects theo domain thật, kiểm tra callback và đăng xuất, rồi chạy E2E.

Không tạo paid instance, paid cron hay paid worker. Không tự nâng plan khi quota free hết. Render có cold start; frontend phải hiển thị trạng thái chờ/lỗi có thể thử lại, không giả thành dữ liệu rỗng.

## Worker production

Repository variable `BACKEND_URL` đã được cấu hình thành `https://habit-tracker-api-0lnr.onrender.com`. Lần kiểm tra gần nhất chưa có repository secret `SERVICE_API_KEY` và backend vẫn báo `worker_configured:false`; lịch chưa được bật. Hoàn tất khóa ở Render/GitHub trước khi đặt `DAILY_SUMMARY_ENABLED=true`.

GitHub Actions chạy phút 23 mỗi giờ và hỗ trợ workflow_dispatch. Chỉ bật khi repository variable `DAILY_SUMMARY_ENABLED=true`; mặc định chưa chạy. Checkout → Node22 → `npm ci` trong worker → build → `node dist/index.js --once`. Job concurrency một nhóm, không cancel lượt đang chạy; giới hạn 30 phút và quyền repository `contents:read`. Repository variable `BACKEND_URL` phải là HTTPS origin, repository secret `SERVICE_API_KEY` riêng; không echo khóa.

CI trong `.github/workflows/ci.yml` cài ba ứng dụng từ lockfile, secret scan, test/typecheck/build; khởi động Supabase local CLI 2.121.0 với migrations, SQL integration và kiểm thử Auth/API/browser thật, sau đó build ba Docker image và chạy Compose. CI dùng khóa fixture local, mask trước khi xuất môi trường, không dùng khóa project thật. Run thành công được dẫn ở phần Trạng thái.

Worker cố gắng tối đa ba lần cho mỗi request transient, mỗi attempt timeout 120 giây; delay 1/2 giây cộng jitter dưới 500ms. Endpoint chạy batch100 và trả cursor. Cold start hoặc Actions trễ có thể làm một lượt chậm/thất bại; lượt kế tiếp bắt đầu từ đầu, upsert an toàn và làm bù. Không dùng lịch này để hứa thống kê đúng phút hoặc giữ Render luôn thức. Scheduled workflow trên public repo có giới hạn/điều kiện hoạt động của nhà cung cấp; theo dõi Actions và chạy thủ công nếu cần.

## Ma trận nghiệm thu

| Nhóm | Kiểm tra | Bằng chứng yêu cầu |
|---|---|---|
| Build | Typecheck/build frontend, backend, worker | PASS trong CI Linux và kiểm tra local. |
| Auth | Signup, email confirm, login, wrong password, logout, protected route | PASS E2E Supabase local; SMTP/tài khoản production còn chờ cấu hình. |
| Ownership | A không truy cập B qua Express và REST | PASS bằng JWT thật và SQL/RLS probes. |
| Habits | Create/edit/soft-delete, validation, pause/resume | PASS API + browser và SQL lịch sử. |
| Check-in | Duplicate/concurrent, undo, today-only, streak và timezone | PASS SQL/RPC/REST, 12 request concurrent và browser khác timezone. |
| Dashboard | Bảy ngày, mẫu số lịch sử, zero state | PASS API/browser/SQL theo dữ liệu fixture xác định. |
| Worker | Success/retry/401/timeout/cursor/SIGTERM | PASS 10 tests, internal API replay và actual Compose request. |
| SQL | Unique, RLS, grants, DATE và composite ownership | PASS project thật rollback và Supabase local CI. |
| Docker | Ba image build, Compose start, health/network, worker→DB | PASS runtime thật trên GitHub Linux runner. |
| Production | HTTPS login/BFF/API health, anonymous rejection | PASS public smoke; full authenticated flow và scheduled job còn chờ Dashboard. |

## Trở ngại triển khai cần cấu hình thật

- Repository secrets/variables cho scheduled worker trên GitHub. CI cuối đã xanh; repository public, push, frontend Vercel và backend Render đã hoạt động. Git integration Vercel cần quyền repository để auto deploy.
- Service-role key đặt bằng Dashboard/secret store ở backend; không yêu cầu người dùng dán bí mật vào chat/source.
- SMTP/Auth redirect URLs cho signup sử dụng thật. Nếu email bị giới hạn, báo đúng bước chưa kiểm chứng.
- Docker runtime đã kiểm chứng trên Linux CI; nếu muốn chạy Compose ngay trên máy cá nhân, vẫn cần cài/chạy Docker engine ở máy đó.

Sau khi có quyền/cấu hình, hoàn tất các bước chưa được xác minh, cập nhật kết quả với lệnh/URL thực tế và các giới hạn còn lại. Không cần thiết kế thêm tính năng để vượt qua trở ngại hạ tầng.
