# Agent Note: Hệ phân loại lỗi có cấu trúc

Status: implemented

[English](2026-06-11-structured-error-taxonomy.md) | 中文

## Vấn đề

Sự cố khi vượt qua seam chỉ là các string trần trụi. Lỗi tool bị làm phẳng thành một khối text (name, code và stack đều bị mất), khiến các plugin sandbox/retry trong tương lai không thể phân biệt ENOENT với EACCES, và model cũng không nhận được phản hồi có thể hành động vốn có thể cung cấp được. Việc throw không phải Error còn thoái hóa nghiêm trọng hơn: agent loop (vòng lặp agent) bọc nó thành `new Error(String(x))`, làm mất toàn bộ code. Trong khi đó `LlmError` là lỗi có kiểu duy nhất trong hệ thống, không có base class chung, các bên tiêu thụ không thể `instanceof` một cách tổng quát trên nó.

## Quyết định

Đưa vào một base class `HarnessError extends Error` trong `dsh-llm` (package lá, mọi package khác đều đã phụ thuộc vào nó, không tạo thêm cạnh phụ thuộc mới): `code` ổn định (tách khỏi `message`), liên kết `cause` qua `ErrorOptions`, `name` mặc định là tên lớp con. `isHarnessError` thu hẹp kiểu tại seam.

- `LlmError` và `ToolArgsError` (dsh-tools) kế thừa base class này, giữ nguyên code sẵn có của mỗi loại.
- `ToolExecutionResult` thêm trường tùy chọn `error: { name, code }`, được điền trong catch của registry khi giá trị ném ra là `HarnessError`. agent loop chuyển tiếp giá trị này tới event session `tool/result` (event này cũng được thêm cùng trường tùy chọn), giữ lại thông tin lỗi có cấu trúc trong log, phục vụ cho plugin retry/sandbox và việc replay. Khối text hướng tới model giữ nguyên không đổi.
- `toError` của agent loop bọc các giá trị throw không phải Error thành `HarnessError` (`code: 'UNKNOWN'`, giá trị gốc được liên kết dưới dạng `cause`), thay vì `Error` trần trụi; nhờ đó ngay cả throw không chuẩn cũng mang code có thể định tuyến vào event `error` của session (event này trước đó đã công khai `code`).

## Hệ quả

- Lỗi có thể được định tuyến bằng máy end-to-end: plugin có thể phân nhánh dựa trên `error.code`, không cần khớp chuỗi con trên message.
- Một base class được import rộng rãi, nhưng nó nằm trong package mà mọi package khác đã phụ thuộc sẵn, cái giá chỉ là một câu lệnh import, chứ không phải một cạnh phụ thuộc mới.
- `deriveMessages` không đưa `error` vào lịch sử của model — model vẫn thấy khối text; trường có cấu trúc phục vụ cho code và replay.
- Kiểm tra tham số giữ nguyên code và hành vi sẵn có; các bất biến chẩn đoán riêng của từng package tiếp tục mang code ổn định độc lập, giúp registry bất biến không cần import package sản phẩm. Base class dùng chung bổ sung metadata định tuyến qua seam, không thay đổi text hướng tới model.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
