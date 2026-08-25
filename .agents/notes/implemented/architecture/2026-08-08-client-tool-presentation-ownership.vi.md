# Agent Note: Quyền sở hữu phần trình bày tool phía Client

Status: implemented

[English](2026-08-08-client-tool-presentation-ownership.md) | Tiếng Việt

## Vấn đề

Runtime của Client đã ghép cặp các event tool call/result theo `callId` và có thể khôi phục cấu trúc root/subcall từ các event Code Dispatch, nhưng Chat view lại đồng thời sở hữu vị trí đặt tool trong luồng hội thoại, việc điều phối cây gọi đệ quy, việc phân phối theo tên tool, Generic fallback, card model và renderer của các tool first-party. Vì vậy `ui-conversation` buộc phải diễn giải từng tên tool nghiệp vụ; chỉ di chuyển một React component đơn lẻ sẽ không thay đổi lớp quyền sở hữu này, và sau khi dời renderer nguyên tử đi thì phần trình bày của subcall sẽ không còn ai chịu trách nhiệm.

Phần trình bày tool cần một chủ sở hữu độc lập, đồng thời không được dựng thêm một registry thứ hai song song với Client slot, cũng không được để từng renderer tool nguyên tử tự hiểu cấu trúc root/subcall.

## Quyết định

Tool là một khái niệm trình bày hạng nhất của Client UI, do `@deepseek-ai/dsh-client-ui-tool` sở hữu thống nhất phần điều phối root/subcall, việc phân phối renderer nguyên tử theo tên tool trên wire, Generic fallback, card model và details output. Plugin nghiệp vụ chỉ đăng ký renderer tool nguyên tử của chính nó, không sửa conversation hay session.

Việc lắp ráp dữ liệu Conversation tuân theo [quyết định về Conversation business node](2026-08-09-client-conversation-node-assembly.md) đến sau. Tool Definition của `ui-conversation` ghép cặp root call/result từ các session event, fold các edge của Code Dispatch thành `ToolCallBlock.subCalls` đệ quy, và sinh ra một Chat Node `tool-call` ổn định; trách nhiệm dữ liệu ở đây chỉ xử lý identity và cấu trúc của tool chính thức, không diễn giải phần trình bày của từng tên tool cụ thể.

[`ChatView`](../../../../packages/client/ui-conversation/src/client/chat/ChatView.tsx) chỉ đặt [`ChatNodeSeat`](../../../../packages/client/ui-conversation/src/client/chat/ChatNodeSeat.tsx) dùng chung theo `order` của Chat snapshot. Seat phân phối `'conversation.chat.node'` theo `node.kind`; [`ui-tool`](../../../../packages/client/ui-tool/src/client/apply.ts) đăng ký entry `tool-call`, và [`ToolCallTree`](../../../../packages/client/ui-tool/src/client/tool/ToolCallTree.tsx) duyệt đệ quy root block. Mỗi tầng root hoặc child đều được phân phối qua cùng một sub-slot keyed/session `'tool.call.toolview'` với `entryKey: toolName`, và render `GenericToolCard` khi không có đăng ký.

Plugin tool nghiệp vụ nhận một `ToolCallBlock` chuẩn, identity, workspace cwd và các hành động của host; nó không đọc session, context hay Conversation assembler. skill (kỹ năng) vẫn là một tool thông thường; nó dùng chung đường đăng ký keyed slot với các tool nghiệp vụ khác.

details panel là điểm trình bày tool thứ hai, nhưng không phải là chủ sở hữu cây gọi. `ui-conversation` xác định call được chọn và ủy quyền output body qua `'conversation.details.tool'`; `ui-tool` tái sử dụng card model, còn khi plugin vắng mặt thì conversation fallback giữ lại raw result text.

## Runtime và đường render

```text
Session Event window
  -> Tool Definition -> tool-call Chat Node (recursive ToolCallBlock)
  -> ChatView -> ChatNodeSeat(entryKey = tool-call)
  -> ToolCallTree
       -> root/subCalls[] recursion
       -> tool.call.toolview(entryKey = toolName)
            |- registered atomic view
            `- GenericToolCard fallback
