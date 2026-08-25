# `@deepseek-ai/dsh-web-app`

[English](README.md) | Tiếng Việt

Gói tổ hợp lớp hiển thị trình duyệt của dsh. [`cordis.patch.yml`](cordis.patch.yml) chồng lên [`dsh-base`](../base/README.md): thiết lập persona coding, chèn các dòng host Web (webserver, API gateway, workspace, cache chiếu (projection cache), lưu trữ), danh mục plugin trình duyệt và chuỗi reload plugin client luôn được gắn ([`dsh-client-hmr`](../../client/hmr/README.md), giữ trạng thái nhàn rỗi cho đến khi watcher rebuild ghi lại bundle client), và gắn plugin gắn kết (glue) `web-runtime` của gói này (cấu hình dưới dạng `{printUrl, surfaceContext, trustedHosts, apiTokenFile}`). Plugin này giải quyết dist frontend đã build qua exports của `@deepseek-ai/dsh-web-frontend`, chỉ lấy mẫu thông tin tin cậy LAN phụ thuộc bind một lần, giải quyết API token của lần triển khai đó (xem bên dưới), và cung cấp chúng dưới dạng `webRuntime` cho rào chắn tin cậy trình duyệt và danh mục client, gắn chủ sở hữu chỗ trống dự phòng [`frontend-static`](../../host/frontend-static/README.md), đăng ký các đoạn prompt Harness source và Web surface khi `surfaceContext` là true, cùng biến thời gian chạy `DSH_WEB_URL` hiển thị với bash, và in dòng URL `dsh web:` sau khi cây cấu hình Loader của chính nó kết toán khi `printUrl` là true, tránh công bố một ứng dụng đã thất bại khi các dòng anh em thất bại. Gói tổ hợp này còn giữ dòng lệnh ứng dụng: provider `web-startup` thông thường ([`src/startup.ts`](src/startup.ts)) inject `ctx.cmdlineArgs` ([`dsh-cmdline`](../../boot/cmdline/README.md)), phân tích `--host`, `--port`, `--trusted-host` có thể lặp lại và `--help` riêng của ứng dụng, rồi cung cấp `webStartup`. Nó từ chối `--host 0.0.0.0` trước khi phát hành service này, vì CLI (giao diện dòng lệnh) hiện chủ ý không hỗ trợ bind mọi giao diện mạng. Các dòng được cấu hình bởi flag sẽ inject service này và đọc nó trực tiếp trong cấu hình lazy, nên không có gì bind cổng trước khi phân tích tham số hoàn tất, và `dsh --profile web --help` cũng không khởi động server. [`dsh-headless`](../headless/README.md) là lớp hiển thị đồng cấp trên cùng base này, không gắn gói tổ hợp này.

## Xác thực API bắt buộc

Việc triển khai Web luôn khởi động với xác thực Bearer token được kích hoạt trên `/api`, nên client phía server (ví dụ backend Odoo) có thể xác thực ngay lập tức, trong khi SPA cùng nguồn (same-origin) và curl loopback vẫn hoạt động bình thường mà không cần token. `apiTokenFile`, `trustedHosts` và `auth` đều là giá trị mặc định trong code — patch bundle không còn nhắc lại chúng: `apiTokenFile` của `web-runtime` mặc định là `dshHomePath('api-token')`, `trustedHosts` của nó đọc service `webStartup` đã inject, còn dòng `connection` chỉ giữ `inject: [webRuntime]` (để sắp xếp khởi động) và mặc định `trustedHosts`/`auth` từ runtime đó trong code ([`dsh-client-connection`](../../client/connection/README.md)). Dòng `web-runtime` giải quyết token theo thứ tự sau ([`src/api-token.ts`](src/api-token.ts)): dùng biến môi trường `DSH_API_TOKEN` nếu được thiết lập (xác thực ≥16 ký tự, do người vận hành ghi đè, không bao giờ được lưu bền vững); nếu không thì dùng token đã lưu bền vững từ lần khởi động trước tại `$DSH_HOME/api-token` (mặc định `~/.dsh/api-token`); nếu không thì tạo một token hex 32 byte mới, lưu bền vững nguyên tử với quyền 0600, và ghi log một lần theo đường dẫn tệp (`dsh web: no API token found; generated one at <path> — read it with: cat <path>` — không bao giờ ghi log giá trị token). Tệp lưu bền vững tồn tại nhưng không đọc được hoặc sai định dạng (rỗng/quá ngắn) sẽ làm khởi động thất bại, thay vì âm thầm ghi đè tệp của người vận hành; tệp chỉ sai quyền nhưng vẫn đọc được thì giữ nguyên. Token đã giải quyết được phát hành trên `webRuntime.apiToken`, dòng `connection` đưa nó vào `auth.tokens`; manifest `unpinned` của lần triển khai đó cấp cho client đã xác thực bốn phương thức tạo lập `agentPreset.*`. Cách xoay vòng: xóa tệp token đó (lần khởi động tiếp theo sẽ tạo cái mới), hoặc đặt `DSH_API_TOKEN` thành giá trị mới. Cơ chế xác thực chung và ngữ nghĩa rào chắn của nó được ghi ở [`dsh-client-connection`](../../client/connection/README.md); chỉ gói tổ hợp này biến nó thành bắt buộc.

## Trải nghiệm Model

### Ngữ cảnh Harness source và Web surface

#### Model nhìn thấy gì

Khi `surfaceContext` là true, đoạn `harness:source` chỉ ra vị trí triển khai Harness trên đĩa, nhưng không khẳng định đó là thư mục làm việc; đoạn toàn cục `app:web-surface` (thứ tự −98) giải thích GUI cho model: URL cục bộ chuẩn, "this page" (trang này) chỉ cái gì, quy ước cập nhật (bên nhận reload luôn bật; reload không làm mới trang còn cần watcher `pnpm run dev:web`), và chỉ dẫn không khởi động server thay thế. `DSH_WEB_URL` cũng xuất hiện cùng mô tả trong môi trường bash được quản lý, được giải quyết từ server đang chạy trong mỗi lần gọi. Khi nó là false, cả hai đoạn này và biến đó đều không được đăng ký.

#### Tác động Token

Mỗi session một dòng giải thích source và một đoạn prompt, cộng thêm hai dòng biến môi trường được quản lý; giữ nguyên trong suốt mỗi tiến trình.

#### Tác động KV Cache

Đoạn prompt này nằm ở vị trí đầu trong system prompt, và ổn định trong suốt vòng đời tiến trình (cổng là sự kiện tại thời điểm khởi động), nên không làm mất hiệu lực cache qua các lượt.

## Hạn chế đã biết và công việc hoãn lại

- **Frontend dist phải đã được build**: `require.resolve` trên dist báo lỗi rõ ràng kèm gợi ý build khi kích hoạt; không có đường dẫn dự phòng phục vụ trực tiếp từ source.
- **`lanAddresses` là bản chụp nhanh tại thời điểm khởi động**: thay đổi card mạng sau khi khởi động sẽ không được công bố lại; URL LAN được in ra luôn khớp với rào chắn tin cậy đã cấu hình.
