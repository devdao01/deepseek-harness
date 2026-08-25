# Agent Note: Chế độ ẩn của TUI gộp các bước assistant trong một lượt thành một tin nhắn

Status: implemented

Archived: 2026-08-04

[English](2026-07-29-tui-hidden-mode-assistant-fold.md) | 中文

## Vấn đề

Giai đoạn ẩn của Ctrl+O ([trình bày TUI hợp nhất](../architecture/2026-07-28-consolidated-tui-presentation.md)) loại bỏ thẻ tool, khiến transcript đọc như một đoạn hội thoại, nhưng mỗi bước model vẫn render tiêu đề `Assistant` của riêng nó. Do đó, một lượt nhiều bước (văn bản → tool → văn bản) sẽ hiển thị nhiều khối `Assistant` liên tiếp, ở giữa trống rỗng — mà thẻ tool bị loại bỏ chính là lý do duy nhất từng khiến tiêu đề lặp lại tồn tại. Việc đọc hội thoại thuần túy kiểu Codex cần mỗi lượt chỉ có một tin nhắn assistant.

## Quyết định

Chế độ ẩn đồng thời cũng là một quy tắc gộp, và được triển khai thuần túy như một cách trình bày của TUI: trong mỗi lượt, bước đầu tiên có nội dung render có thể nhìn thấy (có văn bản, hoặc có reasoning khi hiển thị reasoning đang bật) sở hữu tiêu đề `Assistant` duy nhất của lượt đó; các bước còn lại được render như đoạn tiếp nối không có tiêu đề, còn các bước không có nội dung hiển thị thì không render gì cả — bước chỉ có lời gọi tool không chiếm tiêu đề, cũng không để lại đoạn trống. Giai đoạn gấp (folded) và mở rộng (expanded) giữ nguyên tiêu đề riêng của từng bước; rời khỏi giai đoạn ẩn sẽ khôi phục lại chúng.

Cơ chế: `StreamingAssistantComponent` mang theo `StepPosition` của riêng nó và một cờ trình bày `setFoldedContinuation`; `createTuiChat` duy trì danh sách component theo từng bước cho mỗi lượt, và suy lại việc gộp khi có Ctrl+O, mỗi chunk text/reasoning đang stream, khi tin nhắn kết thúc (settle), và khi một luồng lỗi bị thu hồi (có thể chuyển giao tiêu đề cho bước tiếp theo). Việc tái tạo transcript sẽ xóa map này và phát lại log, do đó khôi phục, thay thế do nén, đổi kích thước và chuyển đổi theme đều hội tụ về cùng kết quả gộp. Footer đếm thời gian theo bước vẫn giữ nguyên quy thuộc theo bước, không bị ảnh hưởng.

## Các phương án đã cân nhắc

- **Gộp nhiều bước thành một component** — xung đột với vòng đời streaming theo từng bước, việc thu hồi khi retry và footer đếm thời gian; thêm cờ vào component hiện có chỉ thay đổi tiêu đề và khoảng cách đầu dòng.
- **Gộp trong session log hoặc trong `deriveMessages`** — thay đổi lịch sử bền vững / model có thể nhìn thấy chỉ vì một chế độ đọc UI; log giữ nguyên hình dạng theo từng bước.
- **Gộp ở mọi giai đoạn hiển thị** — giai đoạn gấp / mở rộng xen kẽ thẻ tool giữa các bước, khi đó tiêu đề của mỗi bước dùng để phân định output nào thuộc bước nào.

## Hậu quả

Chế độ ẩn giờ đọc như một tin nhắn assistant cho mỗi lượt; các lượt vẫn được phân cách bởi tiêu đề riêng. Việc gộp là trạng thái được tính lại, không bao giờ lưu trữ, do đó session và định dạng bền vững không thay đổi. Bao phủ: unit test TUI bao phủ số đếm tiêu đề trong vòng lặp Ctrl+O, việc chuyển giao tiêu đề bước đầu chỉ có tool, phân cách theo lượt, và hội tụ giữa streaming thời gian thực + tái tạo; snapshot không cần key `tool-cards-hidden-folded` cố định các khung hình sau khi gộp.
