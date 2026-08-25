# Agent Note: Schema công cụ là một phần của việc lắp ráp system prompt

Status: implemented
Archived: 2026-07-27

[English](2026-06-11-tool-schemas-in-prompt-assembly.md) | 中文

## Vấn đề

Ở tầng định dạng giao thức (wire format), schema công cụ được truyền qua trường `tools` chuyên dụng trong request tới mô hình, chứ không nhúng vào văn bản prompt. Tuy nhiên, xét về kiến trúc, "mô hình được cho biết nó có thể làm gì" là một mối quan tâm thống nhất: các đoạn prompt và danh sách công cụ được lắp ráp từ cùng các đóng góp của plugin, và được tiêu thụ tại cùng một thời điểm.

## Quyết định

`PromptAssembly { sections, tools }`: dịch vụ system prompt thu thập đồng thời các đoạn văn bản có thứ tự và schema công cụ (registry công cụ tự động đóng góp một provider). Agent loop (vòng lặp agent) tiêu thụ một bản assembly ở mỗi bước; adapter ánh xạ `sections` vào slot system của provider, ánh xạ `tools` vào trường `tools` của định dạng giao thức. Do đó waterfall (sự kiện dạng thác nước) `system-prompt/assemble` là điểm chặn duy nhất cho mọi thông tin mà mô hình được biết trước: lọc công cụ (ToolSearch / công bố dần) chỉ là một lần viết lại assembly, không khác gì chỉnh sửa prompt.

## Phương án thay thế đã cân nhắc

**Vòng lặp truy vấn riêng biệt từ registry công cụ và dịch vụ prompt**: tách một mối quan tâm thống nhất thành hai seam; bất kỳ điểm chặn nào muốn ảnh hưởng đến "mô hình được cho biết điều gì" (lọc công cụ, chế độ plan) đều cần gắn một listener trên cả hai giao diện, thay vì chỉ cần viết lại assembly một lần.

## Hậu quả

- Một waterfall duy nhất quản lý toàn bộ ngữ cảnh thường trực của mô hình; các plugin như chế độ plan có thể thay thế cả văn bản prompt lẫn công cụ hiển thị trong cùng một listener.
- Giao diện assembly có thể mở rộng qua gộp khai báo (declaration merging) (không có gói `extras` phi kiểu — mở rộng chính là gộp khai báo), để dành chỗ cho các slot trong tương lai.
- Việc đặt schema trong dịch vụ "prompt" tạo cảm giác bất ngờ nhẹ về mặt khái niệm, đã được giải thích trong tài liệu này và README của package.
