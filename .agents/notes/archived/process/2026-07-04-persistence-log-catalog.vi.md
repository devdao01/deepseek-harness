# Agent Note: Mục lục sinh tự động các sự kiện log bền vững

Status: implemented

Archived: 2026-07-27

[English](2026-07-04-persistence-log-catalog.md) | 中文

## Vấn đề

`SessionEventMap` là từ vựng của định dạng đĩa, nhưng khai báo của nó rải rác trong package session sở hữu và các phần gộp khai báo (declaration merging). Mục lục bền vững sinh tự động là tham chiếu duy nhất cho toàn bộ sự kiện, khai báo payload đầy đủ của từng cái, và JSDoc source, cùng với envelope `SessionEvent` dùng chung; bảng thủ công sẽ bị lệch dần, do đó đã bị loại bỏ. Các bản ghi này không phải là sự kiện Cordis — observer nhận chúng qua duy nhất một sự kiện bus `session/event` — nên mục lục Cordis không thể bao phủ. Generator sẽ phát hiện toàn bộ khai báo, và guard kiểm tra độ mới của tài liệu sẽ từ chối output bị thiếu hoặc lỗi thời.

## Quyết định

Sinh `docs/persistence-catalog.md` từ source code, kèm guard kiểm tra độ mới, như bề mặt tham khảo thứ tư: các *bản ghi* mà log session bền vững có thể chứa, bổ sung cho mục lục Cordis (kết nối), core data structure (từ vựng) và mục lục tool (tool).

`gen-persistence-catalog.ts` dùng AST TypeScript để quét mỗi `SessionEventMap` sở hữu và gộp khai báo. Nó bắt đầu render mỗi thành viên từ JSDoc phía trước cho đến hết kiểu payload đầy đủ, giữ lại comment thuộc tính lồng nhau và chỉ loại bỏ thụt lề của container chứa nó; đồng thời dán các khai báo `SessionEventType`, `SurfaceEventType`, `SurfaceOp` và `SessionEvent` sở hữu tạo thành envelope bền vững. Badge surface được suy ra, liên kết tham chiếu và vị trí source code vẫn nằm ngoài khối khai báo. Kiểm tra độ mới của tài liệu sẽ từ chối khi từ vựng hoặc thay đổi envelope chưa được sinh lại vào mục lục.

Các lựa chọn cụ thể:

- **Ép buộc tính đầy đủ JSDoc.** Mỗi thành viên và kiểu envelope được render đều phải có phần thân mô tả, JSDoc source đầy đủ sẽ được giữ gắn với khai báo của nó trong mục lục. Thẻ `@mode` là lỗi cứng: chế độ phân phối thuộc về sự kiện bus Cordis, bản ghi bền vững không có chế độ này. Mọi vi phạm được gộp thành một thông báo lỗi duy nhất, liệt kê từng vi phạm.
- **Badge surface được suy ra, không liệt kê thủ công.** `SurfaceEventType` (tập con sinh ra tin nhắn LLM và có thể mang `surfaceOp`) được parse từ khai báo union trong package sở hữu; nếu thành viên union đặt tên một sự kiện chưa khai báo thì là lỗi cứng (nếu không, thành viên union lỗi thời sẽ âm thầm không gắn nhãn gì cả). Phần còn lại luôn được render là **log-only**.
- **Hàng rào chuyên dụng.** Khối khai báo dùng chuỗi thông tin ` ```ts persistence-catalog ` mà `doc-typecheck` sẽ nhận diện và bỏ qua, loại chúng khỏi tỷ lệ opt-out — cách xử lý giống hệt với ` ts cordis-catalog ` (các khai báo này tham chiếu kiểu trong module sở hữu, không thể biên dịch độc lập).
- **Phạm vi toàn repo.** Mục lục liệt kê các package trong repo này, nhất quán với phạm vi chỉ-package của các tài liệu song hành; plugin downstream có thể gộp thêm loại sự kiện, chúng cố tình nằm ngoài phạm vi mục lục. Quá trình duyệt tự bảo vệ giả định của nó bằng lỗi cứng: `interface SessionEventMap` cấp cao nhất sở hữu phải là khai báo export duy nhất trong `@deepseek-ai/dsh-session` (interface không liên quan, cục bộ hoặc trùng tên không thể bị coi là từ vựng đĩa); không khai báo nào được mang `extends` (key kế thừa sẽ được thêm vào `keyof SessionEventMap` nhưng không có dòng mục lục tương ứng); mỗi thành viên phải là property signature có kiểu payload tường minh (thành viên dạng phương thức sẽ được thêm vào `keyof` nhưng bị bỏ sót âm thầm khi duyệt); thành viên trùng lặp giữa các khai báo cũng sẽ khiến quá trình thất bại.

Phương án này thay thế các bản sao thủ công: bảng `hook/*` trong session.md, bảng sự kiện trong README rút gọn, danh sách mục payload trong README hook-protocol, và danh sách tên trong README session giờ liên kết đến mục lục, không còn nhắc lại payload (văn bản giải thích ngữ nghĩa xung quanh vẫn giữ nguyên vị trí). Hai thẻ `@mode emit` bị thêm nhầm trên thành viên gộp của hook-protocol đã bị loại bỏ — gate mới sẽ từ chối chúng như một lỗi phân loại.

## Các phương án đã cân nhắc

- **Generator dựa trên khởi động (giống mục lục tool)**: từ vựng log hoàn toàn tĩnh, việc duyệt AST không cần khởi động bất cứ thứ gì để đọc toàn bộ sự thật.
- **Giữ bản sao thủ công**: bản sao thủ công chỉ có thể kiểm tra những tên tác giả đã viết ra; khi mục lục lên production, ghi chú gộp trong README session đã bị lệch.

## Hậu quả

- Mục lục sẽ không bị lệch: thay đổi từ vựng hoặc envelope không được phản ánh trong file đã commit sẽ làm `doc-sync` và `verify-persistence-catalog` trong CI thất bại, còn sự kiện gộp mới thiếu JSDoc sẽ khiến generator thất bại ngay lập tức — plugin không thể thêm loại bản ghi đĩa chưa được viết tài liệu.
- Phần thân sự kiện chỉ có một chủ sở hữu duy nhất là JSDoc tại nơi khai báo; mục lục sẽ giữ lại JSDoc đó và toàn bộ comment trường lồng nhau, không trải phẳng hay diễn giải lại.
- Union `SurfaceEventType` giờ mang ý nghĩa cấu trúc đối với tài liệu: đổi tên sự kiện mà không cập nhật union (hoặc ngược lại) sẽ khiến generator thất bại, chứ không chỉ compiler thất bại.
- Việc suy ra badge giả định union luôn là một tập đóng các chuỗi literal và chỉ có một chủ sở hữu; nếu tái cấu trúc lệch khỏi hình dạng này, generator phải được cập nhật trong cùng thay đổi.
