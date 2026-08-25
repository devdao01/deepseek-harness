# Agent Note: Đường dẫn source code checkout không định nghĩa working directory

Status: implemented

[English](2026-07-30-source-checkout-workdir-distinction.md) | 中文

## Vấn đề

Đoạn prompt `harness:source` tuân theo [quyết định về vị trí source code](../../archived/feature/2026-07-21-dsh-system-prompt-source-path.md), nhưng cách diễn đạt ban đầu gọi checkout là "source code của chính bạn", mà không phân biệt đường dẫn đó với session workspace. Trong config TUI thông thường, khi persona không khai báo `{{cwd}}`, đây có thể là đường dẫn tuyệt đối duy nhất được cố định gần đầu system prompt. Do đó, DeepSeek V4 có thể trả lời trực tiếp câu "what's the workdir?" bằng harness checkout, thay vì xác định working directory hiện tại của session.

Khẳng định trực tiếp rằng checkout không phải là working directory cũng không chính xác. `dsh meta` cố ý để source code checkout đóng vai trò cả hai giá trị này.

## Quyết định

Đoạn prompt này gọi đường dẫn là "DeepSeek Harness implementation checkout". Nó nói rõ vị trí checkout và working directory hiện tại là hai giá trị có thể khác nhau, cấm việc suy luận working directory từ đường dẫn checkout, chỉ thị model dùng `pwd`, và giới hạn checkout này chỉ dùng để kiểm tra hoặc mở rộng chính DSH.

Cách suy ra đường dẫn, quyền sở hữu toàn cục của `harness:source`, và thứ tự `-99` đều giữ nguyên. Mô tả hai giá trị này là độc lập về khái niệm, thay vì luôn luôn không bằng nhau, giúp chỉ dẫn này chính xác cả trong session project thông thường lẫn trong `dsh meta`.

## Kiểm chứng

Unit test của `dsh-app-boot` cố định toàn bộ văn bản và thứ tự của nó. Smoke test PTY của CLI (command-line interface) không cần key kiểm tra request header đã lắp ráp. Snapshot `source-checkout-workdir` của TUI mount đoạn prompt này với `/opt/dsh-source`, đặt câu hỏi "what's the workdir?" qua một turn DeepSeek V4 đã ghi sẵn, và yêu cầu transcript (bản ghi văn bản) khi replay chạy `pwd`, báo cáo workspace được sinh ra chứ không phải checkout.

## Các phương án đã cân nhắc

**Khẳng định checkout không bao giờ là working directory.** Từ chối: `dsh meta` cố ý để hai giá trị này trỏ tới cùng một đường dẫn.

**Ghi working directory hiện tại vào đoạn prompt source code toàn cục.** Từ chối: đoạn prompt source code được launcher giữ toàn cục, còn working directory thuộc về từng session; gộp hai thứ này sẽ trùng lặp quyền sở hữu `cwd` của agent loop (smart agent loop), và khiến fact source code vốn ổn định lại thay đổi theo agent.

**Xóa đường dẫn source code khỏi prompt.** Từ chối: khi launcher khởi động từ một project không liên quan, các tool tự tham chiếu DSH vẫn cần một vị trí checkout đáng tin cậy.

## Hệ quả

Prompt sẽ dài hơn, và khi hỏi trực tiếp về working directory có thể tốn thêm một lần gọi tool `pwd` giá rẻ. Đổi lại, model không còn coi đường dẫn implementation của harness là task workspace ngầm định; khi meta mode khiến hai giá trị này trùng nhau, prompt vẫn chính xác.
