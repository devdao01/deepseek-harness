# Ví dụ

[English](README.md) | 中文

Các bản demo có thể chạy được, thể hiện các giao diện chính và điểm mở rộng của DeepSeek Harness. Mỗi thư mục con chịu trách nhiệm về cấu hình, điều kiện tiên quyết, lệnh và hành vi chi tiết của riêng nó.

## mcp-memory

Overlay tùy chọn kết nối tới các máy chủ bộ nhớ (memory) bên thứ ba được hỗ trợ, thông qua một MCP client dùng chung. Xem chi tiết tại [tài liệu tham khảo ví dụ bộ nhớ](mcp-memory/README.md).

## headless-agent

agent (tác tử) không tương tác: nhận một tác vụ rồi chạy, sau đó xuất kết quả theo định dạng máy đọc được hoặc người đọc được đã chọn. Xem chi tiết tại [tài liệu tham khảo ví dụ headless](headless-agent/README.md).

## jsonrpc-agent

agent lập trình không người trực, được điều khiển bởi Python SDK và JSON-RPC. Xem chi tiết tại [tài liệu tham khảo ví dụ JSON-RPC](jsonrpc-agent/README.md).

## web-cordis

agent tự trỏ vào chính nó, có khả năng kiểm tra và thay đổi cây plugin Cordis trong bộ nhớ. Xem chi tiết tại [tài liệu tham khảo ví dụ web-cordis](web-cordis/README.md).

## web-schedule

Overlay Web tùy chọn cho các lời nhắc bền vững, chỉ giới hạn trong phạm vi Session. Nó hỗ trợ độ trễ `after_seconds` tính bằng giây nguyên dương và mốc `at` tuyệt đối thông qua `schedule_create`, `schedule_list` và `schedule_delete`; các lời nhắc đang hoạt động được lưu trong Session gốc, khôi phục khi Session đó live trở lại, và không chạy trong lúc cold. Khởi động bằng `dsh web --patch examples/web-schedule/cordis.yml`; chi tiết về authority thời gian tuyệt đối cũng như ranh giới giao và khôi phục xem tại [web-schedule/README.md](web-schedule/README.md).

## acp-agent

Máy chủ tự động hóa ACP (Agent Client Protocol) dành cho client lập trình, hỗ trợ session, quyền hạn và hủy thao tác. Xem chi tiết tại [tài liệu tham khảo ví dụ ACP](acp-agent/README.md).
