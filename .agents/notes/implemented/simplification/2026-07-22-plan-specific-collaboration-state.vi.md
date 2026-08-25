# Agent Note: Trạng thái cộng tác chuyên dụng cho plan

Status: implemented

[English](2026-07-22-plan-specific-collaboration-state.md) | Tiếng Việt

## Vấn đề

Sản phẩm chỉ giao mỗi `plan`, nhưng lần triển khai plan mode đầu tiên lại đưa vào một registry (sổ đăng ký) mode có tên gọi mang tính tổng quát. `ModeConfig.modes`, việc kiểm tra tên định nghĩa, `ctx.modes.list()`, logic fallback cho các định nghĩa đã bị loại bỏ, cùng với mode `review` được tổng hợp trong test, tất cả chỉ tồn tại để hỗ trợ những mode cộng tác giả định trong tương lai. Việc dẫn nhập plan, `/plan` và `exit_plan_mode` — những hành vi chuyên dụng cho sản phẩm — vẫn nằm trong cùng một package, nên API tổng quát này không hề tách bạch cơ chế có thể tái sử dụng khỏi chính sách của plan.

Từ "mode" cũng bao trùm những lĩnh vực chẳng liên quan gì đến nhau. Sandbox mode là một chính sách thực thi (enforcement) do `ctx.sandboxPolicy` sở hữu, được ghi log dưới `sandbox/mode`; còn plan mode là một phương thức cộng tác, đóng góp nội dung dẫn nhập và một đường thoát đã qua đánh giá. Nếu coi cả hai là các thể hiện của cùng một abstraction mode có tên gọi, ta sẽ che khuất mất mối quan hệ sở hữu độc lập của từng bên. Từ vựng tổng quát của giao thức truyền tải không chứng minh được rằng harness cần một lĩnh vực mode tổng quát.

Plan mode còn cần trạng thái cộng tác bền vững (persistent), sản phẩm kế hoạch (plan artifact) có thể đánh giá, ranh giới quyết định thủ công tường minh, và khả năng tái tạo request xuyên suốt việc resume và fork. Ngay cả khi loại bỏ registry tổng quát và phần chiếu (projection) tương tác của ACP (Agent Client Protocol), các yêu cầu này vẫn thuộc quyền sở hữu của tính năng plan.

## Quyết định

Plan mode sở hữu một package sản phẩm chuyên dụng cho plan: `@deepseek-ai/dsh-plan-mode` tại `packages/plan/plan-mode/`. Sự kiện bền vững là `plan/mode: { active: boolean }`, được fold (gấp) bởi `foldPlanMode(events)`, với giá trị log rỗng là `false`. `ctx.planMode.get(agent)` trả về `{ active, pending? }`, còn `set(agent, active)` ghi lại lựa chọn có hiệu lực tại boundary (ranh giới). Các rào chắn pre-step, retry, lỗi append và dispose (giải phóng tài nguyên) vẫn giữ nguyên cách quy thuộc chuyển trạng thái như cũ.

Config nghiêm ngặt chỉ là `{ section: string }`. Package này tự đăng ký section cố định `plan:policy`, `/plan [message]`, dạng thoát chủ động khớp chính xác `/plan off`, và `exit_plan_mode`. `/plan` không kèm tham số chọn kích hoạt; các tham số khác không rỗng thì trước tiên chọn kích hoạt, sau đó gửi văn bản đã loại bỏ khoảng trắng đầu/cuối qua `agent.steer()`, khiến văn bản đó trở thành một user message bình thường được ghi log trong các step bị ảnh hưởng. `/plan off` chọn hủy kích hoạt, không tạo ra input cho model, và có thể hủy lựa chọn kích hoạt vẫn đang chờ hiệu lực tại boundary. Ngay cả khi plan mode chưa kích hoạt, exit tool vẫn giữ nguyên đăng ký, để đảm bảo tool catalog của request luôn ổn định.

Composition hướng tới con người sở hữu lựa chọn và đánh giá plan. Note này ban đầu giữ lại bộ chọn `default`/`plan` ở cấp giao thức ACP như một adapter phía trên dịch vụ boolean; [ACP như một giao thức chỉ dành cho tự động hóa](2026-07-23-acp-automation-only-protocol.md) đã thay thế phần chiếu giao thức đó, nên composition ACP hiện tại không mount plan mode cũng không cung cấp giao thức chọn mode.

