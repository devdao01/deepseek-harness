# Agent Note: Mô hình mặc định đi theo bộ chọn

Status: implemented

[English](2026-08-07-default-model-follows-the-picker.md) | Tiếng Việt

## Vấn đề

Bộ chọn mô hình của phiên và giá trị mặc định của bản triển khai là hai tầng của cùng một tuỳ chọn. Nếu bộ chọn chỉ ảnh hưởng tới phiên chứa nó, phiên trắng kế tiếp có thể chọn mô hình khác, còn người dùng lại không có cách nào làm cho giá trị mặc định khớp với bộ chọn. Nếu giá trị mặc định nằm bên trong Host gateway, thì lối vào tạo Agent trực tiếp chỉ có thể chia sẻ nó bằng cách phụ thuộc vào Host hoặc nhân bản trạng thái.

Cường độ suy luận khiến hình thái lưu bền trở nên quan trọng: một lựa chọn mô hình không kèm cường độ phải xoá cường độ đã lưu, nếu không Agent kế tiếp có thể dùng một cường độ mà mô hình được chọn không chấp nhận.

## Quyết định

`AgentDefaultModelConfig` cung cấp `ctx.agentDefaultModel` và đăng ký `{provider, model, reasoningEffort?}` thành mục Settings `agent-default-model`. Mục cấu hình tổ hợp `{provider, model}` của nó là tầng base, còn `settings.yaml` cung cấp tầng người dùng. Service này không thiên vị lối vào nào, nên việc tạo trực tiếp và việc tạo thông qua ApiProxy dùng chung một giá trị mặc định ([lối vào core trực tiếp cho headless](../architecture/2026-08-09-headless-direct-core-entry-point.md)).

`reasoningEffort` thuộc mục Settings, nhưng không thuộc cấu hình plugin. Các tầng Settings hợp nhất theo từng trường, nên cường độ đã cấu hình sẽ tiếp tục tồn tại khi người dùng chọn bỏ qua nó. `saveSelection()` ghi trọn vẹn mục của người dùng; do đó, thiếu trường này sẽ xoá cường độ đã lưu. Giá trị mặc định cường độ ở cấp triển khai thuộc về profile của adapter và do nó phân giải theo từng mô hình.

`session.selectModel` áp dụng `ModelSelection` được chấp nhận cho phiên chứa nó, và gọi `saveDefaultModelSelection()` để lưu giá trị mặc định Agent dùng chung. Thất bại khi lưu chỉ được ghi log, không hoàn tác lựa chọn của phiên. Những bản triển khai không có bên cung cấp Settings sẽ giữ mục cấu hình tổ hợp, và lựa chọn được chấp nhận chỉ dừng lại trong phiên đó.

`ApiProxyDefaults` mang theo closure `defaultModelSelection()` và `saveDefaultModelSelection()`, nhờ đó `createApiProxy` không phụ thuộc vào seam Settings. `ApiProxyService` nối chúng lần lượt tới `ctx.agentDefaultModel.currentSelection()` và `ctx.agentDefaultModel.saveSelection()`.

`selectionFor(agent)` phân giải các tầng ở mỗi lần đọc: trước hết lấy lựa chọn của phiên trong tiến trình, kế đến lấy `request/header` được ghi gần nhất của phiên, cuối cùng lấy giá trị mặc định Agent hiện tại. Phiên đã có log yêu cầu sẽ tiếp tục gắn với lựa chọn được lưu bền trong log. Phiên trắng, dù được tạo trước khi tuỳ chọn được lưu, vẫn quan sát thấy giá trị mặc định hiện tại; điều này nhất quán với việc giao diện New Session có thể tái sử dụng phiên trắng.

Lựa chọn đã lưu không bắt buộc phải thuộc danh mục. Một route của bên cung cấp có thể phục vụ mô hình không được liệt kê trong danh mục chỉ mang tính tham khảo của nó. Vì vậy, `session.models` sẽ báo cáo riêng lựa chọn đã lưu ngoài các nhóm đã công bố, và báo cáo riêng việc adapter có phục vụ bên cung cấp của nó hay không.

## Ảnh hưởng

`host.describe` báo cáo giá trị mặc định Agent hiện tại. Sau khi chuyển mô hình thành công, `settings.yaml` sẽ có một mục `agent-default-model:`. Gateway không phơi bày namespace này qua allowlist của trang Settings; bộ chọn mô hình chính là trình biên tập của nó.

## Phiên không thể gửi tin nhắn

Khi không có adapter nào phục vụ bên cung cấp mà phiên đã chọn, `session.prompt` sẽ từ chối bằng `model-unavailable` trước khi mở lượt. Phương thức này là ranh giới cưỡng chế; việc vô hiệu hoá composer chỉ là tiện ích do client cung cấp.

`session.models` báo cáo `routable`. Plugin ui-model-selection chiếu các lựa chọn không định tuyến được qua `ctx.conversation.blocks`, và composer theo đó trở nên không thao tác được, đồng thời vẫn giữ chỗ ngồi (seat) mô hình khả dụng. Khi client không biết có định tuyến được hay không thì không chặn nhập liệu, kể cả trường hợp danh mục đang tải lần đầu hoặc tải thất bại.

Khả năng định tuyến khác với quan hệ thành viên trong danh mục. Route của bên cung cấp vẫn đang phục vụ có thể xử lý mô hình chưa công bố, nên việc không nằm trong nhóm danh mục không có nghĩa là phiên không dùng được.

## Các phương án đã cân nhắc

| Phương án thay thế | Chỗ không khớp cam kết |
|---|---|
| Lùi về mục cấu hình tổ hợp khi bên cung cấp đã lưu không khả dụng | Sản phẩm sẽ âm thầm rời khỏi lựa chọn của người dùng. |
| Kiểm tra lựa chọn đã lưu theo quan hệ thành viên trong danh mục | Danh mục chỉ mang tính tham khảo, có thể bỏ sót những mô hình vẫn yêu cầu được. |
| Lưu bằng merge patch | `reasoningEffort` bị bỏ qua sẽ không xoá được trường đã lưu. |
| Chỉ lưu lựa chọn trong phiên trắng | Lựa chọn được đưa ra một cách hiểu biết giữa cuộc hội thoại sẽ không trở thành mặc định của bản triển khai. |
| Thêm một cử chỉ «đặt làm mặc định» riêng | Bộ chọn của phiên và tuỳ chọn cho các phiên tương lai tuy đại diện cho cùng một lựa chọn của người dùng, nhưng vẫn có thể phân kỳ. |
