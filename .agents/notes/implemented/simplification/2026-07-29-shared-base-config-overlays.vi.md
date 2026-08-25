# Agent Note: Một cấu hình base dùng chung cộng overlay cho từng surface

Status: implemented

[English](2026-07-29-shared-base-config-overlays.md) | Tiếng Việt

## Vấn đề

`dsh` giao hai cây cấu hình hoàn chỉnh, trong đó có 43 mục cấu hình dùng chung. `apps/cli/cordis.yml` ghép surface web bằng 74 mục cấu hình dàn phẳng, còn TUI thì khởi động `examples/tui-agent/cordis.yml` — nơi một dòng `@deepseek-ai/dsh-tui-demo` duy nhất gắn mười hai plugin và khai báo lại cấu hình của chúng thành một `Config` gồm hai mươi khóa chỉ để truyền xuyên qua.

Cả hai tệp đều mang tên không đúng bản chất. `examples/tui-agent` không phải một ví dụ: `apps/cli/src/tui.ts` hardcode nó làm cấu hình mặc định của sản phẩm; nó còn sở hữu bài kiểm thử khói PTY của TUI, tám kịch bản ảnh chụp terminal, và bộ harness PTY được nút lá `cordis-agent` import. `dsh-tui-demo` cũng không phải demo — nó chính là ứng dụng, được nhị phân bàn giao gắn từ `packages/examples/`.

Vấn đề mang tính quyết định thực sự là sự trùng lặp. Trong 43 mục cấu hình dùng chung, 38 mục giống nhau từng byte, 5 mục khác nhau vì lý do chính đáng của từng surface; vì thế mỗi thay đổi năng lực đều phải sửa ở hai nơi, và có thể trôi dạt trong im lặng. Gói ghép đó còn đảo ngược một giá trị mặc định: `composeTuiApp` đọc `config.goals ?? {}`, nên TUI được bàn giao lại gắn goals, `tool-goal`, `goal-round-driver` và `/goal` — mặc dù không có khóa cấu hình nào yêu cầu chúng.

## Quyết định

Một base dùng chung, mỗi surface một overlay, được ghép dưới dạng danh sách patch ngang hàng.

`apps/cli/config/base.cordis.yml` giữ 43 mục cấu hình mà cả hai surface đều gắn. `apps/cli/config/tui.cordis.yml` và `apps/cli/config/web.cordis.yml` là **danh sách patch**, không phải cây cấu hình: mỗi tệp khai báo một số ít mục cấu hình có giá trị khác nhau theo surface, và insert các mục cấu hình của riêng mình. Bộ khởi động chỉ include base một lần, và áp dụng mỗi overlay như một danh sách patch ngang hàng ở **cùng** tầng include — bởi vì patch của include không vượt qua ranh giới include, nên xếp chồng overlay thành include lồng nhau sẽ khiến chúng im lặng không chạm được tới các mục cấu hình của base.

Thứ tự ưu tiên chính là thứ tự trong danh sách, xét theo từng mục cấu hình và bên ghi sau thắng: base, rồi đến overlay của surface, tiếp đến là overlay `--config` hoặc `~/.dsh/config.yaml` cá nhân, cuối cùng là flag và patch profile của chính bộ khởi động.

`--config <path>` giờ áp dụng một overlay để **thay thế** overlay cá nhân, nên cây dùng cho demo hay kiểm thử không bao giờ kế thừa nhà cung cấp và model của người dùng. Còn `--config-replace <path>` thì khởi động một tệp nào đó với tư cách toàn bộ cây, đồng thời bỏ qua base, overlay surface và overlay cá nhân; đây đúng là hành vi của `--config` cũ, nên những cây như `examples/web-cordis` đã chuyển sang dùng flag mới. Cả hai flag đều được giữ lại trong lần bàn giao execve của `/resume`, nếu không thì khi khôi phục sẽ âm thầm đổi mất agent (tác tử).

Patch thay thế toàn bộ `config` của mục cấu hình đích chứ không hợp nhất. Vì vậy, mục cấu hình có giá trị khác nhau theo surface sẽ nằm trong overlay, không bao giờ nằm trong base, nhờ đó không mục cấu hình nào bị cả ba tầng cùng patch. Định danh phiên về căn bản không thể truyền qua khóa cấu hình — nó đã chuyển sang `CONFIGURED_AGENT_IDENTITIES_KEY` của `dsh-agent-loop`, đúng như ghi chép về việc bộ khởi động nắm giữ định danh mô tả.

`examples/tui-agent`, `examples/cordis-agent`, `examples/code-mode` và `packages/examples/tui-demo` đều bị xóa. Bài test TUI chuyển sang `apps/cli/tests/`, phần e2e của bộ công cụ cordis chuyển vào `packages/extensions/tool-cordis/tests/`, còn demo Code Mode được hỗ trợ thì giữ lại dưới dạng overlay ACP (Agent Client Protocol) trong `examples/acp-agent/code-mode.cordis.yml`.

## Phương án thay thế

