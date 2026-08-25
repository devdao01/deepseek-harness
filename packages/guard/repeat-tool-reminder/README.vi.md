# @deepseek-ai/dsh-repeat-tool-reminder

[English](README.md) | Tiếng Việt

Đây là một bộ ngắt vòng lặp chỉ mang tính gợi ý, không phải một tool hướng tới model: nó không xuất hiện trong danh sách tool, không phủ quyết hay viết lại lệnh gọi, chỉ thêm vào một hành vi. Nó theo dõi luồng lệnh gọi tool của từng agent (tác tử), đếm số lần gọi liên tiếp cùng một tool với tham số đã chuẩn hóa giống hệt nhau; khi đạt đến số lần liên tiếp đã cấu hình, nó sẽ tiêm vào một lời nhắc tăng dần theo cấp độ, yêu cầu model dừng lặp lại, đọc lại kết quả lần trước, và chuyển sang phương án khác hoặc kết thúc tác vụ. Việc chọn thử lại theo cách khác, thu thập thêm bằng chứng hay hoàn thành tác vụ vẫn hoàn toàn do model quyết định: lệnh gọi lặp lại hợp lý sẽ không bị trì hoãn cũng không bị chặn. Lý do quyết định xem [Agent Note về repeat-tool-reminder](../../../.agents/notes/archived/feature/2026-07-08-repeat-tool-guard.md).

## Cấu hình

```yaml
- id: repeat-tool-reminder
  name: '@deepseek-ai/dsh-repeat-tool-reminder'
  config:
    thresholds: [3, 5, 8]        # default; consecutive counts that trigger a reminder
    include: []                  # tool-name patterns to track; empty ⇒ all tools
    exclude: [todo_write]        # tool-name patterns transparent to the chain
    argumentsPreviewChars: 500   # default; cap on arguments quoted in the detailed reminder
```

Khi plugin được tải, `thresholds` sẽ fail fast với cấu hình sai: danh sách rỗng, giá trị không phải số nguyên, giá trị nhỏ hơn 2 hoặc giá trị trùng lặp đều sẽ ném lỗi, không bao giờ âm thầm quay về giá trị mặc định; `argumentsPreviewChars` cũng chỉ chấp nhận số nguyên lớn hơn hoặc bằng 1. Hệ thống sẽ chuẩn hóa danh sách theo thứ tự tăng dần; ngưỡng đầu tiên chỉ gửi lời nhắc chung ngắn gọn, mỗi ngưỡng tiếp theo đều gửi phiên bản chi tiết, liệt kê tool, số lần liên tiếp và tham số đã chuẩn hóa. Nội dung tham số bị cắt lấy `argumentsPreviewChars` ký tự đầu tiên, kèm theo dấu đánh số ký tự đã lược bỏ, tránh việc payload `write`／`edit` trong vòng lặp đi vào request tiếp theo mà không giới hạn (chain key luôn so sánh chuỗi chuẩn hóa đầy đủ; giới hạn này chỉ ràng buộc lời nhắc, không ảnh hưởng đến việc phát hiện).

Mục `include`／`exclude` hỗ trợ ký tự đại diện `*`, và thực hiện đánh giá predicate đối với các tool thực sự tồn tại tại thời điểm gọi, chứ không tham chiếu mục registry. Do đó, một pattern không khớp với bất kỳ tool nào đã đăng ký hiện tại không phải là lỗi (`exclude: [mcp_*]` vẫn hợp lệ trong triển khai chưa tải MCP tool); điều này khác với việc kiểm tra đối tượng tham chiếu của `toolOrder`.

## Ngữ nghĩa chain

Chain key là「`(tool name, canonical arguments)`」: quá trình chuẩn hóa sẽ sắp xếp sâu (deep-sort) key, sau đó thực hiện `JSON.stringify`, do đó các đối tượng tham số chỉ khác thứ tự thuộc tính sẽ được coi là giống nhau. Nếu một lệnh gọi giống với lệnh gọi được theo dõi trước đó, bộ đếm liên tiếp của agent đó sẽ tăng lên; đổi sang một lệnh gọi được theo dõi khác sẽ reset về 1.

- **Lệnh gọi không được theo dõi trong suốt đối với chain.** Lệnh gọi bị `include`／`exclude` loại trừ sẽ không làm tăng hay reset bộ đếm; do đó, `grep X → todo_write → grep X` vẫn được tính là hai lần `grep X` liên tiếp, ngay cả khi `todo_write` đã bị loại trừ. Đây chính là giá trị của cơ chế loại trừ: các tool ghi chép xen kẽ trong vòng lặp không thể che giấu vòng lặp.
- **Lệnh gọi bị từ chối cũng được tính.** Việc phát hiện nằm ở `tools/post-execute`; ngay cả khi lệnh gọi bị listener `tools/pre-execute` từ chối, sự kiện này vẫn chạy. Việc model liên tục thử lại một lệnh gọi bị từ chối chính là vòng lặp cần được ngắt.
- **Bỏ qua lệnh gọi không có agent.** Bên gọi trực tiếp `ctx.tools.execute()` không có model cần nhắc nhở, cũng không có đối tượng agent đang hoạt động để dùng làm key.
- **Phân key theo agent.** Registry tool nằm ở cấp context, subagent xen kẽ đi qua cùng một waterfall (sự kiện kiểu thác nước), do đó mỗi chain dùng `WeakMap<Agent, Chain>`, lấy đối tượng agent đang hoạt động làm key. Lệnh gọi lặp lại của một agent sẽ không bao giờ kích hoạt lời nhắc cho agent khác. Prompt của người dùng (`agent/pre-step`) sẽ reset chain của agent đã gửi prompt đó; vòng đời đối tượng tự nhiên giới hạn tuổi thọ của các mục tham chiếu yếu (weak reference), không cần listener dispose (giải phóng tài nguyên).
- **Chỉ tồn tại trong bộ nhớ.** Session được khôi phục từ bền vững hóa sẽ bắt đầu từ một chain hoàn toàn mới: guard là lời nhắc theo kinh nghiệm (heuristic), không phải bất biến có ghi log; việc lời nhắc bị trễ là chi phí có thể chấp nhận được.

