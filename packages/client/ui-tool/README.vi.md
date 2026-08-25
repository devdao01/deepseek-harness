# @deepseek-ai/dsh-client-ui-tool

[English](README.md) | Tiếng Việt

Plugin hiển thị công cụ phía Client. `ui-conversation` phân phối từng Conversation Node `tool-call` đã sắp thứ tự thông qua key khớp của `conversation.chat.node`; gói này render phần root trong đó cùng các lời gọi con Code Dispatch của nó, và phân phối từng lời gọi nguyên tử qua keyed slot `tool.call.toolview`. Các tên công cụ chưa được đăng ký thì dùng thẻ chung.

Gói UI nghiệp vụ chỉ đăng ký tên công cụ wire và các view nguyên tử, không ghép cặp sự kiện phiên, không dựng lại transcript (bản ghi văn bản), cũng không sở hữu cấu trúc root/subcall. Runtime vẫn có quyền quyết định cuối cùng về việc ghép cặp call/result, vòng đời và phép chiếu `subCalls` đệ quy; conversation view vẫn có quyền quyết định cuối cùng về vị trí trong ChatFlow.

## Giao ước render

`ToolCallTree` nhận một `ToolCallBlock` root đã bao gồm sẵn `subCalls` đệ quy, trạng thái selection, `cwd` của phiên, cùng các callback của Host để mở tệp và kiểm tra lời gọi. Nó duyệt đệ quy các khối lời gọi chuẩn, để root và child ở mọi độ sâu đi qua cùng một đường phân phối nguyên tử, không đăng ký nhận một map parent-to-children riêng.

Mỗi lớp bọc root và child đều giữ giao ước DOM `data-chat-anchor-key="call:<id>"` và `data-chat-call-id`, phục vụ phân trang và selection.

Gói này còn điền vào `conversation.details.tool` thông qua `ToolDetails`. Renderer dòng và renderer chi tiết dùng chung một bộ card model thuần hướng tới các render intent `terminal`, `read`, `diff`, `search` và `web`. Nhãn intent chưa biết và dữ liệu wire card sai định dạng đều lùi về văn bản kết quả công cụ đã được làm phẳng.

Dòng chung phân loại các tên công cụ đã biết thành các biến thể search, read, shell, write, edit, code hoặc generic. Các trạng thái đang chạy, thành công, thất bại và bị ngắt chỉ đến từ lát cắt call/result đã đóng băng. Đường dẫn tệp chỉ được phân giải tương đối theo `cwd` của phiên khi người dùng gọi callback mở tệp của Host; mã hiển thị không đọc service phiên.

## View công cụ nguyên tử

Gói nghiệp vụ sở hữu view đó sẽ đăng ký tên công cụ wire của mình vào `tool.call.toolview`:

```ts ignore-check
ctx.slots.inject('tool.call.toolview', () =>
  ctx.slots.register({
    name: 'tool.call.toolview',
    key: '<wire tool name>',
  }, BusinessToolRow))
```

Tải trọng của owner là `ToolCallOwnerProps`: `callId`, `toolName`, `block` đã đóng băng, `cwd` tùy chọn, cùng các callback `openFile`, `inspect` thông thường. Mục đăng ký sẽ nhận được dữ liệu chia sẻ runtime của slot phiên như thường lệ, nhưng không nhận React node, service runtime hay hiểu biết về root/subcall.

Hiện gói này sở hữu generic fallback, cùng các phần hiển thị tích hợp sẵn cho shell/pwsh, read, write/edit, grep/glob, web, todo, question và Code Dispatch. `ui-skill` là ví dụ cho mục đăng ký `skill` do chính gói nghiệp vụ sở hữu.

Giới hạn trên và quy tắc fallback của từng loại thẻ vẫn do các Agent Note tương ứng phụ trách: [terminal](../../../.agents/notes/implemented/feature/2026-07-28-web-terminal-card.md), [diff](../../../.agents/notes/implemented/feature/2026-07-30-web-diff-card.md), [read](../../../.agents/notes/implemented/feature/2026-07-30-web-read-card-frontend.md), [search](../../../.agents/notes/implemented/feature/2026-07-30-web-search-card.md) và [web](../../../.agents/notes/implemented/feature/2026-07-30-web-result-card-frontend.md).

## Trải nghiệm mô hình

Không có, vì gói này chỉ render các lời gọi công cụ và kết quả đã được ghi lại, không thay đổi yêu cầu gửi mô hình, việc thực thi công cụ hay sự kiện phiên.

#### Ảnh hưởng KV Cache

Không có. Gói này chỉ phụ trách phần hiển thị phía Client.

## Hạn chế đã biết và công việc tiếp theo

- Host không phơi bày `run_code` dưới dạng binding chương trình Code Mode, nên sự kiện sinh ra trong môi trường thực tế chỉ tạo một tầng phân phối; giao ước runtime/UI đệ quy vẫn hỗ trợ lồng nhau.
- Các view công cụ của bên thứ nhất đang tập trung tại gói này, và có thể di chuyển độc lập sang gói nghiệp vụ sở hữu chúng thông qua keyed slot.
- Văn bản của công cụ dùng lại locale namespace của `ui-conversation`.
