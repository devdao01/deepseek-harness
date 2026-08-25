# Agent Note: Windows mặc định chuyển sang pwsh

Status: implemented

[English](2026-08-01-windows-pwsh-default.md) | Tiếng Việt

## Vấn đề

Hình dung thực thi mà harness ship ra là bash-first trên mọi nền tảng. Máy chủ Windows buộc phải cài lớp đệm bash (WSL hoặc Git-Bash), hoặc lùi về hành vi chỉ dành cho POSIX của `dsh-bash-local` (argv `bash -c` hardcode, ngữ nghĩa process group); còn tool bash hướng model thì dạy phương ngữ bash. Nền tảng native cho Windows đã được ship cùng [quyết định executor và tool pwsh](2026-08-01-pwsh-tool-and-executor.md) — bản hiện thực PowerShell cho seam `ctx.shell` và tool `pwsh` tương đương — nhưng tổ hợp được ship trên Windows vẫn gắn stack bash, nên máy chủ Windows không có lớp đệm thì không chạy được shell được ship.

## Quyết định

Máy chủ Windows khởi động các profile được ship (`dsh web`, `dsh --profile headless`, tác vụ một lần) mặc định nhận stack PowerShell; máy chủ POSIX không đổi.

- **base patch kiểm soát hai stack shell theo nền tảng ngay trên dòng của chính chúng** (note [nội suy `disabled` của loader](../architecture/2026-08-11-loader-entry-disabled-interpolation.md) ghi lại cơ chế này và việc gấp phẳng tầng nền tảng): `bash-sandbox`/`tool-bash` mang `disabled: !!js process.platform === 'win32'` (bash không có runner Windows), còn các dòng sinh đôi `pwsh-sandbox`/`tool-pwsh` chỉ gắn trên win32 với biểu thức đảo ngược — cùng một file patch, mỗi máy chủ gắn đúng một stack shell. Stack pwsh hạn chế chạy trên runner restricted token theo ACL, với bề mặt quyền hoàn toàn khớp POSIX (note [Windows ACL restricted token sandbox](2026-08-08-windows-acl-restricted-token-sandbox.md) sở hữu bảng kê đó). Ghi đè mặc định được ship là một quyết định tổ hợp: máy chủ Windows muốn dùng stack bash hoặc executor pwsh không hạn chế thì ghi đè các dòng này qua `cordis.patch.yml` ở profile hoặc ở home (công thức khôi phục bash phải đầy đủ: tắt `pwsh-sandbox`/`tool-pwsh` và bật lại `bash-sandbox`/`tool-bash` — cả hai họ executor cùng đăng ký một service `bash`, công thức không đầy đủ sẽ fail loud lúc load) — config tổ hợp là kênh ghi đè duy nhất. Tầng `windows.cordis.patch.yml` riêng biệt cùng phần tiêm `apps/cli/src/windows-shell.ts` của launcher đã bị xóa; tầng đó chỉ tồn tại vì metadata của entry là tĩnh.
- **Phân giải module lúc khởi động nguội đã được khôi phục.** Đợt tái cấu trúc profiles đã bỏ các package pwsh khỏi bao đóng dependency của `apps/cli`, nên `healProfilesModuleFallback` chưa bao giờ liên kết chúng vào `$DSH_HOME/profiles/node_modules`, và máy chủ Windows mới không phân giải được các dòng pwsh. `apps/cli` và `dsh-base` khai báo `dsh-pwsh-sandbox`/`dsh-tool-pwsh`, còn chuỗi dependency của executor cung cấp `dsh-pwsh-local`; theo quy ước của repo, base bundle liệt kê mọi plugin trên từng dòng như một dependency.

Phần render GUI cho pwsh đã được ship trước cùng [quyết định parity trình bày UI pwsh với bash](2026-08-05-pwsh-ui-bash-parity.md); [quyết định parity tool pwsh với bash](2026-08-02-pwsh-tool-bash-parity.md) đã ship bề mặt tool. Quyết định này không làm thay đổi bất kỳ hành vi POSIX nào.

## Phương án thay thế

**Để Windows mặc định dùng pwsh ngay bên trong `dsh-bash-local` (một executor, một công tắc phương ngữ).** Bác bỏ, vì cùng lý do mà quyết định executor đã bác bỏ công tắc chế độ: danh tính của một executor chính là shell mà nó spawn, còn tổ hợp có kiểm soát theo nền tảng là một lựa chọn triển khai, không phải config của executor.