```

## Ranh giới quyền sở hữu

| Chủ sở hữu | Sở hữu | Rõ ràng không sở hữu |
|---|---|---|
| Conversation engine của runtime Client | identity của context, Location, replay lịch sử, phát hành view Node | ý nghĩa của event tool, cây gọi, renderer tool |
| Tool Definition của `ui-conversation` | ghép cặp call/result, cấu trúc Code Dispatch, `ToolCallBlock` running/settled/interrupted, anchor sắp xếp Chat | phân phối theo tên tool, card model, cấu trúc React đệ quy |
| Chat view của `ui-conversation` | thứ tự Node theo key, scroll anchor, selection và hành động của host | lifecycle của tool, tổ hợp subcall, renderer tool nguyên tử |
| `ui-tool` | render đệ quy root/subcall, keyed dispatch nguyên tử, fallback, card model và details output | fold session event, sắp xếp Chat |
| Plugin tool nghiệp vụ | renderer nguyên tử cho một hoặc nhiều tên tool trên wire | vị trí root/subcall, ghép cặp vòng đời, session projector |

## Kiểm chứng

Test của `ui-conversation` cố định việc ghép cặp call/result, Code Dispatch, interruption và keyed identity running-to-settled của Tool Definition, và không import renderer production của `ui-tool`. Test của `ui-tool` mount một conversation host thật, cố định đệ quy root/subcall, keyed dispatch, Generic fallback, selection, details và card của tool cụ thể. Test Web sau khi lắp ráp bao phủ đường đi mà hai plugin cùng được nạp.

## Các phương án đã cân nhắc

**Giữ slot tool nguyên tử dưới mỗi conversation view.** Bị từ chối: mỗi view sẽ phải lặp lại việc điều phối root/subcall, và việc đăng ký tool cũng bị phân mảnh theo view. Toàn bộ renderer tool chiếm một business Node slot của view, còn việc phân phối nguyên tử do chính tool sở hữu.

**Chỉ di chuyển React component của tool và card model.** Bị từ chối: conversation vẫn sẽ phân phối theo tên tool và đệ quy subcall; thay đổi vị trí file không tạo ra ranh giới quyền sở hữu.

**Dựng một registry projector/fold riêng cho tool.** Bị từ chối: Conversation assembler dùng chung đã sở hữu identity của context, cửa sổ lịch sử và việc phát hành; một registry runtime thứ hai sẽ tạo ra hai nguồn quyền lực song song cho vòng đời.

**Để mỗi renderer tool nguyên tử tự đệ quy subcall của nó.** Bị từ chối: bên đăng ký nguyên tử chỉ nên hiểu một lần gọi tool, không nên biết mình là root hay child. Cấu trúc đệ quy do `ToolCallTree` xử lý thống nhất.

**Để `ui-conversation` import trực tiếp component của `ui-tool`.** Bị từ chối: điều này đảo ngược chiều phụ thuộc tính năng và biến phần trình bày tool thành một năng lực bắt buộc. Slot giữ được việc nạp độc lập, vòng đời riêng và fallback.

## Hệ quả

`ui-conversation` không còn phụ thuộc vào phần trình bày nghiệp vụ tương ứng với tên tool, và root cùng subcall cũng không trôi dạt sang các đường phân phối khác nhau. Các package nghiệp vụ có thể sở hữu renderer tool nguyên tử một cách độc lập; khi `ui-tool` vắng mặt, việc lắp ráp dữ liệu Conversation vẫn thành lập, Chat Node dùng fallback chung, còn details giữ lại raw result.

Cái giá phải trả là `ui-tool` phụ thuộc rõ ràng vào business Node slot và locale namespace do conversation khai báo, và sở hữu một sub-slot dành riêng cho tool. Tool Definition tạm thời nằm trong `ui-conversation` vì lần này không tách package; về sau nó có thể dịch chuyển dọc theo seam của Conversation registry mà không làm thay đổi quyền sở hữu phần trình bày mà bản ghi này quy định.
