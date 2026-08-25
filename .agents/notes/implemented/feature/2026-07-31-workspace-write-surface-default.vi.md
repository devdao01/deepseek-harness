# Agent Note: Giá trị mặc định workspace-write cho các giao diện đã bàn giao

Status: implemented

[English](2026-07-31-workspace-write-surface-default.md) | 中文

## Vấn đề

Giao diện terminal và trình duyệt đã bàn giao phơi bày cùng các công cụ lập trình dưới hai bộ tổ hợp không ràng buộc khác nhau. Web mount dịch vụ sandbox và quyền hạn, nhưng lại chọn `danger-full-access`; còn TUI mount trực tiếp nhà cung cấp bash và hệ thống file cục bộ không giới hạn. Do đó, trước khi người dùng chủ động chọn loại quyền hạn này, một phiên lập trình hoàn toàn mới đã có thể sửa bất kỳ đường dẫn nào mà tiến trình cùng UID của nó có thể truy cập.

## Quyết định

[`base.cordis.yml`](../../../../packages/bundle/base/cordis.patch.yml) giữ chung một chồng sandbox và quyền hạn thống nhất cho tất cả TUI, Web đã bàn giao, cũng như các phiên headless được hậu thuẫn bởi trình duyệt: `dsh-sandbox-local`, `dsh-sandbox-policy`, `dsh-bash-sandbox`, `dsh-fs-sandbox`, `dsh-user-approval` và `dsh-permission-presets`. Giá trị fallback của bộ tổ hợp là preset `workspace-write`, bao gồm chế độ hiệu ứng file `workspace-write` và chính sách phê duyệt `ask`. `DSH_PERMISSION_MODE` vẫn là ghi đè rõ ràng ở cấp tiến trình; `permission.defaultPreset` đã lưu trữ vẫn là tùy chọn người dùng cho các phiên sau này, và được ưu tiên hơn giá trị fallback này thông qua seam Settings.

Một phiên thực sự mới sẽ ghim `permission/preset: workspace-write`, `sandbox/mode: workspace-write` và `approval/policy: ask` trước khi thực thi. Phiên hiện có và phiên đã khôi phục giữ nguyên quyền hạn được ghi trong log; thay đổi giá trị mặc định trong cài đặt "Chung" chỉ ảnh hưởng đến các phiên được tạo sau đó. Trình duyệt vẫn giữ bộ chọn Access, thẻ phê duyệt có thể trả lời, và xác nhận rủi ro khi chọn Full access. Dịch vụ Permission dùng chung kích hoạt component con lệnh của nó trong TUI, do đó TUI sẽ có được lệnh `/permission` hiện có.

Chế độ này chỉ quản lý hiệu ứng file. Sửa đổi bash và hệ thống file bị ràng buộc trong sandbox chỉ được phép ghi vào workspace của phiên và thư mục gốc tạm của nền tảng; đọc, truy cập mạng và khả năng nhìn thấy tiến trình vẫn không bị chính sách này ràng buộc. Nếu không có runner nền tảng nào có thể cưỡng chế lệnh gọi bash bị hạn chế, việc thực thi sẽ kết thúc bằng từ chối, không rơi về lệnh không giới hạn.

## Testing

Smoke test giả lập terminal (pseudo-terminal) không cần key của TUI đã bàn giao khởi động cây Loader thật, đọc yêu cầu đầu tiên đã lưu, và khẳng định `sandbox_permissions`/`justification` trong schema bash, cùng bộ ba sự kiện workspace-write ban đầu. Smoke test của bộ tổ hợp Web đã bàn giao khẳng định cùng chính sách, phê duyệt và giá trị mặc định Permission. Snapshot Settings trình duyệt đã lắp ráp mở lên với Workspace Write được chọn, giữ nguyên phiên `workspace-write` hiện có khi thay đổi giá trị mặc định cho phiên sau này, và vẫn xác minh đường chọn Full access sau khi xác nhận.

## Các phương án thay thế đã cân nhắc

**Giữ chồng sandbox trong `web.cordis.yml`, và sao chép một bản trong `tui.cordis.yml`.** Không áp dụng, vì id plugin, preset, giá trị fallback và việc thay thế executor hoàn toàn giống nhau. Hai bản sao sẽ khiến giá trị mặc định an toàn phụ thuộc vào việc đồng bộ liên tục hai overlay giao diện; base dùng chung mới là nơi thuộc về duy nhất của chúng.

**Giữ TUI không giới hạn, chỉ thay đổi giá trị fallback của trình duyệt.** Không áp dụng, vì cách này giữ lại sự khác biệt vô lý giữa các giao diện, và khiến phiên terminal hoàn toàn mới tiếp tục có quyền hạn mà quyết định này muốn loại bỏ.

**Thêm hộp thoại phê duyệt terminal trong cùng thay đổi này.** Không áp dụng, vì đây là một quyết định tương tác và vòng đời khác. TUI không có bên trả lời `approval/request`, do đó việc tự động nâng quyền một lần hiện sẽ kết thúc bằng không khả dụng và bị từ chối; người dùng cần quyền rộng hơn có thể chủ động chọn preset khác qua `/permission`.

## Hệ quả

Phiên hoàn toàn mới có thể sửa workspace hiện tại và thư mục gốc tạm mà không cần lời nhắc bổ sung, còn nếu thử sửa vị trí khác sẽ bị từ chối trước khi chạm tới mục tiêu. Full access vẫn có thể đạt được thông qua lựa chọn rõ ràng, và trình duyệt vẫn hiển thị hộp thoại xác nhận khi chọn. Hệ thống không ghi đè giá trị mặc định người dùng đã lưu, cũng như quyền hạn đã ghi trong log phiên.

Điểm vào headless được hậu thuẫn bởi trình duyệt kế thừa bộ tổ hợp Web, do đó có cùng giá trị mặc định. Việc TUI thiếu bên trả lời phê duyệt là hạn chế rõ ràng của thay đổi lần này: các lần retry tự động yêu cầu quyền rộng hơn sẽ kết thúc bằng từ chối ở đó, chứ không hiển thị hỏi quyền.