## Truyền lời nhắc

Lời nhắc được truyền thông qua `additionalContexts` trong quyết định post-execute (nguồn là `{kind: 'plugin', plugin: 'repeat-tool-reminder'}`), không bao giờ thay thế `content`; sự kiện `tool/result` dùng cho việc kiểm toán vẫn giữ nguyên đầu ra riêng của tool. Vòng lặp sẽ đệm (buffer) đoạn ngữ cảnh này, và sau kết quả tool của bước đó, nối thêm nó dưới dạng `user/message` được tiêm vào; session sẽ render nó như một message người dùng tổng hợp thông thường. Do đó, lời nhắc có thể nhìn thấy đối với model, có ghi nguồn gốc, và có thể tái tạo lại từ session log mà không cần thêm sự kiện session. Guard luôn ủy quyền thông qua `next()`, và đặt lời nhắc của riêng mình trước mảng ngữ cảnh của các quyết định downstream (áp dụng cho cả hai kết quả: lệnh gọi bị chặn cũng nhận được lời nhắc); mỗi mục giữ nguồn gốc và metadata riêng của nó.

## Trải nghiệm model

### Message ngữ cảnh cho ngưỡng đầu tiên

#### Model nhìn thấy gì

Khi đạt đến ngưỡng lặp lại liên tiếp đầu tiên đã cấu hình, agent tương ứng sẽ nhận được lời nhắc dưới đây. Hệ thống sẽ không thêm tool schema hay văn bản lệnh gọi thông thường.

##### Lời nhắc ngưỡng đầu tiên

```markdown
You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments instead of repeating the call.
```

#### Ảnh hưởng Token

Bằng 0 token trước khi đạt ngưỡng. Lời nhắc sẽ được giữ lại như một phần lịch sử của agent đó.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung mới xuất hiện sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

### Message ngữ cảnh cho các ngưỡng tiếp theo

#### Model nhìn thấy gì

Khi đạt đến các ngưỡng tiếp theo, agent sẽ nhận được mẫu lời nhắc chi tiết dưới đây. Bản xem trước tham số bị giới hạn nghiêm ngặt sẽ kết thúc bằng `… (+<omitted> more chars)`.

##### Lời nhắc cho các ngưỡng tiếp theo

```markdown
Repeated tool call detected:
- tool: <toolName>
- consecutive_calls: <count>
- arguments: <canonicalArguments>
The repeated calls are not making progress. Do not call this tool with these exact arguments again. Inspect the latest result and choose a different action, different arguments, or finish the task if enough evidence has been gathered.
```

#### Ảnh hưởng Token

Mỗi lời nhắc đều được giữ lại như một phần lịch sử; `argumentsPreviewChars` giới hạn độ dài văn bản tham số thay đổi theo dữ liệu, còn mỗi agent vẫn dùng bộ đếm độc lập.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung mới xuất hiện sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ phát hiện khớp chính xác**: quá trình chuẩn hóa sắp xếp sâu key, do đó các biến thể gần giống (đường dẫn chỉnh sửa nhẹ, thêm khoảng trắng vào giá trị) có thể vượt qua chain; khi chưa có bằng chứng về nhu cầu, hệ thống không áp dụng khớp mờ (fuzzy matching).
- **Compaction (nén) không reset chain**: chain vượt qua checkpoint compaction sẽ tiếp tục đếm.
- **Chỉ mang tính gợi ý**: việc nâng cấp thành `block` sau khi đạt ngưỡng cao hơn chưa được triển khai, nhưng `PostToolDecision` đã hỗ trợ chặn lệnh gọi.
- **Chain không được chia sẻ giữa các subagent**: chain luôn được cách ly theo agent; ngay cả khi parent agent và subagent của nó lặp lại cùng một lệnh gọi, bộ đếm cũng không được gộp lại.
- **Việc polling lặp đi lặp lại một cách hợp lý vẫn nhận được lời nhắc sau khi vượt ngưỡng**: có thể giải tỏa áp lực thông qua cấu hình `thresholds`／`exclude`.
- **Chain không tiếp tục nhắc nhở sau khi vượt ngưỡng cao nhất**: lời nhắc chỉ kích hoạt khi đạt chính xác số lần đã cấu hình, sau đó sẽ không tiếp tục gửi.
