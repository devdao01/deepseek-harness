# Agent Note: San bằng danh sách công cụ được giao

Status: implemented

[English](2026-07-31-even-out-shipped-tool-rosters.md) | Tiếng Việt

## Vấn đề

Hai surface `dsh` được giao lại cung cấp những công cụ khác nhau, mà không có bất kỳ ghi chép nào giải thích vì sao. Checkpoint phiên, cắt gọt kết quả công cụ, công cụ goal và Ralph nằm trong `tui.cordis.yml`; `tool-todo` cùng web search về sau nằm trong `web.cordis.yml`. Cả hai surface đều không có tìm kiếm phiên, trình soạn thảo thay thế chuỗi và lớp bảo vệ công cụ lặp, dù cả ba đều đã tồn tại dưới dạng gói và không cái nào là đặc thù cho một surface.

Kết quả là một khác biệt hữu hình với người dùng mà chưa ai từng ra quyết định: cùng một mô hình, cùng một request, trên terminal thì đặt được mục tiêu còn trong trình duyệt thì không, trong trình duyệt thì tìm được web còn trên terminal thì không.

## Quyết định

Những dòng không đặc thù surface được chuyển vào [`base.cordis.yml`](../../../../packages/bundle/base/cordis.patch.yml), cùng với ba dòng thêm mới: `tool-session-query`, `tool-str-replace-editor` và `repeat-tool-reminder`. Web search cũng chuyển vào theo; [quyết định triển khai](2026-07-31-web-default-search.md) của nó phụ trách ranh giới an toàn, còn base dùng chung phụ trách việc gắn không phụ thuộc surface. Hai surface lắp ráp cùng một danh sách, trong đó `glob` và `grep` là thành viên cố định, vì `dsh-tool-fs-search` spawn thẳng [nhị phân ripgrep được đóng gói](../architecture/2026-08-01-packaged-ripgrep-search.md). Về sau có hai quyết định thu hẹp danh sách này: [quyết định session-search](2026-08-02-session-search-not-shipped-default.md) giữ `tool-session-query` ở trạng thái phải bật tường minh, và [quyết định trình soạn thảo duy nhất](../simplification/2026-08-10-default-presets-single-editor.md) khiến preset thông dụng không cung cấp `tool-str-replace-editor`, nhưng vẫn giữ nó trong `minimal`.

Có hai dòng vẫn đặc thù surface. `tmux-context` chỉ có ở TUI, vì surface trình duyệt không có bộ ghép kênh terminal nào để mô tả. `session-reference` chỉ có ở TUI, vì nó dùng đường dẫn cục bộ theo tiến trình của launcher để điều khiển chỉ mục session-query dùng chung, còn thanh bên trình duyệt sẽ dựng lại chỉ mục đó ngay trong lần tìm kiếm đầu tiên của chính nó.

**Quyết định danh sách công cụ lần này khi đó chỉ có phép cộng.** Lúc đáp xuống, không surface nào bị gỡ bỏ dòng công cụ nào, và so sánh mục lục chỉ tìm thấy phần thêm mới, ngoài ra không có gì khác. Các quyết định session-search và trình soạn thảo duy nhất về sau lần lượt phụ trách những ngoại lệ tương ứng trong danh sách mặc định. Bộ thực thi dùng chung, tổ hợp sandbox và giá trị truy cập mặc định thuộc về [quyết định workspace-write mặc định](2026-07-31-workspace-write-surface-default.md) một cách độc lập.

### Những gì không được gắn, và vì sao

Có ba năng lực nằm ngoài dựa trên bằng chứng ghi trong chính gói của chúng, liệt kê ở đây để giữ cho «chúng tôi quên» và «chúng tôi quyết định không» phân biệt được với nhau.

**`dsh-tool-cordis`** cho phép mô hình viết một đoạn JavaScript rồi gắn thành plugin tạm thời. README của nó ghi rõ giới hạn này: «The sandbox is containment for honest code, not a security boundary — host-realm helpers on the sandbox global are reachable, so mount code can reach Node» ([Known limitations](../../../../packages/extensions/tool-cordis/README.md)). Realm của `node:vm` nằm ngay trong tiến trình harness, còn `dsh-sandbox-local` chỉ ràng buộc argv mà nó spawn ra, do đó trên surface Web, sandbox và seam phê duyệt bị vòng qua chứ không được thi hành.

