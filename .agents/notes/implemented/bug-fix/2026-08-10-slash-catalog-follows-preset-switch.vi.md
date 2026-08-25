# Agent Note: Danh mục slash theo kịp việc chuyển preset của phiên trống

Status: implemented

[English](2026-08-10-slash-catalog-follows-preset-switch.md) | 中文

## Vấn đề

Preset đã chuyển đi những hàng vi quyết định nội dung menu `/`. Bản lắp ráp Web đã tắt `skill-filesystem`, `tool-skill`, `plan-mode` và `command-compact` ở mặt phẳng host, thay vào đó do preset cung cấp, nên một phiên có những lệnh và kỹ năng nào là thuộc tính của thành phần cấu tạo của chính nó, chứ không phải thuộc tính của deployment.

Cả hai danh mục ở phía trình duyệt đều được cache theo phiên — `CommandDirectory` của `dsh-client-ui-commands`, bảng fetch single-flight của `dsh-client-ui-skill` — và composer đã prewarm chúng ngay lúc scope được sinh ra, theo đúng preset tại thời điểm phiên được tạo. Sau đó chip trên hero cho phép người dùng tái tổ chức (recompose) phiên vẫn còn trống này, nhưng cả hai cache đều không có cạnh invalidation tương ứng: `commands/change` là ở cấp registry, `connection/reset` cần kết nối lại. `agentPresets.recompose` chỉ gắn lại scope của agent vào một standing mount có thể đã tồn tại sẵn, không tạo ra bất kỳ đăng ký nào, nên tín hiệu cấp registry vĩnh viễn không kích hoạt cho nó.

Vì vậy menu tiếp tục cung cấp đúng thành phần cấu tạo mà phiên đó không còn chạy nữa. Sau khi chuyển xuống, `compact`, `plan` và toàn bộ kỹ năng dự án vẫn nằm trong menu; sau khi chuyển lên, cái còn lại là một danh mục hẹp hơn — bốn hàng ở mặt phẳng host cộng đóng góp `model` của chính client — và hoàn toàn không có kỹ năng nào, đây chính là hiện tượng được mô tả trong báo cáo bug. Chỉ khi có một thay đổi registry không liên quan hoặc một lần kết nối lại tình cờ khiến nó invalidate thì danh mục mới tự phục hồi.

## Quyết định

Điểm commit của lần chuyển này là sự kiện `agent-preset/selected` đã được ghi vào ledger. Preset owner phát lại lần commit đó thành sự kiện cordis owner an toàn cho client là `agent-preset/selected(sessionId, agentPreset)`, luồng host chuyển tiếp nguyên vẹn, cả hai danh mục đăng ký trực tiếp thông qua `ctx.remote.$on`: `ui-commands` refresh mềm key đó (snapshot mới chưa kịp xuống thì snapshot cũ vẫn tiếp tục phục vụ menu đang mở), `ui-skill` invalidate nó (và hủy việc prewarm đang diễn ra dở dang, để một lần warm chạy đua với việc chuyển không thể publish ra danh mục lỗi thời).

Sự kiện owner này có độ chi tiết theo từng phiên, không mang danh mục, chỉ mang id preset. `ui-agent-preset` gộp nó vào dòng phiên, vì biên nhận (receipt) của `agentPresets.select` chỉ đến đúng client đã khởi phát việc chuyển, còn nhãn ở header phiên lại dựa theo chính dòng này (chip trên hero cũng đọc từ đây khi so sánh lựa chọn kế tiếp).

Việc suy ra sự kiện owner từ sự kiện đã ghi vào ledger thay vì từ giá trị trả về của handler RPC khiến "thành phần cấu tạo của phiên này đã thay đổi" chỉ có đúng một nguồn có thẩm quyền: mọi client đã kết nối đều có thể quan sát được lần chuyển này, chứ không chỉ riêng tab đã khởi phát nó; các client không phải bên khởi phát cũng không cần phải suy đoán từ một tín hiệu registry vốn dĩ sẽ chẳng bao giờ đến.

## Các phương án thay thế đã cân nhắc

