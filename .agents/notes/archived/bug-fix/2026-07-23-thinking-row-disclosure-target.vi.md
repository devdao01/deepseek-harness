# Agent Note: Hàng thinking dùng một mục tiêu mở rộng (disclosure target) duy nhất

Status: implemented
Archived: 2026-07-26

[English](2026-07-23-thinking-row-disclosure-target.md) | 中文

## Vấn đề

Mục reasoning (suy luận) bị thu gọn hiển thị `Think` và bản tóm tắt reasoning một dòng trong cùng một hàng thị giác (visual row), nhưng nếu chỉ icon mới có thể mở rộng thì cả hai nhãn hiển thị đều không tương tác được. Nếu cho phép mọi hàng công cụ (tool row) mở rộng bằng cách click vào tiêu đề, điều đó sẽ phá vỡ hợp đồng (contract) của hàng công cụ dạng chung: toàn bộ hàng chịu trách nhiệm mở chi tiết, chỉ control ở đầu hàng mới chịu trách nhiệm mở rộng tham số.

## Quyết định

`ToolRow` cung cấp chiến lược `expandOnRowClick` được bật một cách tường minh. `ThinkRow` bật chiến lược này, khiến tiêu đề và bản tóm tắt reasoning trở thành một mục tiêu mở rộng duy nhất, có khả năng truy cập (accessible); click chuột, Enter và Space đều chuyển đổi cùng một trạng thái mở rộng nội bộ của component. Các hàng công cụ không bật chiến lược này vẫn giữ hành vi cũ: toàn bộ hàng dùng để chọn chi tiết, control ở đầu hàng dùng để mở rộng tham số.

## Kiểm chứng

Test component cố định (pin) hai điểm click của Think, cũng như hành vi bàn giao (handoff) của hàng công cụ dạng chung không thay đổi. Fixture (dữ liệu thử nghiệm) trình duyệt không cần khóa (keyless) sẽ tải sidebar và bundle phiên thật, mở một phiên có sẵn chứa nội dung reasoning, click vào phần tóm tắt và tiêu đề, rồi kiểm tra trạng thái mở rộng cùng nội dung sau khi mở rộng.

## Các phương án thay thế đã cân nhắc

**Cho mọi hàng công cụ đều có thể mở rộng bằng cách click tiêu đề.** Hàng công cụ dạng chung dùng việc click toàn hàng cho việc chọn chi tiết, chia sẻ hành vi này sẽ gây nhầm lẫn giữa hai control.

**Giữ nguyên chỉ icon mới mở rộng được.** Mục tiêu click tối thiểu vẫn tách rời khỏi nhãn mô tả nội dung bị ẩn.

**Render tiêu đề và tóm tắt thành hai button riêng biệt.** Hai control chia sẻ chung một trạng thái mở rộng, sẽ tạo thêm điểm dừng focus trùng lặp và gây mơ hồ về mặt ngữ nghĩa.

## Hệ quả

Hàng thinking có được mục tiêu click chuột lớn hơn và ngữ nghĩa mở rộng bằng bàn phím, đồng thời không thay đổi các tương tác công cụ khác. Component hàng dạng chung phải gánh thêm một chiến lược tùy chọn, vì quyền sở hữu việc mở rộng giữa reasoning và tool call là khác nhau.