**`dsh-web-fetch-http`** không được gắn, và `dsh-tool-web` giữ `fetch: false`. Phòng vệ SSRF trong bản hiện thực đang ở trạng thái deferred ([`policy.ts`](../../../../packages/web/web-fetch-http/src/policy.ts) chỉ kiểm giao thức, thông tin xác thực và độ dài), và gói cũng nói thẳng: «this provider is an SSRF primitive and **must not be enabled** in a deployment that can reach sensitive internal network targets» ([README](../../../../packages/web/web-fetch-http/README.md)). Đích đến do mô hình chọn, trong đó có cả gateway của chính harness đang chạy trên địa chỉ loopback, các dải mạng nội bộ và endpoint metadata của cloud.

Không gắn nó thu hẹp diện tiếp xúc chứ không thu hẹp khả năng đến được: `bash` vẫn được gắn, `curl` vẫn lấy được đúng trang đó — một lần chạy thật đã xác nhận điều này. Sự vắng mặt này mua được việc bỏ đi một nguyên thủy request không cần shell, định hình bằng tham số, cùng con đường bất ngờ đi kèm: một câu «tóm tắt giúp tôi trang này» lặng lẽ gõ vào địa chỉ loopback. Bản triển khai thực sự muốn kìm lưu lượng đi ra thì cần kiểm soát ở tầng mạng.

**Bộ ba LSP** ở ngoài vì lý do vận hành chứ không phải an toàn: `command` được phân giải từ `PATH` lúc nạp plugin, nên thiếu language server sẽ làm hỏng cả lần khởi động, chứ không chỉ mất một công cụ. Đợi tới khi «thiếu» thoái hóa thành «bỏ qua đăng ký» thì nó có thể được gắn.

### MCP là một phụ thuộc, không phải một dòng cấu hình

`@deepseek-ai/dsh-mcp-client` trở thành phụ thuộc lúc chạy của CLI (giao diện dòng lệnh) này, nhưng không có dòng tương ứng trong bất kỳ cấu hình được giao nào. Mỗi thể hiện của plugin đó chỉ gắn một server, và `command` là bắt buộc, nên một giá trị mặc định sẽ phải nêu đích danh một server bên thứ ba, rồi spawn nó thành tiến trình con ở mỗi lần khởi động — không qua `ctx.shell`, tức là cũng nằm ngoài chính sách sandbox mà surface Web tổ hợp ra.

Tầng thực sự khiến MCP trở thành mặc định được lại chính là thứ kho mã này chưa có: một cầu nối đọc danh sách server của người dùng rồi gắn client theo từng mục, hình thái giống hệt cách [`dsh-hooks-claude-code`](../../../../packages/hooks/hooks-claude-code/README.md) đọc `hooks.json` của Claude Code. Việc giao phụ thuộc này nghĩa là `dsh` đã cài hôm nay đã có thể gắn server từ `$DSH_HOME/config.yaml`; README của CLI có sẵn đoạn YAML đó.

## Kiểm thử

`apps/cli/tests/shipped-composition.e2e.ts` từng khởi động cây được giao qua Loader thật trong một pseudo-terminal, và đọc tên công cụ ra từ `request/header` được lưu bền trong nhật ký phiên, do đó cái nó khẳng định chính là mục lục mà mô hình thực sự nhận được. Overlay `--config` mà nó truyền vào, `composition-keyless-tail.cordis.yml`, chỉ dùng để cô lập kiểm thử: một adapter không mạng, cùng các sản phẩm phiên nằm trong workspace.

Phần đuôi đó còn từng chèn `composition-settled.ts`, dùng để tuyên bố trên luồng byte của terminal rằng việc kích hoạt Loader đã settle. TUI render ngay khi fiber của nó khởi động, nên prompt gõ vào ở màn banner có thể tới vòng lặp trong lúc dòng công cụ và lớp lưu bền vẫn đang kích hoạt, từ đó lắp ráp ra một mục lục không đầy đủ; việc gate prompt đầu tiên của bài smoke vào dấu hiệu đó chính là lý do khẳng định trở nên tất định.

Cùng bài smoke ấy cũng ghim tư thế thực thi của TUI dựa trên cùng bộ sản phẩm. Những khẳng định về schema sandbox và quyền ban đầu thuộc về [quyết định workspace-write mặc định](2026-07-31-workspace-write-surface-default.md), độc lập với quyết định danh sách công cụ này.

