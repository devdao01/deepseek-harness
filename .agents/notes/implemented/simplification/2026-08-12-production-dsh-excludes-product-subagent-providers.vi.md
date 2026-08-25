# Agent Note: dsh production loại trừ các provider subagent sản phẩm

Status: implemented

[English](2026-08-12-production-dsh-excludes-product-subagent-providers.md) | Tiếng Việt

## Vấn đề

`@deepseek-ai/dsh` nhận toàn bộ dependency closure của `@deepseek-ai/dsh-base`. Nếu base chứa các provider subagent Codex và Claude Code, mỗi lần cài đặt production đều sẽ tải về code tích hợp sản phẩm tùy chọn, bao gồm cả Claude Agent SDK, ngay cả khi người dùng không sử dụng tích hợp nào trong số đó.

## Quyết định

Quyết định này thay thế [quyết định về vị trí đặt trong shared host](../architecture/2026-08-10-product-subagent-providers-in-shared-host.md): `@deepseek-ai/dsh-base` không còn phụ thuộc vào, cũng không mount, các provider subagent Codex và Claude Code. Các Profile cần các tích hợp này vẫn có thể cài đặt và mount package tương ứng một cách tường minh. Các example trong repo vẫn giữ dev dependency trực tiếp, để cấu hình provider tường minh của chúng tiếp tục resolve được.

## Kiểm chứng

Test bundle base sẽ từ chối cả hai dòng dependency lẫn cấu hình của các provider này. Việc kiểm chứng cấu hình Cordis yêu cầu các example tường minh phải khai báo các package provider mà chúng tham chiếu tới.

## Các phương án thay thế đã cân nhắc

**Giữ provider ở trạng thái ngủ (dormant) trong bundle base.** Provider ngủ không khởi động tiến trình sản phẩm, nhưng package của nó vẫn sẽ đi vào mọi lần cài đặt NPM production.

## Hệ quả

Khi cài đặt `@deepseek-ai/dsh`, không có provider sản phẩm nào được tải về thông qua bundle base. Việc sử dụng bất kỳ tích hợp nào cũng đòi hỏi cấu hình Profile tường minh.
