# Agent Note: TUI /status kiểm tra đầu vào yêu cầu mô hình

Status: implemented

Archived: 2026-08-04

[English](2026-07-23-tui-status-prompt-tools.md) | 中文

## 问题

Bộ đếm phiên có thể mô tả tình trạng hoạt động, nhưng không thể hiển thị chỉ thị và năng lực mà yêu cầu mô hình tiếp theo sẽ nhận được. Để chẩn đoán prompt và giới hạn công cụ đóng góp theo phạm vi, người dùng chỉ có thể rời khỏi TUI, hoặc suy đoán dựa trên tệp cấu hình.

## 决策

`/status` lắp ráp system prompt cho agent (trí tuệ nhân tạo) hiện tại thông qua `ctx.systemPrompt`, và dùng cùng bộ render như agent loop (vòng lặp trí tuệ nhân tạo) để render. Sau thẻ chẩn đoán có viền, hai khu vực `System prompt` và `Registered tools` độc lập, không viền, lần lượt hiển thị prompt đã render và tên các công cụ theo thứ tự trong assembly; các tên này tương ứng với schema mà agent hiện tại và chế độ hiển thị hiện tại công bố cho mô hình.

Việc lắp ráp dùng tín hiệu hủy của lệnh và phạm vi agent hiện tại, do đó section, biến, giới hạn công cụ đăng ký theo phạm vi và assembly listener đều nhất quán với yêu cầu được khởi phát tại thời điểm đó. Giá trị prompt và công cụ được làm sạch ký tự điều khiển terminal của TUI trước khi hiển thị. Prompt rỗng và danh sách công cụ rỗng lần lượt hiển thị là `(empty)` và `(none)`.

## 曾考虑的替代方案

**Đọc riêng section prompt và registry công cụ.** Đã bác bỏ: cách làm đó sẽ bỏ qua waterfall (chuỗi sự kiện dạng thác) lắp ráp prompt, thứ tự công cụ, chế độ hiển thị và giới hạn theo agent, do đó kết quả chẩn đoán có thể không khớp với yêu cầu tiếp theo.

**Hiển thị schema công cụ đầy đủ.** Đã bác bỏ: tên công cụ đã đủ để trả lời năng lực nào đã được đăng ký, đồng thời tránh để JSON tham số chiếm phần lớn thẻ trạng thái; chi tiết schema vẫn có thể xem trong catalog công cụ được sinh ra và định nghĩa mã nguồn.

## 后果

Lệnh này có thể chạy prompt provider và assembly listener giống như khi chuẩn bị yêu cầu, và báo cáo thất bại qua thông báo lỗi lệnh hiện có. Kết quả là một bản chụp tại thời điểm đó: các đăng ký, giới hạn, thay đổi schema hoặc provider động sau đó đều có thể thay đổi yêu cầu tiếp theo.

## 测试

Test hành vi cấp package cố định đầu ra lắp ráp theo phạm vi, thứ tự tên công cụ, nhãn giá trị rỗng và việc escape ký tự điều khiển terminal. Bản chụp nhanh ngữ nghĩa cấp package thực thi `/status` ở chiều rộng bình thường và chiều rộng hẹp; đơn vị triển khai TUI chịu trách nhiệm nghiệm thu tiến trình đã lắp ráp của mình.
