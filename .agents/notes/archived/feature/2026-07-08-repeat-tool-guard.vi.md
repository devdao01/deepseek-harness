# Agent Note: Plugin bảo vệ chống lặp lại tool call

Status: implemented
Archived: 2026-07-27

[English](2026-07-08-repeat-tool-guard.md) | 中文

## Vấn đề

Khi model rơi vào vòng lặp, nó sẽ lặp đi lặp lại cùng một tool call với tham số giống hệt nhau ở cấp byte — chạy lại một lệnh grep thất bại, đọc lại một file không thay đổi, poll một lệnh đã trả lời rồi — mỗi vòng qua lại đều tiêu tốn token, thời gian thực và (đối với API trả phí) tiền bạc, nhưng không mang lại thông tin mới. Hiện tại harness không có cơ chế nào nhận biết điều này: vòng lặp không có ngân sách bước, không có plugin nào theo dõi việc lặp lại lời gọi, và model chỉ thoát ra được nếu tình cờ tự thay đổi hành vi. Mẫu hình thất bại này có thật và chi phí phát hiện rất thấp — [pi-repeat-tool-guard](https://github.com/Kingwl/pi-repeat-tool-guard) chính là một extension dạng này cho pi coding-agent: đếm số lần gọi giống hệt liên tiếp, khi vượt ngưỡng thì thêm một `<system-reminder>` bảo model dừng lặp lại và đổi hướng.

Harness đã có sẵn toàn bộ seam mà extension pi sử dụng, và còn tốt hơn: [Agent Note về seam chặn](2026-06-30-interception-seams.md) trao cho `tools/post-execute` một cách được công nhận để gắn ngữ cảnh hướng-tới-model vào lời gọi đã hoàn tất; vòng lặp đệm ngữ cảnh đó và tiêm vào trong khi vẫn giữ tính liền kề call/result; ngữ cảnh được tiêm là một `context/message` đã được ghi lại — nên guard gốc không cần thêm sự kiện phiên mới mà vẫn thỏa quy tắc "model-visible ⟺ logged". Thứ còn thiếu chỉ là bản thân plugin.

## Quyết định

Guard này là một plugin vệ sinh vòng lặp (loop hygiene), không phải một tool hướng-tới-model. Nó đếm số lần gọi liên tiếp cùng một tool với tham số đã chuẩn hóa giống nhau, và tiêm một lời nhắc mang tính gợi ý tại ngưỡng đã cấu hình. Nó không bao giờ trì hoãn, chặn hay viết lại lời gọi; model tự quyết định thử lại theo cách khác hay kết thúc.

Plugin có tên `@deepseek-ai/dsh-repeat-tool-guard`, nằm ở `packages/guard/repeat-tool-guard/`, mở ra nhóm `guard/` dùng cho các plugin vệ sinh vòng lặp (đã có tiền lệ nhóm một-package: [Agent Note todo-write](2026-06-29-todo-write-tool.md) đã phát hành `todo/tool-todo`). Nó đăng ký hai listener, lưu trạng thái trong một `WeakMap` được khóa theo đối tượng `Agent` còn sống — tool registry là singleton cấp context, waterfall (sự kiện dạng thác nước) của nó đan xen lời gọi của mọi agent (subagent chạy trên cùng một context), nên việc khóa theo agent là yêu cầu về tính đúng đắn, không phải phần thêm cho đẹp; khóa theo đối tượng yếu cũng khiến listener dispose chỉ để dọn dẹp trở nên không cần thiết.

- **`tools/post-execute` (waterfall)** — điểm phát hiện duy nhất. Listener nhận đồng thời `(exec, result)`, nên việc đếm và gửi lời nhắc không cần một pending map xuyên sự kiện (extension pi cần nó chỉ vì hook `tool_call`/`tool_result` của nó tách rời). Nó luôn ủy quyền qua `next()`, và khi chạm ngưỡng, prepend lời nhắc vào `additionalContexts` của quyết định downstream — đây chính là tư thế "quan sát và làm giàu" mà [cầu nối hook](2026-06-30-hook-bridges.md) đã áp dụng, tuân thủ hợp đồng waterfall. Việc đếm đặt ở đây thay vì `tools/pre-execute`, vì post-execute cũng kích hoạt cho các lời gọi bị từ chối (`ToolRegistry.execute` định tuyến deny vào cùng pipeline đó), và việc model liên tục gõ vào một lời gọi bị từ chối chính là vòng lặp đáng phá vỡ.
- **`agent/prompt-submit` (waterfall)** — hook reset thuần túy: ủy quyền qua `next()`, xóa chuỗi của agent gửi. Sự can thiệp của người dùng làm thay đổi ngữ cảnh; việc lặp lại xuyên qua can thiệp không phải là vòng lặp.

### Ngữ nghĩa phát hiện

Khóa của chuỗi là `(tên tool, tham số chuẩn hóa)`; lời gọi giống với lời gọi được theo dõi trước đó sẽ tăng bộ đếm liên tiếp của agent đó, lời gọi được theo dõi khác đi sẽ reset về 1. Cách chuẩn hóa là sắp xếp khóa theo chiều sâu cộng `JSON.stringify`: theo cấu trúc, `ToolExecution.arguments` là kết quả của `JSON.parse` trong vòng lặp (hoặc fallback về chuỗi thô cho JSON tham số sai định dạng, bản thân nó cũng là giá trị có thể so sánh), nên cách xử lý bigint/tham chiếu vòng/`undefined` của bản gốc pi không có đầu vào ở đây và bị loại bỏ có chủ đích.

Hai quy tắc có chủ đích, cả hai đều được ghi trong [README của package](../../../../packages/guard/repeat-tool-guard/README.md) vì đây là hành vi mà nếu không, người đọc chỉ có thể đoán:

- **Lời gọi không được theo dõi trong suốt đối với chuỗi.** Lời gọi bị `include`/`exclude` loại trừ không tăng cũng không reset bộ đếm, nên `grep X → todo_write → grep X` vẫn được tính là hai lần `grep X` liên tiếp khi `todo_write` bị loại trừ. Đây chính là lý do khiến tính năng loại trừ hữu ích — các tool ghi sổ xen giữa vòng lặp không được "rửa trắng" cho vòng lặp — và cũng là ngữ nghĩa (chưa được viết tài liệu) của extension pi, được giữ lại có chủ đích và ghi rõ ra đây.
- **Lời gọi không có agent bị bỏ qua.** Bên gọi trực tiếp `ctx.tools.execute()` (test, bên tiêu thụ không thuộc vòng lặp) không có model nào để nhắc và không có đối tượng agent còn sống để làm khóa.

### Gửi lời nhắc

Lời nhắc được gắn kèm như một mục độc lập trong `additionalContexts` (source là `{kind: 'plugin', plugin: 'repeat-tool-guard'}` — theo `HookContext`, nhãn này mang ngữ nghĩa), không bao giờ thay thế `content`: sự kiện `tool/result` vẫn là đầu ra kiểm toán của chính tool đó, còn vòng lặp thì đệm ngữ cảnh sau kết quả bước và thêm nó vào dưới dạng `context/message`, phiên sẽ render nó thành envelope user tổng hợp có gắn nhãn, và được lịch sử suy diễn phát lại. Ngưỡng leo thang theo cấp: ngưỡng cấu hình đầu tiên nhận một lời nhắc ngắn gọn "bạn đang lặp lại chính mình, hãy phân tích kết quả trước đó"; các ngưỡng sau nhận dạng chi tiết hơn, bao gồm tool, số lần lặp và tham số chuẩn hóa (cắt ở đầu theo `argumentsPreviewChars`, mặc định 500 — payload cấp `write` trong vòng lặp không được đi vào request kế tiếp một cách không giới hạn; khóa của chuỗi luôn so sánh chuỗi chuẩn hóa đầy đủ), và giải thích rằng các lời gọi này không đạt được tiến triển. Bản gốc pi hard-code văn bản nhẹ nhàng với số đếm literal là 3; guard này dùng `thresholds[0]` làm khóa, sửa lỗi này trong quá trình chuyển đổi. Đóng góp của cầu nối hook downstream vẫn là mục mảng độc lập, nên cả hai plugin đều giữ nguyên source, envelope và metadata riêng của mình.

### Cấu hình

```yaml
- id: repeat-tool-guard
  name: '@deepseek-ai/dsh-repeat-tool-guard'
  config:
    thresholds: [3, 5, 8]        # default; consecutive counts that trigger a reminder
    include: []                  # tool-name patterns to track; empty ⇒ all tools
    exclude: [todo_write]        # tool-name patterns transparent to the chain
    argumentsPreviewChars: 500   # default; cap on arguments quoted in the detailed reminder
```

`thresholds` được kiểm tra hợp lệ lúc load, và ném ngoại lệ khi gặp danh sách rỗng, giá trị không phải số nguyên, nhỏ hơn 2, hoặc trùng lặp — cấu hình sai thất bại nhanh, thay cho việc bản gốc pi âm thầm quay về mặc định. Mục `include`/`exclude` hỗ trợ ký tự đại diện `*`. Mẫu là vị từ (predicate) đối với các tool thực sự tồn tại tại thời điểm gọi, không phải tham chiếu tới mục trong registry, nên mục không khớp với tool nào đang đăng ký hiện tại không phải là lỗi — khác với kiểm tra tham chiếu của `toolOrder`, `exclude: [mcp_*]` vẫn phải hợp lệ ngay cả ở triển khai chưa load tool MCP.

## Kiểm thử

- **Unit test:** dùng vòng lặp thật với adapter kịch bản hóa, bao phủ quy tắc đếm và reset, tính trong suốt của lời gọi không theo dõi, dọn dẹp dispose (giải phóng tài nguyên), cách ly theo agent, thứ tự khóa tham số chuẩn hóa, leo thang, lời gọi bị từ chối, thực thi không có agent, escape ký tự đại diện, cấu hình không hợp lệ, và quyết định chặn hoặc thay thế downstream, đạt độ phủ 100% theo từng file.
- **Snapshot test:** kịch bản `repeat-tool-guard` không cần key phát ra năm lần cùng một lời gọi `todo_write`, cố định lời nhắc nhẹ nhàng ở lần gọi thứ ba và lời nhắc chi tiết ở lần gọi thứ năm trong đầu ra ACP và session log. Plugin này được load trong ví dụ thời gian thực nhưng vẫn im lặng trong các kịch bản khác.
- **E2e test:** không có. Plugin này mang tính xác định và không phụ thuộc vào bên cung cấp, hợp đồng seam của nó được bao phủ bởi chủ sở hữu tương ứng.

## Các phương án thay thế đã cân nhắc

- **Thêm lời nhắc vào tool result** (bằng cách `accept` để thay thế `content` — cơ chế của extension pi, nó vá nội dung result vì đó là kênh duy nhất mà API của nó cung cấp): bác bỏ. Điều này khiến `tool/result` đã ghi lại nói dối về nội dung tool thực sự trả về, trong khi `additionalContexts` là kênh chú thích độc lập được công nhận cho post-execute, và việc đệm ở cấp vòng lặp giữ được tính liền kề call/result.
- **Đếm ở `tools/pre-execute` và dùng pending-reminder map** (hình thái hai giai đoạn của pi): bác bỏ. Chỉ riêng post-execute đã có thể thấy đồng thời `(exec, result)` và cũng kích hoạt cho lời gọi bị từ chối, nên một listener, không có trạng thái xuyên sự kiện, có thể bao phủ nghiêm ngặt nhiều hơn với ít cơ chế hơn.
- **Leo thang thành `block` ở ngưỡng cao nhất**: bác bỏ trong phạm vi ban đầu. Chặn lời gọi sẽ trừng phạt việc lặp lại giống hệt hợp lệ (poll một terminal chạy lâu, kiểm tra lại file mà agent dự kiến sẽ thay đổi), trong khi lời nhắc gợi ý giữ cho model quyền kiểm soát. Sẽ xem xét lại khi có bằng chứng; hình dạng quyết định (`PostToolDecision`) đã hỗ trợ tùy chọn này.
- **Hook ngoài theo từng triển khai qua cầu nối CC/Codex** (một script `PostToolUse`): bác bỏ như câu trả lời cuối cùng. Nó hiệu quả cho một triển khai đơn lẻ, nhưng một plugin đã phát hành, có unit test, cấu hình được qua `cordis.yml` mới là hình thái gốc của harness, và không có chi phí subprocess cho mỗi lời gọi.
- **Đặt ngân sách bước hoặc ngân sách lặp lại ở cấp vòng lặp trong `agent-loop`**: bác bỏ. "Dùng plugin, không đổi vòng lặp"; ngân sách bước cứng là một kiểm soát trực giao thô hơn, cần đề xuất riêng của nó.
- **Phát hiện gần đúng/tương tự** (chuẩn hóa đường dẫn, tham số tương tự nhưng không giống hệt): bác bỏ. So khớp chính xác sau chuẩn hóa có chi phí thấp, mang tính xác định và có thể giải thích cho model; ngưỡng tương tự đưa vào rủi ro báo động giả, cần bằng chứng mới đổi được độ phức tạp.
- **Đặt package vào `core/`**: bác bỏ. Core là trục sản phẩm chính; guard hành vi là plugin lá tùy chọn, tiền lệ của `todo/` là mỗi họ plugin một nhóm nhỏ chuyên biệt.

## Hệ quả

- Lời nhắc mang tính gợi ý theo thiết kế: mẫu poll idempotent lặp lại cùng lời gọi có chủ đích vẫn sẽ nhận được nhắc nhở sau khi vượt ngưỡng, van giảm áp là cấu hình (`thresholds`, `exclude`) cộng với văn bản lời nhắc rõ ràng cho phép "kết thúc khi đã thu thập đủ bằng chứng". Mỗi lần kích hoạt tăng chi phí token lời nhắc trong request kế tiếp; ngưỡng giới hạn tần suất kích hoạt.
- Trạng thái chuỗi chỉ tồn tại trong bộ nhớ: phiên được khôi phục từ persist bắt đầu với chuỗi hoàn toàn mới, nên vòng lặp xuyên qua việc khôi phục nhận lời nhắc muộn hơn so với vòng lặp thời gian thực — chấp nhận được, guard là gợi ý heuristic chứ không phải invariant đã ghi lại, và lợi ích của việc lưu bền vững trạng thái bộ đếm không đáng với độ phức tạp của nó.
- Khi nhiều bên sinh post-execute cùng gắn ngữ cảnh vào cùng một lời gọi, mỗi đóng góp vẫn là `HookContext` độc lập; thứ tự tuân theo quan hệ lồng nhau của waterfall, mỗi mục giữ nguồn gốc riêng của nó.
- Khi triển khai lớp snapshot, một giả định ẩn của suite kit đã lộ ra: fixture guard đồng nhất "kịch bản model đã soạn" với "được điều khiển bởi override". `Scenario` giờ đây mang cờ `overridden` tường minh, và việc tồn tại của sidecar được đối chiếu hai chiều với cờ đó (sidecar rời rạc chưa đăng ký sẽ âm thầm thay thế script suy diễn) — suite kit nghiêm ngặt hơn trước khi có plugin này.

## Việc hoãn lại

- Compaction (nén) không reset chuỗi: lịch sử sau compaction thay đổi những gì model thấy, nhưng rủi ro lặp lại thường vẫn tồn tại sau compaction.
- Leo thang thành `block` ở ngưỡng cao chưa được triển khai; `PostToolDecision` đã hỗ trợ tùy chọn này, chờ bằng chứng để bật.
- Chuỗi của subagent được cách ly theo agent; chưa có cơ chế dùng chung cho tới khi xuất hiện use case cụ thể.
