# Agent Note: Loại bỏ sự kiện `llm/adapter-change` không được tiêu thụ

Status: implemented

Archived: 2026-07-26

[English](2026-06-20-drop-unconsumed-llm-adapter-change-event.md) | 中文

## Vấn đề

`LlmService.registerAdapter()` phát ra sự kiện `llm/adapter-change` khi đăng ký và dispose (giải phóng tài nguyên) ([packages/llm/llm/src/index.ts](../../../../packages/llm/llm/src/index.ts)). Tìm kiếm `llm/adapter-change` trong `packages/*/src` và `examples/*/src` chỉ thấy khai báo, điểm emit, tài liệu và test; không có listener nào trong môi trường sản xuất đăng ký nó.

Điều này khác với `tools/change` và `system-prompt/change`. Hiện tại hai sự kiện này cũng chưa có bên tiêu thụ, nhưng chúng có triển vọng trở thành tín hiệu thay đổi registry cho UI tool/prompt thời gian thực trong tương lai. Việc đăng ký adapter LLM (mô hình ngôn ngữ lớn) giống chi tiết hiện thực lúc khởi động hơn: adapter không phải là panel tùy chọn hiển thị cho người dùng, seam chặn lời gọi model thật sự là `llm/stream`. Giữ lại một sự kiện thay đổi adapter không có listener chỉ là lặp lại ở quy mô nhỏ hơn mẫu hình đã [xóa summary vô dụng](2026-06-19-drop-mutable-session-summary.md).

Sự kiện này không miễn phí. `registerAdapter()` yield disposer rollback trước khi phát `llm/adapter-change`, để listener ném lỗi sẽ hoàn tác thay đổi thay vì làm rò rỉ entry adapter; package còn có test cho đường ném lỗi của listener đó. Thứ tự phòng thủ này bảo vệ một chế độ lỗi mà chỉ test mới có thể kích hoạt.

## Quyết định

Chỉ loại bỏ `llm/adapter-change`: bao gồm khai báo trong `interface Events` của `dsh-llm`, lời gọi `ctx.emit('llm/adapter-change')`, và câu "phát `llm/adapter-change` khi đăng ký và giải phóng" trong JSDoc của `LlmService.registerAdapter`. Generator hiệu ứng của `registerAdapter()` vẫn giữ disposer thay đổi và rollback cho HMR (hot module replacement)/giải phóng, nhưng loại bỏ thứ tự rollback khi listener ném lỗi vốn chỉ tồn tại vì sự kiện đó. Test disposer của adapter khẳng định disposer trả về sẽ gỡ adapter, không còn đăng ký sự kiện nữa; test rollback khi listener ném lỗi biến mất cùng đối tượng test của nó. Phân loại sự kiện trong [docs/architecture.md](../../../../docs/architecture.md) và [packages/llm/llm/README.md](../../../../packages/llm/llm/README.md) cũng được cập nhật trong cùng thay đổi này.

## Các phương án thay thế đã cân nhắc

### Tại sao không loại bỏ mọi sự kiện thay đổi registry?

Việc microkernel để registry thông báo thay đổi là một quy ước nhất quán. `tools/change` và `system-prompt/change` có thể hữu ích khi UI có thể refresh thời gian thực danh sách tool khả dụng hoặc các phần prompt. Agent Note (bản ghi quyết định của agent) này giữ quy ước đó ở những nơi có bên tiêu thụ phía người dùng hợp lý, chỉ xóa sự kiện thay đổi adapter mà cả bên tiêu thụ hiện tại lẫn tương lai đều không rõ ràng.

Nếu tương lai cần trình duyệt adapter LLM hoặc bộ chọn model động dùng tới tín hiệu này, hãy đưa nó trở lại cùng với bên tiêu thụ, kèm payload rõ ràng hơn "có gì đó đã thay đổi".

## Kiểm chứng

`llm/adapter-change` và lệnh emit của nó đã biến mất, danh mục Cordis được sinh lại vẫn mới; an toàn HMR vẫn đúng (giải phóng fiber đóng góp adapter đó sẽ gỡ nó); `tools/change` và `system-prompt/change` vẫn có tài liệu và test; snapshot ACP (Agent Client Protocol) và smoke Headless Loader không cần key cố định đường sản xuất không đổi.

## Hệ quả

- **Loại bỏ một sự kiện emit đã có tài liệu là thay đổi giao diện công khai.** Nó xuất hiện trong bảng phân loại, đọc như một API được thiết kế có chủ đích. Nhưng "đã khai báo và đã emit" không đồng nghĩa với "đã được tiêu thụ" — đây là căn cứ giống hệt khi xóa summary có thể thay đổi. Bảng phân loại được cập nhật trong cùng thay đổi này, nên tài liệu không bị trôi lệch.
- **Quy ước thay đổi registry trở nên không đồng nhất.** Điều này chấp nhận được, vì đăng ký adapter LLM và các đoạn tool hay prompt không phải là khái niệm hướng người dùng ở cùng tầng. Không đồng nhất nhưng trung thực, tốt hơn đồng nhất nhưng vô dụng.

Đây là một sự cắt tỉa nhỏ, nhưng nó loại bỏ một bất biến tính đúng đắn đang bảo vệ cho một bên tiêu thụ không hề tồn tại.
