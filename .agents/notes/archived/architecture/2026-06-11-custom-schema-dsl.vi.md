# Agent Note: Dùng DSL schema công cụ tự định kiểu tùy chỉnh thay cho schemastery

Status: implemented
Archived: 2026-07-26

[English](2026-06-11-custom-schema-dsl.md) | 中文

## Vấn đề

Tham số công cụ phải đến mô hình dưới dạng JSON Schema chuẩn, đồng thời cho phép tác giả công cụ nhận tham số đã định kiểu trong `execute(args)` mà không cần type assertion. Schemastery đã được dùng cho cấu hình plugin, nhưng API dành cho tác giả công cụ cần một boolean `required: true` theo từng thuộc tính, thay vì mảng `required` độc lập của JSON Schema.

## Quyết định

Quyết định này đã bị thay thế bởi [DSL schema giá trị JSON thống nhất](2026-07-20-unified-json-value-schema-dsl.md); thiết kế mới giữ lại giao diện viết nhỏ gọn, đồng thời để tham số và giá trị đã định kiểu dùng chung một bộ từ vựng. `ParameterSchemaSpec` giữ `required: true` theo từng thuộc tính; `InferArgs<S>` ánh xạ các khóa bắt buộc thành thuộc tính không tùy chọn; `parameterSchemaSpecToJsonSchema()` biên dịch gốc đối tượng mở ngầm định; `defineTool()` nối liền việc suy luận kiểu, biên dịch và xác thực. `ToolDefinition` JSON Schema gốc vẫn là input mà `ToolRegistry.register()` chấp nhận, phục vụ MCP và các công cụ bên ngoài khác.

## Phương án thay thế đã cân nhắc

**Schemastery** (đã được đưa vào làm vendor, dùng cho Config của plugin) sau khi đánh giá đã bị bác bỏ: nó hướng tới xác thực/chuyển đổi dựa trên StandardSchema, không phải *sinh ra* JSON Schema, nên sẽ thêm một lớp gián tiếp mà vẫn không tạo ra định dạng giao thức (wire format) một cách gọn gàng.

## Hậu quả

- Tác giả công cụ bên thứ nhất có được tham số đã định kiểu mà không cần type assertion nào; chi phí thao tác kiểu (type gymnastics) nằm trong nội bộ package core (phù hợp với chính sách an toàn kiểu của AGENTS.md).
- Các node hiện tại, ràng buộc literal, union type, ranh giới giá trị JSON và quy tắc tính mở của đối tượng đều được định nghĩa bởi tài liệu thống nhất nêu trên.
- Ánh xạ `InferArgs` có test hồi quy ở tầng kiểu, xuất phát từ một bug về tính tùy chọn (optionality) trước đây.
