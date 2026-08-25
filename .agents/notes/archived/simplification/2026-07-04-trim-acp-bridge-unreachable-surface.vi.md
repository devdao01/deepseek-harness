# Agent Note: Cắt tỉa bề mặt không thể chạm tới của lớp cầu nối ACP — mục cấu hình thương hiệu và phương án dự phòng đoán kind

Status: implemented
Archived: 2026-07-26

[English](2026-07-04-trim-acp-bridge-unreachable-surface.md) | Tiếng Việt

> Việc đơn giản hóa định danh handshake vẫn còn hiệu lực. Phương án dự phòng thẻ dùng chung đã bị gỡ cùng với [việc ACP chuyển sang chỉ hướng tự động hóa](2026-07-23-acp-automation-only-protocol.md); tầng truyền tải UI giữ lại contract trình bày không phụ thuộc nhà cung cấp.

## Vấn đề

`dsh-acp` có hai bề mặt đối ngoại không thể chạm tới trong bất kỳ cấu hình nào đã được giao:

1. **`AcpConfig.agentName` / `agentVersion`** (`packages/acp/acp/src/index.ts`). Package ứng dụng đã phát hành chỉ truyền cho bridge mục tiêu nhà cung cấp/mô hình của agent mình (`packages/examples/acp-demo/src/index.ts`), nên không `cordis.yml` lá nào — bề mặt cấu hình production duy nhất — có thể đặt các mục cấu hình này; chỉ khi gắn bridge trực tiếp mới đặt được chúng, mà cách làm đó chỉ tồn tại trong một bài kiểm thử đơn vị. Mọi kỳ vọng đầu ra snapshot — kể cả các kịch bản ma trận hook — đều cố định giá trị mặc định của schema (`deepseek-harness-acp` / `0.0.1`). Cặp mục cấu hình này còn kèm theo một `TODO(double-default)` chưa được giải quyết: giá trị chữ tồn tại hai lần (`.default(...)` của schema cộng với giá trị dự phòng `??`), và TODO yêu cầu chọn một nơi thuộc về cho chúng.
2. **Suy luận theo tên `toolKindFor`** (cùng tệp) xử lý đặc biệt các tên công cụ `bash*`/`read*`/`write`/`edit*` trên đường dự phòng dùng chung. Kể từ [kiểu hợp render-intent](../architecture/2026-07-02-tool-render-intent-union.md), mọi công cụ bên thứ nhất mà các nhánh này khớp tới đều tự mang `presentCall` kèm kind của mình, còn những công cụ production không có presenter (`subagent`, `subagent_fork`) thì vốn đã rơi vào `other`. Các nhánh này chỉ có thể chạm tới trong production khi công cụ từ chối tự trình bày lời gọi: `presentCall` ném lỗi (dự phòng chịu lỗi), hoặc tham số của mô hình không vượt qua schema công cụ khiến lớp bọc `presentCall` của `defineTool` trả về `undefined` (ví dụ lời gọi `bash` thiếu `description` bắt buộc). Trong khi đó, chính tài liệu module của lớp cầu nối đã nêu rõ quy tắc thiết kế mà suy luận này vi phạm: "lớp cầu nối tuyệt đối không xử lý đặc biệt theo tên công cụ".

## Quyết định

Hardcode định danh handshake hiện có `{ name: 'deepseek-harness-acp', version: '0.0.1' }` lúc khởi tạo, gỡ các trường cấu hình không thể chạm tới và giá trị mặc định trùng lặp. Bản hiện thực ban đầu còn thay `toolKindFor` bằng `'other'` trung tính tại hai chỗ dự phòng của presenter; ACP nay không còn chiếu thẻ công cụ nữa, nên phương án dự phòng đó đã rời hẳn khỏi tầng truyền tải. Kiểm thử khởi tạo và snapshot cố định định danh handshake.

## Các phương án từng cân nhắc

### Vì sao không giữ lại?

Cấu hình thương hiệu có thể quay lại khi package app phơi bày nó ra cho môi trường triển khai. Việc suy ra cách trình bày từ tên công cụ chưa biết vi phạm contract render-intent; thẻ dự phòng trung tính còn giữ được đầu vào gốc cho những lời gọi sai định dạng và những presenter bị hỏng.

## Hệ quả

Lớp cầu nối không phơi bày mục cấu hình thương hiệu nào. Tầng truyền tải UI sở hữu phương án dự phòng trình bày dùng chung không suy đoán theo tên công cụ, còn ACP không mang bất kỳ bề mặt thẻ công cụ nào.
