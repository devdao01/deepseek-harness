# @deepseek-ai/dsh-client-schema-form

[English](README.md) | Tiếng Việt

Tầng mô hình schema/bản nháp cho trình chỉnh sửa settings. Phía wire, `settings.describe` mang schema schemastery đã serialize cho mỗi namespace (bao bọc ref của `schema.toJSON()`); `rehydrateSchema` dùng `new Schema(json)` để khôi phục (rehydrate) nó thành một bộ xác thực sống — đối tượng schema xác thực phần đó trên host chính là đối tượng xác thực bản nháp trong trình duyệt, do đó xác thực phía client không bao giờ lệch khỏi xác thực của Service Definition. Các trình chỉnh sửa tự render control của riêng mình (trang Models tự viết card xoay quanh các trường nó dò được tại đây); gói này không chứa React nào và không thực hiện bất kỳ việc render nào.

## Quy ước

Đơn vị chỉnh sửa là **bản nháp phần người dùng**: một đối tượng thông thường được chỉnh sửa theo cách bất biến (`setPath` sẽ hiện thực hóa các đối tượng trung gian, `deletePath` chính là reset từng trường — bỏ khóa đó đi, giá trị đã giải quyết sẽ quay về hợp nhất giữa base tổ hợp và giá trị mặc định của schema). Một trường chỉ cần xuất hiện trong bản nháp là được đánh dấu **đã ghi đè** (`hasPath`) — phán đoán dùng ngữ nghĩa tồn tại chứ không phải so sánh giá trị, tương ứng chặt chẽ với cách phân lớp của settings seam. `nodeAtPath` giải quyết node schema mà `settingsPath` — thư mục provider có thể cấu hình — trỏ tới (thuộc tính object giải quyết theo tên, mục dict qua `inner`), do đó trình chỉnh sửa có thể dò xem profile của một provider mang những trường nào (và `meta.role` của chúng) trước khi quyết định render gì; đường dẫn không giải quyết được trả về `undefined`, bên gọi do đó rõ ràng đi vào đường dẫn suy giảm thay vì render nhầm một cây con. `validateDraft(schema, draft)` chạy bộ xác thực đã khôi phục và trả về thông báo lỗi của nó, do đó trang có thể từ chối bản nháp không hợp lệ trước khi ghi.

## Trải nghiệm Model

Không có. Gói này hỗ trợ trình chỉnh sửa cấu hình trên trình duyệt; không có bất cứ nội dung nào ở đây đi vào yêu cầu model.

#### Tác động KV Cache

Không có; gói này không lắp ráp cũng không gửi yêu cầu provider.

## Hạn chế đã biết và công việc hoãn lại

- **Xây dựng lại schema sẽ thực thi phần bao bọc nhận được** — `rehydrateSchema` xây dựng lại một bộ xác thực schemastery sống, và schemastery hồi sinh các callback đã serialize bằng `new Function`, do đó envelope schema là nội dung có thể thực thi, không phải dữ liệu bất khả thi. Chỉ an toàn khi phần bao bọc đó đến từ cùng một host đáng tin cậy đã phục vụ trang này; giao thức này không có biểu diễn bất khả thi để dùng qua ranh giới tin cậy.
- **Xác thực ở cấp bản nháp, không phải theo từng trường** — `validateDraft` báo cáo thông báo lỗi đầu tiên của schemastery cùng `$.path` của nó; nó không ánh xạ lỗi tới từng control.
- **Không có renderer chung** — bên tiêu thụ tự xây form chuyên biệt theo tính năng trên các hàm hỗ trợ này. [Agent Note mặt phẳng cấu hình Web](../../../.agents/notes/implemented/architecture/2026-07-30-web-config-plane.md) ghi lại sự đánh đổi này.
