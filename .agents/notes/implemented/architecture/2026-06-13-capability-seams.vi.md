# Agent Note: Capability seam — vai trò Service Definition / Service Provider / Consumer

Status: implemented

[English](2026-06-13-capability-seams.md) | 中文

## Vấn đề

harness có các capability có thể thay thế: hiện tại là bash execution, tương lai sẽ có executor sandbox hóa/remote và các model provider thay thế. Một capability liên quan đến ba mối quan tâm, thay đổi với tốc độ khác nhau, vì lý do khác nhau: *quy ước* (capability này là gì), *triển khai* (nó chạy như thế nào), *API tiêu thụ* (model và các plugin khác lập trình dựa trên cái gì). Gộp cả ba vào một package sẽ khiến các tốc độ thay đổi này bị coupling — khi thay executor local bằng executor sandbox hóa, tool schema mà model nhìn thấy cũng bị xáo trộn, dù quy ước hướng tới model chưa hề thay đổi.

Đây là vấn đề khác với "ai cung cấp, ai cần một capability tại runtime", vấn đề sau Cordis đã giải quyết qua service + `inject` (provider đăng ký `ctx.shell`; consumer khai báo `inject: ['bash']`, fiber của nó bị treo cho đến khi service tồn tại). Cơ chế đó là cần thiết, nhưng không quyết định ranh giới package — Agent Note này quyết định ranh giới package.

## Quyết định

Một capability có thể thay thế bao gồm **ba vai trò**:

1. **Service Definition** — sở hữu `ctx.<key>` là Cordis `Service` và các kiểu từ vựng, chỉ phụ thuộc vào từ vựng cần thiết cho quy ước (ví dụ `dsh-shell`: `ShellExecutor`, `ShellRunResult`, `ShellProcess`). Service Definition có thể là abstract class, cũng có thể là service registry cụ thể; không bao giờ là TypeScript `interface`.
2. **Service Provider** — plugin cung cấp hoặc đăng ký triển khai (ví dụ `dsh-bash-local`: subprocess, kill process group, cắt bớt spill file). Service Provider sandbox hóa và remote là các package anh em được triển khai hoặc đăng ký dựa trên cùng một Service Definition.
3. **Consumer** — thứ mà model và plugin lập trình dựa vào (ví dụ `dsh-tool-bash`: schema `bash`, handle chạy nền được đăng ký vào job runtime chung). Consumer inject service key, không bao giờ import kiểu đặc thù của Service Provider.

Tên vai trò dùng dạng title case: **Service Definition**, **Service Provider**, và **Consumer**. `provider` và `consumer` khi dùng chung chung vẫn dùng chữ thường.

Nhờ đó Service Provider và Consumer tiến hóa độc lập với nhau: thay executor sandbox hóa cho `dsh-bash-local` không cần đụng tới bất kỳ tool schema nào.

Khi các vai trò tiến hóa độc lập, thường dùng các package khác nhau; nhưng khi các vai trò thực sự thuộc cùng một mối quan tâm, không nhất thiết phải tách: LLM (mô hình ngôn ngữ lớn) seam gộp Service Definition và Consumer vào `dsh-llm` (Consumer chính là agent loop (vòng lặp agent), không phải một schema interface có thể thay thế), adapter đóng vai trò Service Provider package. Đừng tách trước một cách phòng ngừa — nếu một capability chỉ có một loại Service Provider có thể hình dung và một Consumer, hãy giữ nó là một package cho tới khi xuất hiện loại thứ hai.

## Thuật ngữ: seam chỉ tổ hợp cả ba, không phải interface

Một **seam** là toàn bộ capability — ba vai trò gộp lại: **Service Definition** (sở hữu `ctx.<key>` và từ vựng là Cordis `Service`), một hoặc nhiều **Service Provider**, và một hoặc nhiều **Consumer**. `packages/shell` là ví dụ chuẩn — `dsh-shell` / `dsh-bash-local`+`dsh-bash-sandbox` / `dsh-tool-bash`. Một package có thể đảm nhận nhiều vai trò, nhưng một vai trò riêng lẻ tự nó không phải là seam. Từ "seam" được giữ nghiêm ngặt cho capability hoàn chỉnh này; khi đặt tên cho một thành phần trong đó, nên dùng vai trò, class, service, quy ước hoặc điểm mở rộng của nó. [Bảng thuật ngữ](../../../../docs/glossary.md#capability-seam) là mục quy chuẩn.

## Phương án thay thế từng cân nhắc

- **Luôn gộp các vai trò lại**: bị bác bỏ. Vì nó sẽ tái coupling Service Definition, Service Provider và Consumer vốn thay đổi độc lập.
- **`@cordisjs/plugin-capability`**: đây là một chiều hoàn toàn khác. Nó là một service *bảo mật* permission/capability (quyền có tên cộng với kế thừa, kiểm tra các quyền này cho session qua `ctx.capability.test`), là ứng viên cho công việc permission/sandbox sẽ triển khai sau (cổng deny/ask tại `tools/pre-execute`), không phải cơ chế thay thế triển khai. Nhầm lẫn hai khái niệm "capability" này chính là cái bẫy mà Agent Note này chỉ ra.

## Hệ quả

Tách vai trò làm tăng số package và mã boilerplate (`package.json`, `tsconfig`, README và đấu nối inject). Đổi lại: Service Provider và Consumer được phát hành và quản lý phiên bản độc lập, backend mới sẽ không bao giờ ảnh hưởng tới quy ước hướng tới model. [AGENTS.md](../../../../AGENTS.md) và [architecture.md](../../../../docs/architecture.md) chứa quy tắc này; bộ ba bash là mẫu tham chiếu. Agent Note này ghi lại lý do tại sao các vai trò thay đổi độc lập thường cần được tách, còn các mối quan tâm thực sự dùng chung có thể giữ gộp.
