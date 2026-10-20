# Triển khai và kiểm chứng

## Đợt ổn định ngày 20/10/2026

- Frontend chỉ tự thử lại GET khi lỗi mạng/timeout hoặc HTTP 408/502/503/504: tối đa ba lượt, timeout 45 giây/lượt, chờ 1 rồi 2 giây. POST/PATCH/DELETE không tự gửi lại; khi mất kết nối, người dùng được hướng dẫn tải lại dữ liệu để xác minh kết quả.
- HTML, JSON hỏng hoặc envelope sai từ upstream được chuyển thành lỗi máy chủ an toàn 502 (giữ 408/502/503/504 nếu có). JSON body sai do client vẫn là 400 `INVALID_JSON`; lỗi validation/xác thực hợp lệ từ backend được giữ nguyên. Trạng thái tải có thông báo bằng chữ.
- Local: 49 tests qua (26 backend, 13 frontend, 10 worker), typecheck ba ứng dụng và build cả ba ứng dụng qua, secret scan qua. Browser recovery đã chạy thành công trong CI Supabase local được dẫn bên dưới.
- Review bổ sung: lượt tải tự động từ interval/visibility không chồng lên lượt đang chạy. Khi mutation có thể đã commit nhưng kết quả chưa xác nhận (HTTP 408/5xx hoặc mất kết nối), UI hướng dẫn kiểm tra dữ liệu và đóng modal tạo/sửa để nút tải lại truy cập được. Harness mô phỏng POST commit 201 nhưng phản hồi tới browser là 503, xác minh chỉ tạo một habit.
- [CI phát hành ngày 20/10](https://github.com/quangtrung6148/habit-tracker/actions/runs/39403763435) **SUCCESS toàn bộ**, tại `11b87492878e1aa69ca9c858ef4a091724a899c3`: unit tests, SQL/RLS/JWT, browser recovery và write-uncertainty, ba Docker images và Compose runtime. Lượt đầu phát hiện kịch bản đếm request không xét development Strict Mode; fixture đã chuyển lỗi transient sang lượt tải explicit sau thiết lập để kiểm chứng chính xác một lần lỗi rồi phục hồi.
- Vercel production `dpl_BCprfGCusRBwmN9zy1SMeG2MAyqy` **READY**, đã promote lên [domain chính](https://habit-tracker-lime-xi.vercel.app). Artifact ứng dụng tại `8c2078bde3d3432ef9caff70e0c8d6be8a4f4822`; commit CI tiếp theo chỉ sửa `scripts/test-stack.mjs`, được loại khỏi upload Vercel, không đổi source ứng dụng. Public smoke sau promote: login 200, mật khẩu sai 400, anonymous API 401, Origin guard 403, không tràn ngang mobile, không pageerror. Quét runtime log lỗi của deployment trong cửa sổ 5 phút trả 0 bản ghi; không coi đây là giám sát dài hạn.
- Render Free/Singapore: deployment `dep-dbbjsgs9v7es73ffutg0` **LIVE**, `/health` trả 200 và `worker_configured:true` sau khi cấu hình đủ hai biến worker.
- Khóa worker đã đổi đồng bộ GitHub/Render theo chấp thuận của người dùng; runtime trả 401 khi thiếu khóa, sai khóa và dùng khóa cũ. Chương trình worker thật chạy `--once` trên production thành công, không xuất giá trị khóa.
- Đã bật `DAILY_SUMMARY_ENABLED=true`; [job production đầu tiên](https://github.com/quangtrung6148/habit-tracker/actions/runs/39406688771) từ GitHub Actions **SUCCESS**. Số xử lý 0 là đúng: database có một profile nhưng chưa có ngày địa phương đã đóng. Lịch chạy phút 23 mỗi giờ; dispatch thành công không bảo đảm scheduler luôn đúng giờ.
- Vercel đã nối `quangtrung6148/habit-tracker` vào project hiện có, production branch `main`; không tạo project trùng. Push `1edcfd582032db86b611f926712941e324113b66` tự tạo deployment `dpl_7HzUEEiqB8SSHgDw3KDFjEEgVkvz`, `source:git`, target production, **READY** và đã nhận domain chính. Public smoke sau auto deploy vẫn qua, backend báo worker sẵn sàng.
- Người dùng chưa có SMTP riêng; đăng ký/xác nhận email công khai vẫn chưa nghiệm thu.

### Hoàn tất các bước cần Dashboard

1. Git đã nối. Nếu quyền thay đổi, kiểm tra [Vercel Git settings](https://vercel.com/rannn/habit-tracker/settings/git) và [GitHub installation](https://github.com/settings/installations/167214540); repository đúng là `quangtrung6148/habit-tracker`, branch `main`.
2. Worker đã cấu hình đủ: `SERVICE_API_KEY` ngẫu nhiên 32 byte ở hai secret store và khóa Supabase đặc quyền trong biến backend `SUPABASE_SERVICE_ROLE_KEY`. Thay đổi tại [Render Environment](https://dashboard.render.com/web/srv-db9ncqbbc2fs73chtdbg/env) cần lưu/deploy rồi kiểm tra health; không đưa khóa đặc quyền lên frontend.
3. [GitHub Actions secrets](https://github.com/quangtrung6148/habit-tracker/settings/secrets/actions) đã có cùng khóa worker và lịch đã bật. Khi gặp sự cố, đặt `DAILY_SUMMARY_ENABLED=false`, xử lý cấu hình rồi mới bật lại. Có thể dispatch để chạy bù; số summary bằng 0 hợp lệ nếu chưa có ngày đã đóng đủ điều kiện. Không sửa dữ liệu người dùng để tạo kết quả thử.
4. Email: cấu hình nhà cung cấp SMTP và địa chỉ gửi đã xác minh tại [Supabase Auth email](https://supabase.com/dashboard/project/zqbezrlrijxyealjefsi/auth/smtp). Kiểm tra Site URL/redirect về origin Vercel, bật xác nhận email; đăng ký bằng hộp thư thật và hoàn tất callback trước khi mở đăng ký công khai. Không coi SMTP mặc định hoặc email thử trong CI là bằng chứng gửi email công khai.

Không dán secret vào chat, commit hay log. Chỉ đánh dấu từng bước sau khi có bằng chứng runtime. Đợt này chưa bổ sung lịch tuần, nhắc nhở hoặc thống kê tháng.

## Trạng thái

Tài liệu này phân biệt source/config đã chuẩn bị với thao tác runtime và triển khai đã kiểm chứng. Không coi migrations, Auth, RLS, Docker hoặc deployment đã thành công chỉ từ việc tồn tại file.

Đã chạy tại môi trường phát triển ngày 17/10/2026: `npm --prefix worker run typecheck`, `npm --prefix worker run build` và `npm --prefix worker test` đều exit 0; **10/10 worker tests** qua. Các test kiểm tra contract/cursor, network/503 retry và jitter, 401 không retry, hết retry, cursor lặp, response sai, timeout, hủy request, chờ giữa các lượt không chạy chồng, config HTTPS. Đây là test fetch giả và clock/sleep inject, chưa chứng minh internal API hoặc dịch vụ production hoạt động.

Root agent đã xác nhận migrations áp dụng trên project thật, SQL integration chạy trong transaction rollback thành công và Supabase security advisors không có cảnh báo; **26 backend tests**, **10 worker tests**, **3 Playwright smoke scenarios**, frontend build/typecheck qua. Các probe rollback không để lại tài khoản/dữ liệu kiểm thử. Source đã push lên [repository public](https://github.com/quangtrung6148/habit-tracker).

Kiểm tra database sau rollback: users/habits/check-ins đều 0, mọi bảng ứng dụng bật RLS; security advisors 0 cảnh báo. Performance advisors chỉ có INFO unused index trên database mới, không còn missing foreign-key index.

SQL integration có kiểm tra đường đổi ngày quốc tế tất định: hai tài khoản `Pacific/Honolulu` và `Pacific/Kiritimati` chênh đúng 24 giờ, nên ngày nghiệp vụ khác nhau ở mọi thời điểm chạy. Test gọi RPC thực của ứng dụng và kiểm tra ngày check-in lưu cùng streak theo từng tài khoản; toàn bộ SQL suite đã chạy rollback thành công trên project thật.

[CI nền tảng ngày 17/10](https://github.com/quangtrung6148/habit-tracker/actions/runs/39037069363) tại commit `cf0ceb4d0b533260e32e56e55232d6fbdc52b102` đã **SUCCESS toàn bộ**: install/secret scan/unit tests, typecheck/build ba ứng dụng; Supabase local migrations và SQL integration; JWT thật, ownership, concurrent check-in, quy tắc ngày, summary replay; browser đăng ký→email xác nhận thật qua Mailpit→profile→habit CRUD/check-in/undo/pause/resume/lịch sử/xóa→mobile→logout/login; ba smoke scenarios; build ba Docker image; Compose config/up frontend/backend/worker, `/health`, login page và worker thực sự gọi backend→database hoàn thành summary. Cleanup Compose và Supabase đều thành công.

Các email/tài khoản integration chỉ ở Supabase local trong CI, không phải người dùng production. Harness giữ đúng hành vi chi tiết archived sau xóa và đóng modal bằng nút trước khi điều hướng; không dùng force-click để che lỗi.

## Production đã kiểm chứng

- Vercel deployment hiện tại `dpl_7HzUEEiqB8SSHgDw3KDFjEEgVkvz` READY tại [habit-tracker-lime-xi.vercel.app](https://habit-tracker-lime-xi.vercel.app), tự build qua Git từ commit `1edcfd582032db86b611f926712941e324113b66`. Source ứng dụng không đổi so với bản sửa đã kiểm chứng; các commit sau chỉ cập nhật tài liệu vận hành.
- Render Free Web Service `srv-db9ncqbbc2fs73chtdbg`, deployment `dep-dbbjsgs9v7es73ffutg0` LIVE tại [habit-tracker-api-0lnr.onrender.com](https://habit-tracker-api-0lnr.onrender.com/health).
- Browser production: login page 200, nhập sai mật khẩu trả 400 qua Auth Vercel→Supabase, không overflow mobile hoặc pageerror; BFF Origin guard trả 403.
- API production: `/health` 200 và `worker_configured:true`; anonymous protected endpoint 401. Worker `--once` local và GitHub Actions đã thành công; khóa cũ bị từ chối 401.
- Chưa kiểm chứng production: đăng ký/xác nhận email bằng SMTP thật và toàn bộ luồng tài khoản đã đăng nhập. Worker đã dispatch thành công; cần theo dõi các lượt theo lịch trong vận hành thực tế.

Render được tạo qua API tool chưa hỗ trợ rootDir/healthCheckPath: service thực tế dùng root repository, build `npm ci --prefix backend && npm run build --prefix backend` với `NPM_CONFIG_INCLUDE=dev`, start `npm start --prefix backend`; provider dùng TCP health, đồng thời `/health` đã probe 200. `render.yaml` là cấu hình chuẩn root `backend`, build include dev và `/health`, đã chuẩn bị nhưng chưa được attach/sync vào service thực tế. Không nói service đang do Blueprint quản lý.

Vercel đã nối đúng repository sau khi cấp quyền GitHub App. Đã kiểm chứng push mới tạo deployment qua Git đúng commit, build READY và tự gán domain production; không chỉ dựa vào trạng thái liên kết.

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

Repository variables `BACKEND_URL=https://habit-tracker-api-0lnr.onrender.com` và `DAILY_SUMMARY_ENABLED=true` đã cấu hình. Cùng khóa worker mới ở GitHub/Render, khóa Supabase đặc quyền chỉ ở backend; health báo sẵn sàng và job production được dẫn ở đầu tài liệu đã thành công.

GitHub Actions chạy phút 23 mỗi giờ và hỗ trợ workflow_dispatch. Chỉ chạy khi repository variable `DAILY_SUMMARY_ENABLED=true`; production hiện đã bật. Checkout → Node22 → `npm ci` trong worker → build → `node dist/index.js --once`. Job concurrency một nhóm, không cancel lượt đang chạy; giới hạn 30 phút và quyền repository `contents:read`. Repository variable `BACKEND_URL` phải là HTTPS origin, repository secret `SERVICE_API_KEY` riêng; không echo khóa.

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
| Production | HTTPS login/BFF/API health, anonymous rejection, job summary | PASS public smoke và job production dispatch; full authenticated flow/SMTP còn chờ. |

## Trở ngại triển khai cần cấu hình thật

- Worker secrets/variables và quyền GitHub App đã cấu hình. Tiếp tục theo dõi các lượt chạy lịch và deployment theo push; không suy ra SLA từ một lần thành công.
- SMTP/Auth redirect URLs cho signup sử dụng thật. Nếu email bị giới hạn, báo đúng bước chưa kiểm chứng.
- Docker runtime đã kiểm chứng trên Linux CI; nếu muốn chạy Compose ngay trên máy cá nhân, vẫn cần cài/chạy Docker engine ở máy đó.

Sau khi có quyền/cấu hình, hoàn tất các bước chưa được xác minh, cập nhật kết quả với lệnh/URL thực tế và các giới hạn còn lại. Không cần thiết kế thêm tính năng để vượt qua trở ngại hạ tầng.