**Ship tầng nền tảng từ mã nguồn `apps/cli` thay vì từ file dữ liệu của bundle.** Bác bỏ: patch nên nằm cạnh chính những dòng mà nó thay thế, thuộc về bundle sở hữu các dòng đó, để bảng kê được ship vẫn hiện diện dưới dạng dữ liệu tổ hợp và bản dump mang theo xuất xứ; launcher chỉ đóng góp phần kiểm soát win32.

**Giữ lại `permission`/`ui-permission` khi Windows chưa có runner cách ly.** Bác bỏ ở đợt ship đầu: `dsh-permission-presets` bắt buộc phải có `ctx.shell.sandboxMode`, và sẽ fail loud khi load trên executor không hạn chế. Runner ACL về sau đã xóa bỏ tiền đề đó, nên bảng kê hiện tại giữ lại hai dòng này.

**Giữ lại giới hạn quy tắc đường dẫn fs khi Windows chưa có runner ở tầng OS.** Bác bỏ ở đợt ship đầu: shell không hạn chế có thể lách qua các quy tắc đường dẫn chỉ áp cho fs. Runner ACL hiện tại ràng buộc cả shell lẫn provider fs bằng cùng một policy, nên nửa ranh giới bị bác bỏ này không còn là hình thái được ship hiện nay.

**Ship một biến môi trường thoát hiểm `DSH_WINDOWS_SHELL`.** Bác bỏ: những thay đổi hành vi mang tính quyết định nên tập trung trong config tổ hợp, và config tổ hợp đã có thể ghi đè tầng nền tảng theo id của dòng; kênh ghi đè thứ hai sẽ chia tách nguồn sự thật duy nhất cho các quyết định về bảng kê.

## Hệ quả

- Máy chủ Windows chạy các bề mặt `dsh` được ship nhận được `pwsh` hạn chế làm tool shell và PowerShell làm executor `ctx.shell` mà không cần cấu hình gì; bảng kê mà model nhìn thấy ở đó không có `bash`. Trên bề mặt Web, dòng tool shell đến từ preset của session (note [nội suy `disabled` của loader](../architecture/2026-08-11-loader-entry-disabled-interpolation.md) sở hữu cơ chế one-plane): mỗi preset được ship khai báo `tool-pwsh` (kiểm soát bằng `process.platform !== 'win32'`) và dòng sinh đôi `tool-bash` (biểu thức đảo ngược), nên tầng preset phơi ra đúng một tool shell trên mỗi máy chủ.
- Lệnh Windows và thao tác fs dùng chung policy sandbox, bộ chuyển quyền và service approval. Runner ACL giới hạn ghi, nhưng báo cáo `enforcement: 'partial'`; `danger-full-access` tường minh vẫn là cách lách được phê chuẩn, chứ không phải mặc định của nền tảng.
- Máy chủ POSIX vẫn gắn stack bash như thường; các dòng pwsh ở trạng thái tắt theo biểu thức kiểm soát của chính chúng — cùng một file patch dùng chung liệt kê cả hai stack, mỗi dòng tự quyết định việc gắn.
- Máy chủ Windows muốn dùng stack bash (ví dụ khi có WSL/Git-Bash trên PATH) thì ghi đè các dòng được ship qua `cordis.patch.yml` ở profile hoặc ở home — tắt `pwsh-sandbox`/`tool-pwsh` và bật lại `bash-sandbox`/`tool-bash` (hai executor cùng đăng ký một service `bash`, công thức không đầy đủ sẽ fail loud lúc load) — config tổ hợp là kênh ghi đè duy nhất.

## Kiểm chứng

- Unit: `apps/cli/tests/windows-shell.spec.ts` tổ hợp các tầng bundle thực sự được ship (dsh-base + dsh-web-app phân giải từ bản cài của ứng dụng) bằng chính thuật toán patch mà quá trình khởi động dùng, cố định bảng kê hiệu lực cho từng nền tảng — bảng kê pwsh trên win32, bảng kê bash trên POSIX và profile base-only — cộng thêm phần kiểm soát tool shell ở cấp preset (`tool-bash`/`tool-pwsh`) và bao đóng phân giải lúc khởi động nguội; `packages/bundle/base/tests/base.spec.ts` cố định phần kiểm soát nền tảng `!!js` đối xứng của bốn dòng shell, và khẳng định không còn ship patch nền tảng riêng biệt.
- Keyless: `dsh --profile <name> --dump-config` hiển thị cả hai stack trong cùng một tầng patch dùng chung, mỗi dòng tự quyết định bảng kê lúc gắn bằng biểu thức `disabled` của chính nó.
- Smoke tổ hợp thực khởi động profile web trên win32 và stack pwsh gắn thành công (đúng bảng kê mà note này mô tả).