Sandbox mode và chính sách phê duyệt (approval) vẫn là hai trục ràng buộc bắt buộc độc lập với nhau. Plan mode không đọc cũng không ghi vào cả hai; lần đơn giản hóa này cũng không đưa vào bất kỳ base type, registry hay abstraction preset dùng chung nào cho các khái niệm đó.

### Ranh giới và quy ước với model

`plan/mode` chỉ được ghi log mà không xuất hiện ở surface, do đó resume, fork và compaction (nén) đều có thể khôi phục trạng thái này mà không cần mirror thời gian thực. Agent (smart agent) được spawn ra ban đầu ở trạng thái chưa kích hoạt, vì lúc tạo không có lựa chọn plan. Lựa chọn của user đang chờ hiệu lực sẽ được ghi log trước khi request bị ảnh hưởng được lắp ráp, tại pre-step ban đầu hoặc tiếp diễn, hoặc khi retry lúc resume request; nếu lỗi append bền vững, ý định sẽ tiếp tục treo lại, chờ xử lý ở boundary tiếp theo.

Trạng thái kích hoạt đóng góp một section do deployment cung cấp tại vị trí 50 trong prompt order. Trạng thái chưa kích hoạt không đóng góp section, nhưng `exit_plan_mode` vẫn giữ đăng ký ở cả hai trạng thái, vì vậy việc chuyển trạng thái sẽ thay đổi request header đã ghi log, nhưng không thay đổi tool schema gốc (native) hay Code Mode SDK. Việc chuyển trạng thái do user khởi xướng chỉ thêm một thông báo có nguồn (source) là plugin khi request header trước đó mô tả trạng thái ngược lại; lựa chọn trước request đầu tiên hoặc lựa chọn không làm thay đổi trạng thái cuối cùng sẽ không thêm thông báo, còn việc thoát tool đã được phê duyệt thì dựa vào kết quả tool của chính nó, không thêm thông báo thứ hai.

### Thoát đã qua đánh giá

`exit_plan_mode` yêu cầu agent gọi phải đang ở trạng thái plan mode kích hoạt, và phải nộp một bản plan markdown không rỗng, bắt đầu bằng heading. Câu hỏi tương tác với user lấy plan nguyên trạng làm chi tiết, và cung cấp `Approve`, `Keep planning` cùng phản hồi văn bản tự do. Chỉ khi lựa chọn duy nhất là `Approve` và không có văn bản tùy chỉnh thì mới được xem là đồng ý; mọi phản hồi khác đều giữ nguyên ở plan mode, và trả về phản hồi mang tính hiệu chỉnh cho model. Việc thoát đã được phê duyệt sẽ trở thành một lựa chọn chờ hiệu lực âm thầm, khiến việc dẫn nhập plan tiếp tục có hiệu lực trong phần còn lại của lô tool call hiện tại, và bị gỡ bỏ trước request tiếp theo.

Tool render bản plan đã nộp thành một thẻ (card) generic, tiêu đề lấy từ heading đầu tiên. Nếu nhà cung cấp tương tác với user thiếu hoặc thất bại, đánh giá thất bại, hoặc plugin bị dispose trong lúc đánh giá đang chờ, đều sẽ từ chối thoát, và giữ lại `/plan off` thủ công như đường thoát dành cho con người.

## Interface đã xóa bỏ

- Bất kỳ definition map, regex tên mode, quy tắc tên dành riêng, và vòng lặp command theo từng definition.
- `ModeDefinition`, definition map đã parse, `ctx.modes.list()`, trạng thái get/set kiểu string, cùng xử lý mode không xác định hoặc đã loại bỏ.
- Use case mode `review` chỉ dùng cho test, cùng phát biểu về việc có thể thêm mode khác qua config.
- Tên tổng quát `mode/set` và `mode:policy`; package plan sở hữu `plan/mode` và `plan:policy`.

## Phương án thay thế đã cân nhắc

**Giữ registry tổng quát riêng tư, hiện chỉ phơi bày plan.** Không chấp nhận, vì khi chưa có consumer sản xuất thứ hai, vẫn phải duy trì và test cơ chế tên và config không dùng đến. Nếu tương lai xuất hiện trạng thái cộng tác khác, có thể xây dựng seam chung phù hợp dựa trên hai case cụ thể.

**Gộp sandbox hoặc approval policy vào trạng thái plan.** Không chấp nhận, vì việc dẫn nhập cộng tác, ràng buộc thực thi và quyết định quyền hạn có chủ sở hữu, ngữ nghĩa vòng đời và consumer khác nhau. Nếu mode sở hữu giới hạn sandbox, lựa chọn sandbox tường minh của user có vẻ thành công nhưng thực chất bị âm thầm bỏ qua.