**Invalidate tại chỗ ngay trong callback `agentPresets.select` của chính client.** Đây là thay đổi nhỏ nhất, và sau vòng đầu tiên preset đã bị khóa lại, chip trên hero là nơi duy nhất có thể khởi phát việc chuyển. Bị bác bỏ vì logic invalidation sẽ nằm đúng ở giao diện tình cờ khởi phát RPC đó, chứ không phải ở điểm commit: cùng một phiên trống đó ở tab thứ hai vẫn là menu lỗi thời, và bất kỳ việc tái tổ chức nào từ phía host trong tương lai cũng hoàn toàn không có tín hiệu.

**Suy ra sự kiện client từ frame mux `session/event` sẵn có.** Sự kiện đã ghi vào ledger vốn đã được gửi tới mọi client đã đăng ký, không cần thêm kiểu giao thức mới. Bị bác bỏ vì sự phân tách face (mặt bề mặt): thu hẹp `event.type` xuống `agent-preset/selected` cần bổ sung `SessionEventMap`, mà việc nạp nó trong chương trình Client chỉ có hai cách — tham chiếu project `dsh-agent-presets`, việc đó sẽ kéo theo việc gộp `ctx.sessions` của host vào một chương trình cũng đang publish dịch vụ cùng tên; hoặc dùng một lần type assertion để lách qua discriminant.

**Tái dùng `commands/change` đã được chuyển tiếp.** Đây là sự kiện invalidation danh mục sẵn có, nhưng nó ở cấp registry, không mang phiên, cũng không liên quan đến kỹ năng; client sẽ phải fetch lại lệnh cho mỗi phiên, nhưng vẫn vĩnh viễn không refresh được danh mục kỹ năng.

## Hệ quả

Danh sách chuyển tiếp có thêm sự kiện đã định kiểu của preset owner, và mỗi danh mục do preset quyết định giờ đây có một điểm đăng ký thống nhất: bất kỳ giao diện theo-từng-phiên nào trong tương lai được suy ra từ thành phần cấu tạo sẽ invalidate trên cùng tín hiệu này, mà không cần phát minh thêm cái mới. Sự kiện owner vẫn là lần publish thứ hai của sự thật đã ghi vào ledger, nên trong tương lai nếu xuất hiện một đường chuyển đổi tái tổ chức mà không ghi vào ledger, nó sẽ không được ai công bố. `ui-commands` giữ invalidation mềm (menu đang mở không bị trống), còn `ui-skill` bỏ thẳng mục đó, vì danh mục kỹ năng không có trạng thái "phục vụ được một phần"; menu mở trong cửa sổ đang fetch lại sẽ thoáng hiển thị không có kỹ năng nào, thay vì hiển thị sai kỹ năng.

## Kiểm thử

`api-proxy-agent-preset.spec.ts` khẳng định lần chuyển đã commit được chuyển tiếp đúng một lần, kèm theo phiên và preset mới; spec của `ui-agent-preset`, `ui-commands` và `ui-skill` khẳng định việc đăng ký Remote trực tiếp sẽ gộp vào dòng phiên hoặc chỉ fetch lại đúng phiên đã được tái tổ chức. `agent-preset-selection` web e2e gieo một kỹ năng dự án, và sau khi chip trên hero áp dụng `minimal` sẽ khẳng định menu `/` mất `compact`, `plan` và kỹ năng đó, đồng thời giữ lại các hàng ở mặt phẳng host — đây là bằng chứng ứng dụng lắp ráp toàn bộ cho thấy panel theo kịp thành phần cấu tạo.

Cùng e2e đó cũng không còn đọc assertion staged-pick của nó từ danh sách phiên đã serialize nữa: phiên được gieo cũng ghi `minimal`, việc khớp substring sẽ pass ngay cả trước khi lần chuyển thực sự áp dụng. Giờ nó định vị đúng phiên đang hoạt động theo id.

## Liên quan

Việc lần chuyển thứ hai có đến được host hay không là một lỗi khác, có nguyên nhân và bản sửa riêng: [phán đoán định danh của dòng phiên](2026-08-10-session-row-identity-covers-the-preset.md). Trước khi bản sửa đó được áp dụng, `agent-preset-selection.e2e.ts` chỉ có thể diễn tập lần chuyển đầu tiên — cạnh invalidation ở đây không nhạy với chiều chuyển, nhưng lần chuyển mà nó phản ứng theo phải thực sự xảy ra.