**Giữ hai cây dàn phẳng và trùng lặp.** Bác bỏ: bảo trì 43 mục cấu hình ở hai bản chính là khiếm khuyết cần khắc phục, còn dùng một cổng kiểm tra để khẳng định hai bên luôn khớp nhau chỉ càng cố định hóa sự trùng lặp chứ không loại bỏ nó.

**Lồng các overlay thành include (`code-mode` → `tui` → `base`).** Bác bỏ sau khi thử nghiệm thực tế với Loader: patch không vượt qua ranh giới include, nên patch của tệp ở lớp ngoài chỉ bị loại bỏ kèm một cảnh báo. Chuỗi ba tầng khiến `tools` không thể được patch, và base nằm sau một tầng include sẽ biến mọi patch cá nhân thành thao tác rỗng trong im lặng.

**Đưa hợp của tất cả mục cấu hình vào base, để mỗi overlay tắt phần mình không cần.** Bác bỏ: base sẽ không còn mang nghĩa "dùng chung", và mỗi surface phải mang theo những mục cấu hình chỉ tồn tại để bị tắt đi.

**Giữ các mục cấu hình khác nhau theo surface trong base, để overlay patch chúng.** Chỉ áp dụng cho đúng năm mục cấu hình bắt buộc phải có mặt trong cả hai cây, vì patch không thể tạo mục cấu hình. Mục của chúng trong base mang tên plugin và phần cấu hình mà hai surface dùng chung, phần còn lại do từng overlay khai báo.

## Ảnh hưởng

Overlay hoặc cây `--config` gọi đích danh `@deepseek-ai/dsh-tui-demo` hay patch mục cấu hình `tui-agent` sẽ không còn phân giải được. Overlay giờ phải patch đúng dòng sở hữu khóa tương ứng: định tuyến model ở `agent-loop`, nhân cách ở `system-prompt`, thiết lập trình bày ở `tui`.

Nếu `id` của một patch không khớp mục cấu hình nào, nó vẫn là thao tác rỗng chứ không báo lỗi. Đây là chủ ý: cùng một overlay cá nhân được dùng chung giữa các surface, và mục cấu hình `insert` theo thiết kế vốn không khớp mục tiêu nào, nên mục cấu hình chỉ tồn tại dưới `web` không được phép làm TUI khởi động thất bại.

`dsh web` bổ sung `--config`, truyền vào `AppCLIEntry` dưới dạng một overlay bổ sung. Web giữ lại Bash và nhà cung cấp hệ thống tệp chạy trong sandbox, cùng phần phê duyệt, preset quyền, chọn thư mục và giao diện quyền của trình duyệt; lớp phủ sẽ tắt nhà cung cấp cục bộ dùng chung, vì patch có thể tắt mục nhưng không thể xóa mục. Chỉ mục truy vấn của TUI dùng cơ sở dữ liệu tạm riêng cho từng tiến trình, vì backend SQLite yêu cầu quyền sở hữu một-người-ghi. Chỉ mục này là dữ liệu dẫn xuất có thể vứt bỏ, được dựng lại theo từng tiến trình; `/resume` liệt kê trực tiếp kho ngữ liệu bên dưới, không dựa vào việc tái dùng chỉ mục. `AppCLIEntry` đọc cả base lẫn overlay surface của nó khi hợp nhất giá trị mặc định của mục cấu hình khôi phục cho patch của chính mình, vì việc flag ghi đè phải giữ lại các trường khác của overlay trên cùng mục cấu hình đó.

## Kiểm chứng

Tính đúng đắn của việc ghép được đối chiếu bằng cách khởi động từng cây với Loader thật và kiểm tra các mục đã sẵn sàng, chứ không phải bằng cách đọc YAML: cả hai giao diện đều sẵn sàng hoàn toàn, không có mục nào chưa nạp; Web khởi động `httpServer` với Bash và nhà cung cấp hệ thống tệp chạy trong sandbox. Code Mode tiếp tục được overlay ACP và ảnh chụp TUI theo chương trình bao phủ, thay vì phải duy trì một ứng dụng TUI bàn giao riêng.

Toàn bộ tám kịch bản ảnh chụp terminal phát lại khớp từng byte sau khi di chuyển, 14 ca kiểm thử khói PTY đều đạt, trong đó hai ca khẳng định overlay cá nhân chạm được tới một mục cấu hình được **insert vào** — đây chính là hành vi mà bản sửa `plugin-include` được vendored mở ra ([`vendor/README.md`](../../../../vendor/README.md), sửa đổi cục bộ mục 8, được `packages/boot/app-boot/tests/config-reload.spec.ts` bao phủ).

Quá trình dàn phẳng làm lộ ba khiếm khuyết tiềm ẩn, tất cả đều được sửa luôn trong lần này: TUI từng bắt dịch vụ `sessionQuery` tùy chọn một lần duy nhất lúc khởi tạo, nên khi thắng trong cuộc tranh chấp gắn plugin thì `/resume` bị vô hiệu vĩnh viễn; thư mục gốc của kho lưu phiên được bàn giao từng âm thầm lùi về `./.sessions` cục bộ trong dự án; và `--config-replace` từng bị loại bỏ trong lần bàn giao khi khôi phục.