**Để một hình thức presentation transport sở hữu trạng thái plan.** Không chấp nhận, vì TUI, Web, resume, fork, lắp ráp prompt và exit tool đều cần dùng cùng một sự kiện đã ghi log, độc lập với bất kỳ transport đơn lẻ nào. Adapter presentation chỉ sở hữu phần chiếu của riêng mình.

**Tách thành ba package theo capability seam, hoặc đặt trạng thái vào agent loop.** Không chấp nhận, vì plan mode không có backend có thể thay thế, và các extension point sẵn có của session, prompt, tool, command, lifecycle đã cung cấp đủ mọi hook cần thiết.

**Ghi việc chuyển trạng thái vào tin nhắn surface, hoặc lưu plan vào file.** Không chấp nhận, vì trạng thái cộng tác là sự kiện chỉ-ghi-log, tool argument đã ghi lại plan có thể đánh giá. Việc ghi lặp lại vào surface sẽ tiêu tốn context của model, còn thư mục plan sẽ tạo thành nơi sở hữu bền vững thứ hai.

**Lọc tool theo allowlist tên chuyên dụng cho plan hoặc theo policy stack toàn cục.** Không chấp nhận, vì tính khả biến là thuộc tính của từng tool, bao gồm cả tool tương lai và tool MCP, không nên do mỗi deployment plan tự duy trì một danh sách. Chỉ khi xuất hiện consumer cụ thể, effects metadata mới có thể thiết lập policy chung; trước đó, plan mode là cơ chế dẫn nhập, không phải ranh giới bảo mật.

**Hoàn tất đánh giá qua approval seam hoặc văn bản thuần.** Không chấp nhận, vì đánh giá plan không phải là quyết định quyền hạn, cần sản phẩm plan nguyên trạng và phản hồi hiệu chỉnh dạng văn bản tự do, và phải lấy tool call đã ghi log làm sự chuyển đổi có cấu trúc. User interaction seam cung cấp đúng quy ước này.

## Xác minh

- Package test tiếp tục bao phủ thứ tự boundary, retry, lỗi append, dispose (giải phóng tài nguyên) do HMR (hot module replacement), lắp ráp prompt, schema gốc và Code Mode schema ổn định, kết quả đánh giá và các bất biến (invariant), thông qua dịch vụ boolean.
- Command test bao phủ `/plan` không tham số, `/plan <message>`, `/plan off` khi đang kích hoạt, hủy lựa chọn kích hoạt đang chờ, tính idempotent khi chưa kích hoạt, việc không tồn tại `/mode` và `/review`, cùng việc gỡ bỏ theo phạm vi effect.
- Kịch bản TUI không cần key đi qua `/plan <message>` để kích hoạt, `/plan off` để thoát, và chứng minh mỗi `plan/mode` đã submit đều đứng trước request header mà nó thay đổi, tin nhắn kích hoạt được ghi log dưới sự dẫn nhập plan, và request sau khi thoát không chứa phần dẫn nhập đó.
- Toàn bộ luồng đánh giá `exit_plan_mode` có package test bao phủ, nhưng sau khi kịch bản ACP tương tác bị loại bỏ thì không còn snapshot composition ứng dụng; kịch bản TUI hiện tại không cần key chỉ bao phủ kích hoạt bằng command và thoát trực tiếp.

## Hệ quả

Việc triển khai này chỉ dùng một bộ từ vựng để mô tả một tính năng đã giao. Nếu muốn thêm một phương thức cộng tác khác, phải đưa ra quyết định thiết kế tường minh, chứ không thể chỉ thêm mục config; client tự động hóa sẽ không nhận được quyền điều khiển mode hướng-tới-con-người qua ACP. Theo chính sách định dạng tiền phát hành (pre-release) của repo, lần migration này cố ý từ chối `mode/set` log cũ và config `modes.plan.section` cũ.

Trạng thái plan vẫn có thể tái tạo, tool schema vẫn giữ ổn định, nhưng nếu process thoát trước boundary tiếp theo, lựa chọn đang chờ hiệu lực ở trạng thái idle sẽ bị mất. Việc vào hoặc rời plan mode sẽ thay đổi nội dung tại vị trí 50 trong prompt order trở đi; nếu model bỏ qua phần dẫn nhập, vẫn có thể thực hiện thay đổi, trừ khi deployment cấu hình riêng chính sách sandbox, approval hoặc filesystem.
