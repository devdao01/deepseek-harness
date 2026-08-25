# Agent Note: Microkernel — mở rộng qua hệ phân loại event của Cordis, vòng lặp cụ thể duy nhất

Status: implemented

[English](2026-06-11-microkernel-event-taxonomy.md) | 中文

## Vấn đề

Nguyên tắc sản phẩm là "mọi thứ đều là plugin": hook, /goal, /loop, workflow động, compaction, sandbox, permission, UI, persistence, MCP, skill đều phải có thể được viết dưới dạng plugin, không cần sửa core.

## Quyết định

Hệ phân loại event thuần Cordis. Điểm mở rộng của agent loop (vòng lặp agent) là các event có kiểu, với mô hình phân phối rõ ràng:

- **waterfall (event kiểu thác nước)** (around-middleware): plugin có thể biến đổi, short-circuit, khôi phục hoặc bao bọc: `agent/pre-step`, `agent/request`, `agent/request-error`, `tools/pre-execute`, `tools/execute`, `tools/post-execute`, `llm/stream`, `system-prompt/assemble`.
- **serial** (await theo thứ tự từng listener): dùng cho các checkpoint có thứ tự như `agent/turn-stopping`.
- **parallel** (await theo kiểu quạt ra - fan-out): mỗi listener đều phải có cơ hội thực thi độc lập: checkpoint persistence `session/flush`.
- **emit** (fire-and-forget đồng bộ): dùng cho thông báo: chuyển đổi inbox, vòng đời, lỗi, và quan sát `tools/result` được cách ly lỗi (error-isolated); quan sát này nhận kết quả cuối cùng bất biến. Ranh giới turn và step do sự kiện session bền vững sở hữu.

Từ vựng event được định nghĩa trong package quy ước (`dsh-agent` khai báo event `agent/*`); `@deepseek-ai/dsh-agent-loop` là plugin vòng lặp cụ thể duy nhất, và bản thân nó có thể thay thế được — bên ngoài không được phụ thuộc vào nó.

## Phương án thay thế từng cân nhắc

**Middleware stack chuyên dụng (kiểu koa-compose)** và **máy trạng thái giai đoạn tường minh (plugin chèn giai đoạn vào đó)**: cả hai đều cần triển khai lại cơ chế phân phối, dispose (giải phóng tài nguyên) và ngữ nghĩa reload mà hệ thống event gốc của Cordis đã cung cấp; là một Cordis effect, listener tự nhiên có được HMR (hot module replacement) và khả năng dispose.

## Hệ quả

- Mỗi tính năng MVP đều ánh xạ tới một listener ([bản đồ tính năng → cơ chế](../../../../docs/cookbook/extension-cookbook.md#the-feature--mechanism-map) là nghĩa vụ chứng minh, cần được cập nhật thường xuyên).
- HMR và dispose không cần thêm công sức: listener và đăng ký (registration) đều là Cordis effect.
- Ngữ nghĩa waterfall (gọi `next()` hoặc short-circuit) không trực quan, cần được dạy — được ghi lại trong AGENTS.md và bao phủ bởi test tổ hợp (composition test).
- Vòng lặp phải mang tính phòng thủ: ngoại lệ plugin được cách ly ở cấp turn, steering (dẫn dắt giữa chừng) từ bất kỳ điểm mở rộng nào không bao giờ bị bỏ quên (có regression test đảm bảo).