[`apps/web/tests/shipped-composition.e2e.ts`](../../../../apps/web/tests/shipped-composition.e2e.ts) phủ surface Web trong làn dùng sản phẩm build, khẳng định mục lục công cụ của nó, khẳng định các giá trị truy cập mặc định của nó không bị đụng vào, và khẳng định gốc ghi được của `workspace-write` có bao gồm thư mục tạm — một cái bẫy khiến kiểm thử sandbox nói dối khi workspace nằm dưới `/tmp` ([`roots.ts`](../../../../packages/sandbox/sandbox/src/roots.ts)).

`glob` và `grep` được khẳng định như thành viên cố định, chứ không phải một cặp phụ thuộc vào máy chủ: `dsh-tool-fs-search` spawn nhị phân ripgrep được đóng gói và đăng ký vô điều kiện cả hai công cụ, nên cặp này luôn có mặt.

Ngoài kiểm thử trong kho, cả hai surface đều đã được chạy bằng plain Node từ sản phẩm build `apps/cli/lib/bin.js` với khóa thật. Mọi công cụ đã gắn đều thực thi thành công, kể cả `ralph` và `web_search`; mô hình chưa bao giờ chạm tới `cordis_*` hay `mcp_*`, khi được yêu cầu nhảy LSP thì thoái về `grep`, khi được yêu cầu mở terminal bền vững thì dùng tác vụ `bash` chạy nền.

## Các phương án đã cân nhắc

**Sao chép các dòng dùng chung vào cả hai overlay, thay vì nâng lên base.** Bị bác theo nguyên tắc «một nơi sở hữu»: trong số các dòng mới có ba dòng sẽ tồn tại hai bản, mà những bản sao đó không có lý do gì để phân kỳ, lần sửa danh sách công cụ tiếp theo lại phải nhớ sửa hai chỗ.

**Thêm sandbox cho TUI trong cùng một thay đổi.** Không áp dụng, vì đây là một quyết định riêng không thuộc thay đổi danh sách công cụ: TUI gắn bộ thực thi không bị ràng buộc, thay chúng đi sẽ đổi việc một surface đang có *làm gì*, chứ không phải nó *cung cấp gì*. Quyết định đó cần bằng chứng riêng — nhất là vì TUI không có bên đáp `approval/request`, nên yêu cầu nâng quyền ở đó sẽ fail-closed chứ không bật lời nhắc.

**Bật Code Mode.** Lập trường tin cậy của nó theo thiết kế ngang hàng bash, lời gọi công cụ phải qua cùng cổng `tools/pre-execute` như bash, nên nó không cùng một phán định với những công cụ để mô hình viết mã ở trên. Ở đây nó vẫn bị bác: `both` sẽ thay đổi mọi request mà mô hình nhìn thấy trên cả hai surface, còn `code` là thay thế đường dây chứ không phải thêm một đường — cả hai đều là quyết định về cách trình bày, không phải quyết định về danh sách công cụ.

**Gắn sẵn một MCP server làm mặc định.** Bị bác, vì giá trị mặc định được giao buộc phải nêu đích danh một server, mà lựa chọn nào cũng sẽ spawn một tiến trình con bên thứ ba trên máy của mọi người dùng, ở ngoài sandbox. Thay vào đó là giao phụ thuộc.

## Hệ quả

Cùng một mô hình nhận được cùng bộ công cụ trên cả hai surface, khác biệt không có lý do ghi chép kia biến mất. Kiểm thử khẳng định chính xác hai mươi cái tên được cung cấp vô điều kiện, và ghim `glob` cùng `grep` như thành viên cố định ở cả hai bên, nên về sau nếu chỉ sửa một surface thì kiểm tra sẽ hỏng chứ không lặng lẽ phát đi; [quyết định session-search-not-shipped-default](2026-08-02-session-search-not-shipped-default.md) chính là một thay đổi kiểu đó về sau, và hai bài kiểm thử cũng dời theo.

`apps/cli` tăng thêm năm phụ thuộc workspace: bốn cái là những thứ cây được giao khi đó có gắn, cộng `dsh-mcp-client` — nó không được gắn, tồn tại là để `dsh` đã cài có thể gắn. Bốn cái đã được giữ lại — [quyết định session-search-not-shipped-default](2026-08-02-session-search-not-shipped-default.md) đã gỡ `@deepseek-ai/dsh-tool-session-query` cùng với dòng của nó.

Chính sách thực thi độc lập với danh sách công cụ. [Quyết định workspace-write dùng chung](2026-07-31-workspace-write-surface-default.md) sở hữu bộ thực thi sandbox và quyền mặc định của cả hai surface; thay đổi chính sách đó không thêm hay bớt công cụ nào.
