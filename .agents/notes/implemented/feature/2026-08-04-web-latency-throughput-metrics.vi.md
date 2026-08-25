# Agent Note: Chỉ số độ trễ/thông lượng cấp lượt và cấp cửa sổ trên Web

Status: implemented

[English](2026-08-04-web-latency-throughput-metrics.md) | 中文

## Vấn đề

Chat Web đã ghi lại thời gian LLM (mô hình ngôn ngữ lớn) theo từng bước (`stepStartTime`/`firstTokenTime`/`completedTime`) và usage theo từng bước, view trajectory cũng hiển thị chúng theo bước, nhưng giao diện chat không trả lời được cả "lượt phản hồi này nhanh cỡ nào" lẫn "session này chạy nhanh cỡ nào": footer của assistant chỉ hiển thị thời gian thực tế đã chạy của lượt, dòng thống kê cũng chỉ quy đổi tổng thời gian thực (wall clock).

## Quyết định

Logic quy đổi `chat/turn-metrics.ts` trong package `ui-conversation` là nơi duy nhất suy ra chỉ số độ trễ/thông lượng từ node assistant. `assistantStepReading` chuyển một node thành một lần đọc theo bước: TTFT (độ trễ token đầu tiên) cần cả `stepStartTime` lẫn `firstTokenTime` cùng tồn tại, thời lượng decode cần `firstTokenTime`, thời lượng âm bị kẹp về không, số token output chỉ được chấp nhận khi giá trị `usage` không đáng tin cậy là hữu hạn và không âm. `deriveTurnMetrics` quy đổi lần đọc theo từng lượt: bước có số thứ tự nhỏ nhất giữ slot TTFT của lượt đó, thông lượng dùng tổng số token output của "các bước mang cả hai giá trị" chia cho tổng thời lượng decode, nên các bước thiếu mẫu sẽ trực tiếp bị loại thay vì làm sai lệch tỷ lệ; lượt không có cả hai con số sẽ không tạo mục nào.

Footer của assistant sẽ thêm các chỉ số này vào phần tử thời gian phụ vốn đã hiển thị khi hover, ngay sau `Đã chạy`, dạng `Token đầu {s}s · {tps} tok/s`, con số nào chưa ghi lại sẽ được bỏ qua. ChatView chỉ hiển thị chỉ số khi mục `turnTimings` của lượt đó có `endTime`: cửa sổ đã tải là một hậu tố liên tục của log, nên lượt đã quyết toán trong cửa sổ chắc chắn mang theo toàn bộ các bước của nó, TTFT của bước đầu tiên là giá trị thật chứ không phải sản phẩm của việc cửa sổ bị cắt. `formatLatencySeconds` không kèm đơn vị, mỗi template ngôn ngữ tự có hậu tố giây riêng (`TTFT {seconds}s`/`Token đầu {seconds}s`).

Dòng thống kê tái sử dụng cùng bộ đọc theo bước đó trong phần quy đổi theo cửa sổ của nó: `deriveStats` cộng dồn tổng/đếm TTFT và thời lượng decode/số token, render nhóm độ trễ/thông lượng đã bản địa hóa qua namespace locale `conversation` (tiếng Việt là `Token đầu trung bình … · … tok/s`) cạnh thời gian thực LLM/công cụ. Nhãn cho số lượt, số bước, thời lượng, cache và token cũng dùng chung namespace này. Giống các con số thời gian thực khác, nhóm này có phạm vi theo cửa sổ, không quy đổi bất kỳ khoản tính phí nào; sổ sách token vẫn thuộc về phần chiếu token-meter.

## Các phương án thay thế đã cân nhắc

**Phần chiếu session bền vững (hình thái token-meter).** Quy đổi thời gian theo bước phía host bằng `ProjectionDefinition` có thể vượt qua compaction (nén) và phân trang cửa sổ, bao phủ toàn bộ log. Đây là hoãn lại chứ không phải bác bỏ: trạng thái phần chiếu phải giữ O(1) (chỉ có thể lấy trung bình, không thể lấy phân vị), nó cần thay đổi host cộng với schema, còn sự thật thời lượng của dòng thống kê chat vốn đã được ghi lại theo phạm vi cửa sổ — nhóm mới này theo cùng phạm vi đó. PR (Pull Request) sau này có thể bổ sung phần chiếu bền vững mà không cần di chuyển các con số đọc này.

**Phần tử phụ theo từng bước ở footer.** Để mỗi tin nhắn assistant hiển thị TTFT riêng của nó sẽ gắn phần tử phụ lên các node tường thuật giữa lượt, trong khi thiết kế footer cố tình giữ chúng không có chrome; view trajectory đã phơi bày chi tiết thời gian theo từng bước rồi.

**Dùng sự hiện diện của node thay vì thời gian `turn/end` để gate footer.** Render trực tiếp các bước tình cờ được tải sẽ hiển thị một TTFT trông có vẻ hợp lý nhưng thực chất là "bước đầu tiên đã tải" sau phân trang. Việc gate bằng `endTime` cộng bất biến cửa sổ hậu tố khiến con số hiển thị hoặc là độ trễ bước đầu thật của lượt đó, hoặc không hiển thị gì cả.

## Hệ quả

Footer của lượt đã quyết toán trong cửa sổ hiển thị `Token đầu`/`tok/s` sau thời gian thực đã chạy khi hover, dòng thống kê hiển thị độ trễ và thông lượng trung bình theo cửa sổ bằng nhãn bản địa hóa cạnh thời gian thực, toàn bộ quá trình không thêm sự kiện session mới, không sửa host. Chỉ số giáng cấp bằng cách bỏ qua: nhà cung cấp hoặc bước không có mẫu thời gian hay usage chỉ đơn giản mất con số tương ứng, chứ không render thành số không. Lịch sử cũ hơn ngoài cửa sổ đã tải vẫn không được tính vào, điều này đã được ghi lại trong giới hạn của dòng thống kê ở README của package.

Cả hai con số đọc đều đến từ thời gian thực đo được, nên đều không thể tái tạo chính xác lần sau: TTFT là hiệu số thời gian `firstTokenTime - stepStartTime`, còn thông lượng dùng thời lượng decode thực `completedTime - firstTokenTime` làm mẫu số. Cùng một kịch bản phát lại chạy hai lần liên tiếp trên cùng một máy cho ra 69 và 70 tok/s, còn một luồng phát lại dài 3 mili giây sẽ đọc thành 26333 tok/s. Vì vậy, golden aria của Web, ngoài `{{duration}}` sẵn có, còn chuẩn hóa thông lượng thành `{{throughput}}`; dấu phân cách trang trí của footer cũng được thêm khoảng trắng hai bên — nếu không có chúng, các con số này sẽ dính liền thành một chuỗi văn bản không có ranh giới cho khả năng tiếp cận (`Ran for 13sTTFT 0.2s12 tok/s`), vừa khiến trình đọc màn hình mất ranh giới giữa các con số, vừa khiến `{{duration}}` mất ranh giới từ mà nó cần để khớp.
