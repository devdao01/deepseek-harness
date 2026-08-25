# Agent Note: Kiểm tra hợp lệ tham số runtime tại ranh giới với model

Status: implemented

[English](2026-06-11-runtime-arg-validation.md) | 中文

## Vấn đề

`defineTool` ([DSL schema thống nhất](2026-07-20-unified-json-value-schema-dsl.md)) cung cấp cho tác giả tool tham số có kiểu cho `execute(args)` được ánh xạ qua `InferArgs<S>`. Nhưng kiểu đó chỉ là khai báo compile-time cho một giá trị runtime, mà giá trị này thực chất là JSON do model sinh ra: không có cơ chế nào bắt buộc model tuân theo schema, vì vậy lời gọi dị dạng (thiếu key bắt buộc, truyền string vào vị trí khai báo là số, hoặc literal nằm ngoài tập hợp đã khai báo) vẫn sẽ đến `execute` ở trạng thái "chỉ có kiểu trên danh nghĩa". Thân hàm tool sau đó hoặc là crash khi xử lý dữ liệu sai cấu trúc, hoặc hành xử bất thường mà không báo lỗi.

## Quyết định

`validateArgs(spec, args): string[]` biên dịch `ParameterSchemaSpec`, và ủy quyền cho bộ duyệt (traverser) `validateJsonSchemaValue()` dùng chung, trả về danh sách vi phạm có thể đọc được đối với các khai báo có định dạng đúng. `defineTool` chụp snapshot tham số schema đã biên dịch tại thời điểm định nghĩa, và thực hiện kiểm tra trước khi gọi thân hàm có kiểu; khi có vi phạm sẽ ném `ToolArgsError` (`INVALID_ARGS`), registry trả về lỗi này như một kết quả lỗi mà model có thể dựa vào để sửa.

Do đó validator và compiler chia sẻ ngữ nghĩa hoàn toàn nhất quán: gốc tham số ngầm định là object mở; key bắt buộc chỉ đến từ `required: true`; giá trị mặc định vẫn chỉ là chú thích; object lồng nhau khai báo tường minh tuân theo tính mở đã khai báo; mảng được kiểm tra đệ quy qua `items`; ràng buộc literal vô hướng đảm bảo đúng kiểu; `oneOf` chỉ được chấp nhận khi đúng một nhánh khớp. Các tool đăng ký trực tiếp tự chịu trách nhiệm kiểm tra input của mình.

## Hệ quả

- Model nhận được phản hồi có thể hành động về lời gọi dị dạng của chính nó, thay vì gặp phải crash không rõ ràng, thu hẹp khoảng cách giữa cam kết của `InferArgs` và thực tế runtime.
- Validator và `InferArgs` phải giữ nhất quán; một [property-based test](../testing/2026-06-11-property-based-testing.md) sinh ra tham số thỏa mãn spec và khẳng định chúng vượt qua `validateArgs` (đồng thời khẳng định bị từ chối khi cố ý làm hỏng tham số một cách có chủ đích), loại bỏ nguy cơ trôi dạt (drift) này bằng kiểm tra tự động.
- `ToolArgsError` là lớp con của `HarnessError` trong [hệ phân loại lỗi có cấu trúc](2026-06-11-structured-error-taxonomy.md), giữ nguyên trường `code`; caller chỉ đọc `.message` không bị ảnh hưởng bởi cấu trúc phân cấp này.
- Chi phí kiểm tra là không đáng kể so với một lần gọi model.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
