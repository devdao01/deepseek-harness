# Agent Note: Năng lực reasoning effort do adapter sở hữu

Status: implemented

[English](2026-07-24-adapter-owned-reasoning-effort-capabilities.md) | Tiếng Việt

## Vấn đề

Trước đây reasoning effort chỉ có thể cấu hình trong adapter, nên cuộc hội thoại không thể khám phá hay thay đổi các mức mà model được chọn hỗ trợ giữa các lần request. Nếu nâng union type các mức của một adapter lên `dsh-llm`, mọi provider và model đều buộc phải dùng chung một bộ tên mà bản thân chúng có thể không hỗ trợ; còn nếu chuyển sang dùng object options riêng của provider thì agent loop (vòng lặp tác tử) lại không thể kiểm tra request thực sự có hiệu lực, cũng không thể tái dựng chính xác request đó từ bản ghi lưu trữ.

## Quyết định

`dsh-llm` dùng branded type mờ `ReasoningEffortId` để biểu diễn reasoning effort. Một truy vấn `resolveModel(provider, model, signal?)` duy nhất do adapter sở hữu trả về `LlmResolvedModelInfo`, bao gồm định danh model chính xác cùng metadata tuỳ chọn về context và reasoning. `LlmRuntime.resolveModelInfo()` kiểm tra kết quả tổng hợp đó và trả về một bản sao giá trị tách rời khỏi trạng thái nội bộ của adapter. Khi `reasoning.efforts` tồn tại, nó là danh sách ID có thứ tự và không rỗng kèm metadata hiển thị, và có thể chỉ định một giá trị mặc định do cấu hình quyết định. Phần lõi yêu cầu reasoning effort được chỉ định tường minh hoặc do cấu hình chỉ định phải trùng khớp hoàn toàn với một ID trong danh sách, và tuyệt đối không tự động điều chỉnh hay đặt alias cho giá trị.

`LlmCallConfig` và `GenerateOptions` mang theo reasoning effort tuỳ chọn. Agent loop chuẩn bị cấu hình sau khi `agent/request` xử lý xong dưới sự kiểm soát của tín hiệu lượt đang hoạt động, rồi mới ghi vào `request/header`, nên giá trị mặc định và các thay đổi động chỉ trở nên nhìn thấy được với model sau khi đã thành sự thật được lưu trữ. Lời gọi đã chuẩn bị xong giữ nguyên cùng một đăng ký adapter chính xác trong suốt quá trình phân giải model chính xác bất đồng bộ, ghi lưu trữ request header và điều phối; khi gọi trực tiếp `LlmRuntime.stream()`, đăng ký adapter cuối cùng cũng được nắm giữ trước khi chờ phân giải. Route không có adapter đã đăng ký sẽ giữ nguyên cấu hình ban đầu, cho phép middleware `llm/stream` tiếp quản và cắt ngắn request đó; nếu vẫn không được xử lý, khâu điều phối cuối cùng sẽ từ chối route đó. Agent loop sau khi khôi phục chỉ giữ lại reasoning effort được ghi trong log nếu route provider/model ban đầu không thay đổi; nếu route thay đổi thì ID mờ của model trước đó sẽ bị loại bỏ.

Khi chính sách triển khai cho phép thinking, adapter DeepSeek nguyên bản khai báo `off`, `low`, `high` và `max`, mặc định dùng reasoning effort do cấu hình chỉ định, và dùng `high` nếu không được cấu hình. Mức `off` do adapter sở hữu ánh xạ thành `thinking.type: disabled` và không kèm `reasoning_effort`; `low`, `high` và `max` bật thinking và mang theo giá trị effort chính thức cùng tên trong protocol. Các triển khai cấu hình `thinking: disabled` chỉ khai báo `off`, và sẽ từ chối mọi nỗ lực bật thinking trước khi thực hiện I/O tới provider. Adapter pi-ai công bố nguyên trạng kết quả `getSupportedThinkingLevels()` của từng model chính xác, bao gồm cả `off`; khi profile không chỉ định giá trị mặc định, hành vi mặc định của provider được giữ nguyên, và việc ánh xạ sang giá trị protocol của provider vẫn nằm bên trong pi-ai. Theo đúng yêu cầu API của chính pi-ai, các stream option chung của nó biểu thị `off` bằng cách bỏ qua `reasoning`.

## Phương án thay thế

**Định nghĩa union type `ThinkingLevel` của pi-ai trong phần lõi.** Không áp dụng: các tên chuẩn hiện tại của pi-ai là chi tiết cài đặt của adapter; provider trong tương lai có thể lộ ra định danh khác mà không cần phát hành phiên bản lõi mới cho việc đó.

**Mang theo object options của provider không có ràng buộc kiểu.** Không áp dụng: agent loop vừa không thể kiểm tra giá trị đã chọn, vừa không thể ghi vào request header một sự thật ổn định và độc lập với provider.

**Tự động điều chỉnh các mức không được hỗ trợ.** Không áp dụng: thay thế ngầm sẽ khiến mục điều khiển người dùng chọn không khớp với ý định request được ghi log, đồng thời che giấu cấu hình triển khai đã lỗi thời.

**Chuẩn hoá từng adapter về một danh sách mức do phần lõi sở hữu, hoặc bỏ `off`.** Không áp dụng: tập giá trị khả dụng thuộc về năng lực của model chính xác. Client có thể hiển thị tuỳ chọn `off` của một adapter mà không cần bắt buộc mọi adapter đều phải lộ ra tuỳ chọn đó.

## Ảnh hưởng

Client chỉ cần truy vấn route chính xác một lần là có thể hiển thị định danh, dung lượng context và các tuỳ chọn reasoning do adapter sở hữu của route đó, mà không cần biết đến enum toàn cục hay tự tổng hợp `off`. Cấu hình adapter vẫn là nơi sở hữu giá trị mặc định và chính sách triển khai, còn `agent/request` có thể thay thế reasoning effort thực sự có hiệu lực cho từng bước trong phạm vi chính sách đó. Khi định danh chính xác, context hoặc metadata reasoning không hợp lệ, hệ thống lần lượt ném `INVALID_MODEL_INFO`, `INVALID_MODEL_CONTEXT` hoặc `INVALID_MODEL_REASONING`; khi giá trị được chỉ định tường minh hoặc do cấu hình chỉ định không được hỗ trợ, `UNSUPPORTED_REASONING_EFFORT` sẽ được ném ra trước khi thực hiện I/O tới provider.

Truy vấn tổng hợp metadata của model chính xác hoạt động bất đồng bộ, và có thể thất bại với những adapter được hậu thuẫn bởi catalog có thẩm quyền. Signal tuỳ chọn tạo thành ranh giới huỷ của bên gọi; adapter bất đồng bộ phải kết thúc nhanh chóng sau khi signal bị abort, để việc giải phóng tài nguyên của agent loop dừng lại hoàn toàn. Các bài test không cần khoá cho service, adapter, agent loop, session và request header cung cấp bảo đảm hồi quy cho việc kiểm tra, phân giải giá trị mặc định, thay đổi động, ghi log, hành vi khôi phục, quyền sở hữu đăng ký trong lúc HMR (thay thế module nóng) và huỷ; snapshot có thể chạy được cố định reasoning effort đã phân giải trong request header lắp ráp thực tế, còn các bài test adapter chỉ chạy khi có khoá thì bao phủ phần tuần tự hoá của provider.
