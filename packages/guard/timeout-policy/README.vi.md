# dsh-tool-call-timeout-policy

[English](README.md) | Tiếng Việt

Bộ cưỡng chế timeout cho lệnh gọi tool: một listener bao (wrap) duy nhất cho `tools/execute` sẽ thiết lập một hạn chót hợp tác (cooperative deadline) cho từng lệnh gọi trên `exec.signal`; áp dụng cho các tool đã khai báo `timeoutMs` trên `ToolDefinition` của chúng. Khi hạn chót đó đến trước, nó trả về kết quả có cấu trúc `TOOL_TIMEOUT`. Ngân sách được đọc từ chính khai báo của tool (`ToolDefinition.timeoutMs`, do plugin sở hữu tool đó thiết lập), do đó plugin này là **zero-config** (không cần cấu hình). Nó là triển khai tham chiếu cho tầng bao `tools/execute`, cũng là nơi cưỡng chế ngân sách lệnh gọi tool hướng tới model ([Agent Note về thư viện timeout](../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)).

## Plugin (namespace: `timeout-policy`)

Đây là plugin dạng hàm／namespace (`name`／`inject`／`apply`), không phải dịch vụ. Nó không đăng ký tool, cũng không nhận cấu hình; nó tiêu thụ waterfall (sự kiện kiểu thác nước) `tools/execute` của `ctx.tools` (luôn được registry `dsh-tools` cung cấp), và đọc `timeoutMs` đã khai báo của từng tool đang được phân phối; khai báo đó đến từ registry (`ctx.tools.get(exec.name)`).

```yaml
- id: timeout-policy
  name: '@deepseek-ai/dsh-tool-call-timeout-policy'
```

Ngân sách cho từng tool do plugin tool đó khai báo (ví dụ cấu hình `fetchTimeoutMs`／`searchTimeoutMs` của `dsh-tool-web` sẽ được gắn thêm dưới dạng `ToolDefinition.timeoutMs`); plugin này chỉ chịu trách nhiệm cưỡng chế, do đó không thể gõ sai tên tool.

### Hành vi

Đối với **các tool đã khai báo `timeoutMs`**, listener sẽ:

1. Đọc ngân sách từ chính khai báo của tool trong registry (`ctx.tools.get(exec.name)?.timeoutMs`), và thiết lập `deadline(exec.signal, timeoutMs, 'TOOL_TIMEOUT')`: một signal hợp nhất việc hủy bỏ của bên gọi với bộ đếm giờ của plugin này (`@deepseek-ai/dsh-timeout`).
2. Thay thế signal phái sinh đó vào `exec` để dùng cho việc phân phối downstream, sau đó khôi phục lại signal riêng của bên gọi (Cordis `next()` bỏ qua tham số truyền vào, do đó tầng bao sẽ chỉnh sửa `exec` dùng chung tại chỗ; việc khôi phục giúp `tools/post-execute` nhìn thấy signal của bên gọi).
3. Sau khi phân phối, nếu `timeoutOf(d.signal, 'TOOL_TIMEOUT')` phát hiện bộ đếm giờ riêng của plugin này đã kích hoạt, thì thay kết quả bằng một kết quả tool có cấu trúc `TOOL_TIMEOUT`: `{ isError: true, error: { message, info: { name: 'ToolTimeoutError', code: 'TOOL_TIMEOUT' } }, content: 'Error: tool call timed out after <ms>ms' }`.

**Các tool chưa khai báo ngân sách** sẽ được ủy quyền nguyên trạng (không khởi động hạn chót).

`next()` cơ sở là thunk phân phối kèm xử lý chuẩn hóa mà registry cung cấp cho `tools/execute`, do đó khi signal timeout đến nhà cung cấp tự ném lỗi hủy bỏ upstream của chính nó, việc phân phối sẽ chuyển nó thành kết quả lỗi thông thường trước, rồi tầng bao này mới thay bằng `TOOL_TIMEOUT`. Thứ tự này là lý do việc thay thế dựa trên signal (`timeoutOf`) chứ không dựa trên hình dạng kết quả đã phân phối.

### Hợp tác, không phải chấm dứt cứng

Signal phái sinh chỉ **thông báo**; việc có chấm dứt hay không vẫn phụ thuộc vào tool và năng lực mà nó chuyển tiếp `exec.signal` đến (bản thân thư viện `dsh-timeout` không chịu trách nhiệm chấm dứt cứng). **Do đó, việc khai báo `timeoutMs` có nghĩa là「hợp tác với `exec.signal`」**: tool bỏ qua signal đó sẽ không dừng lại khi timeout. Chỉ tool nào chuyển tiếp signal mới nên khai báo trường này; `web_fetch`／`web_search` đã được triển khai (chuyển tiếp đến nhà cung cấp thông qua `ctx.web`) là triển khai tham chiếu. `TOOL_TIMEOUT` không cần sự kiện session để đảm bảo khả năng tái tạo: nó là `tool/result` cuối cùng hướng tới model, đã được vòng lặp ghi lại.

### Kết hợp với các tầng bao `tools/execute` khác

Nhiều listener `tools/execute` được kết hợp theo thứ tự đăng ký của Cordis. Khi dùng cùng với các tầng bao retry／sandbox／metrics trong tương lai, thứ tự đăng ký sẽ quyết định ngữ nghĩa: "timeout bao trùm toàn bộ thao tác retry" (timeout đăng ký ở tầng ngoài), hoặc "timeout bao trùm mỗi lần thử" (timeout đăng ký ở tầng trong).

## Trải nghiệm model

### Kết quả tool có điều kiện

#### Model nhìn thấy gì

Plugin này không thêm prompt hay schema. Nếu hạn chót đã khai báo đến trước, nó sẽ thay kết quả của nhà cung cấp bằng `Error: tool call timed out after <ms>ms` cùng cấu trúc `TOOL_TIMEOUT`; nếu không, kết quả gốc giữ nguyên.

#### Ảnh hưởng Token

Lệnh gọi không bị timeout sẽ không làm tăng token. Timeout sẽ thêm một kết quả lỗi ngắn gọn được giữ lại, và ngăn kết quả lớn hơn, trả về muộn hơn từ nhà cung cấp đi vào ngữ cảnh.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung mới xuất hiện sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

## Hạn chế đã biết và công việc hoãn lại

- **Hợp tác, không bao giờ là chấm dứt cứng**: hạn chót chỉ thông báo qua `exec.signal`; tool bỏ qua signal đó sẽ không dừng lại khi timeout (xem mục "Hợp tác, không phải chấm dứt cứng").
- **Không có ngân sách thống nhất**: chỉ tool nào khai báo `timeoutMs` và đặt nó trên `ToolDefinition` mới có hạn chót; tool chưa khai báo không có giá trị mặc định cấp registry (`bash`／`read`／`write`／`edit` đã triển khai cố tình không khai báo).
