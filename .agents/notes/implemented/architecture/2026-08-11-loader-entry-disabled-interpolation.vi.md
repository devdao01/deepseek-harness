# Agent Note: Loader nội suy trường `disabled` của entry

Status: implemented

[English](2026-08-11-loader-entry-disabled-interpolation.md) | Tiếng Việt

## Vấn đề

Lớp nền tảng Windows (lúc đó là `windows.cordis.patch.yml` độc lập nằm cạnh base patch, nay đã gộp vào row của base — xem "Quyết định") tắt `tool-bash` trên win32, nhưng các preset được ship lại mount riêng một row `tool-bash`. Row của preset được tổ hợp sau cùng, row trùng tên đã bật lại công cụ đó trên Windows — session đồng thời có cả `tool-bash` (backend PowerShell) lẫn `tool-pwsh`, và điều đó diễn ra âm thầm vì không có spec nào pin lớp preset sau khi tổ hợp. Metadata của entry không có cơ chế điều kiện: `!!js` chỉ được nội suy dưới `config` của plugin, [postmortem 0002](../../../../docs/postmortem/0002-js-expression-disabled-filesystem-tools.md) đã ghi lại sự cố `disabled: !!js ...` giữ nguyên object biểu thức luôn truthy, khiến row đó bị tắt trên mọi nền tảng.

## Quyết định

Loader nội suy trường `disabled` của entry (`vendor/loader/src/config/entry.ts`): biểu thức `!!js` được đánh giá dựa trên context của loader tại mỗi lần quyết định mount. `disabled` là trường metadata duy nhất được nội suy; `id`, `name`, `group`, `inject` vẫn tĩnh. Node gốc được giữ lại trong options, khi ghi lại vẫn ở dạng `!!js`. Các preset được ship (standard, code, cordis) tự khai báo row công cụ shell của mình và gác theo nền tảng — `tool-bash` mang `disabled: !!js process.platform === 'win32'`, row song sinh `tool-pwsh` mang biểu thức phủ định — nhờ vậy lớp preset trên mỗi host phơi bày đúng một công cụ shell; overlay web-app tắt row host của cả hai công cụ, để preset của từng session quyết định. `verify-cordis-config` giờ chỉ cho phép biểu thức trong `disabled`.

Cơ chế này hoàn thiện việc gộp lớp nền tảng: `cordis.patch.yml` của base bundle gác hai stack shell theo nền tảng ngay trên row của chính nó — `bash-sandbox`/`tool-bash` mang `disabled: !!js process.platform === 'win32'`, còn row song sinh `pwsh-sandbox`/`tool-pwsh` mang biểu thức phủ định nên chỉ mount trên win32. Lớp nền tảng Windows độc lập của bộ khởi động (`windows.cordis.patch.yml` cùng `apps/cli/src/windows-shell.ts` và phần logic nó tiêm vào boot, tái tổ hợp live, config dump) bị xóa — lớp đó chỉ tồn tại vì metadata của entry vốn tĩnh; khi `disabled` nội suy được thì điều kiện rơi về đúng row mà nó chi phối.

## Phương án thay thế

**Trường `platform` khai báo trên row.** Tĩnh và kiểm tra được bằng cổng kiểm soát, nhưng nó là cơ chế tổ hợp thứ hai bên cạnh `!!js`, và nền tảng chỉ là điều kiện của ngày hôm nay.

**Overlay nền tảng ở cấp preset.** Bị bác: điều kiện nên thuộc về row mà nó chi phối — cùng nguyên tắc đó đã gộp lớp nền tảng Windows độc lập của bộ khởi động vào row của base.

## Hệ quả

Row có thể tự gác chính mình theo nền tảng hoặc môi trường; biểu thức sai sẽ thất bại lớn tiếng lúc khởi động. Các trường metadata còn lại vẫn giữ giá trị literal, cổng kiểm soát tiếp tục từ chối biểu thức ở đó — nguy cơ postmortem-0002 trên `disabled` được đóng lại bằng cách "đánh giá" chứ không phải "cấm". Việc chuyển đổi stack shell của Windows chuyển từ lớp patch do bộ khởi động tiêm vào sang chính row của base bundle: win32 mount stack pwsh bị giới hạn, POSIX mang row pwsh đã bị tắt, cùng một file patch phục vụ cả hai đội hình — cơ chế lớp trong note [Windows mặc định pwsh](../feature/2026-08-01-windows-pwsh-default.md) đã bị thay thế. Row công cụ shell tuân theo cùng quy tắc one-plane như các row khai báo khác của preset: overlay web-app tắt row `tool-bash`/`tool-pwsh` ở mặt host, preset khai báo cả hai với cổng nền tảng nghịch đảo nhau, nhờ vậy mỗi session trên bất kỳ host nào cũng có thể bỏ đi hoặc thay thế công cụ shell theo preset. Stack PTY win32 còn thiếu ở preset `minimal` là phần việc tiếp theo của metadata preset.
