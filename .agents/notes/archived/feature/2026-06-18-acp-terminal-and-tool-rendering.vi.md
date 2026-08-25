# Agent Note: Render bash phong phú trên ACP — terminal card qua quy ước `_meta`

Status: implemented
Archived: 2026-07-26

[English](2026-06-18-acp-terminal-and-tool-rendering.md) | 中文

> Về phía ACP thì đã được thay thế bởi [ACP như một giao thức chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md). Ý định render của tool vẫn khả dụng cho tầng truyền tải UI, nhưng ACP không còn chiếu nó thành terminal card nữa.

## Vấn đề

Lớp cầu nối ACP (Agent Client Protocol) cho phép mỗi tool tự kiểm soát cách render lệnh gọi thông qua `presentCall`/`presentResult` (xem [Hiển thị UI cho lệnh gọi tool](2026-06-14-acp-agent-client-protocol.md) và `packages/core/tools`). Với `bash`, chúng tôi hiển thị chính xác lệnh làm tiêu đề `tool_call`, `description` của model làm một content block văn bản, `kind: 'execute'`, và output sau khi hoàn tất được bọc trong content block dạng văn bản với fence ` ```console `.

Editor tham chiếu render metadata terminal thành một card chuyên dụng, chứa cwd, lệnh, output kiểu thời gian thực, và trạng thái exit; còn văn bản thuần thì mất đi cấu trúc này. Sở dĩ lệnh được dùng làm tiêu đề là vì execute card ẩn input gốc, còn mô tả dễ đọc cho con người được giữ lại như một block riêng phía trên card.

## Phát hiện then chốt: terminal do agent thực thi dùng quy ước `_meta`, không phải `terminal/create`

Đặc tả ACP có một tiểu giao thức terminal *phía client*: agent gọi `terminal/create` của client (truyền `{ command, args, cwd, env }`), **editor** thực thi tiến trình, rồi agent đọc `terminal/output` / `wait_for_exit`. Mô hình này không phù hợp với chúng tôi: harness thực thi bash bằng chính mình qua `dsh-bash` (làm sạch môi trường trong sandbox, quyền sở hữu tác vụ nền, cwd theo từng phiên). Định tuyến việc thực thi sang editor sẽ bỏ qua toàn bộ các cơ chế này và chia việc thực thi ra hai backend.

Nghiên cứu hai agent tham chiếu (2026-06-18) cho thấy cả hai đều không dùng `terminal/create` cho tool shell của riêng mình — **cả hai đều giữ việc thực thi ở phía agent, và phát ra một bộ quy ước `_meta`**, được Zed xử lý đặc biệt:

- **`claude-agent-acp`** (`tools.ts`, `acp-agent.ts`): cổng điều kiện dựa trên `clientCapabilities._meta.terminal_output`. `tool_call` mang `content: [{ type: 'terminal', terminalId }]` cùng `_meta.terminal_info.{ terminal_id, cwd }`; output và exit đến qua `_meta.terminal_output.{ terminal_id, data }` và `_meta.terminal_exit.{ terminal_id, exit_code, signal }` trong `tool_call_update`.
- **`codex-acp`** (`CodexToolCallMapper.ts`, `TerminalOutputMode.ts`): lệnh gọi cũng mang `terminal_info` tương tự; output qua `_meta.terminal_output` (đầy đủ) hoặc `_meta.terminal_output_delta` (theo phần), do cùng khả năng `_meta.terminal_output` chọn lựa.

Phía Zed (`crates/agent_servers/src/acp.rs`, đã xác minh): khi nhận `ToolCall` mà `_meta.terminal_info.terminal_id` đã được đặt, nó đăng ký một terminal **chỉ để hiển thị** (header = `terminal_info.cwd`, label = `tool_call.title`); khi nhận `ToolCallUpdate`, `_meta.terminal_output.data` được ghi vào terminal đó, `_meta.terminal_exit.{exit_code,signal}` đặt trạng thái. Client khai báo khả năng này qua `clientCapabilities._meta.terminal_output = true`. Bản thân `_meta` là điểm mở rộng được đặc tả ACP công nhận (kiểu `{[k]: unknown} | null` trên `ToolCall`/`ToolCallUpdate`); *các key cụ thể* ở đây (`terminal_info`/`terminal_output`/`terminal_exit`) là quy ước của Zed, không thuộc đặc tả ACP, nhưng chúng là hợp đồng thực tế cho việc tích hợp với Zed, và là cách duy nhất để có terminal card trong khi vẫn giữ việc thực thi ở phía agent.

## Quyết định

Giữ nguyên việc thực thi phía agent của `dsh-bash`; render terminal card thông qua quy ước `_meta`, cổng điều kiện bằng khai báo khả năng, với text block ` ```console ` làm fallback an toàn.

1. **Khai báo khả năng.** `initialize` đọc `clientCapabilities._meta.terminal_output`, lớp cầu nối ghi nhớ theo từng kết nối.
2. **Từ vựng hiển thị độc lập với provider.** `dsh-tools` bổ sung một cấu trúc hiển thị dạng terminal mà tool có thể trả về — độc lập với provider (`cwd`, output `data`, `exitCode`/`signal`), không chứa kiểu ACP. `dsh-tool-bash` trả về cấu trúc này cho `bash` (cwd lấy từ thư mục làm việc đã phân giải; output và exit được phân giải từ kết quả chạy).
3. **Ánh xạ của lớp cầu nối.** Khi client đã khai báo khả năng này, lớp cầu nối ánh xạ cấu trúc hiển thị thành: trên `tool_call`, `content:[…, {type:'terminal', terminalId}]` (mọi `content` của tool, như mô tả, render trước block terminal) + `_meta.terminal_info.{terminal_id,cwd}`; trên `tool_call_update`, `_meta.terminal_output.{terminal_id,data}` (output đã bắt được) + `_meta.terminal_exit.{terminal_id, exit_code|signal}` (exit đã phân giải), và `content` dạng văn bản của update bị bỏ qua (`tool_call_update.content` của ACP sẽ thay thế toàn bộ tập content của lệnh gọi, nên gửi lại block fence sẽ ghi đè content block của terminal). `terminalId` được suy ra từ `callId` của harness (ổn định, duy nhất cho mỗi lệnh gọi). Khi khả năng chưa được khai báo, lớp cầu nối gửi content block mô tả trên lệnh gọi, và nội dung văn bản ` ```console ` sẵn có trên update — hành vi không đổi.
4. **Thông tin exit được phân giải từ output đã render; không có đường thực thi mới, không stream thời gian thực.** Output được nối vào khi hoàn tất (từ `tool/result` của chính agent), không stream theo từng token. Trạng thái exit (`_meta.terminal_exit.{exit_code,signal}`) thực sự được phát ra: seam `presentResult(args, result)` thuần túy chỉ nhìn thấy content block, nên `dsh-tool-bash` khôi phục thông tin exit có cấu trúc bằng cách phân giải các marker trạng thái (`[exit code: N]` / `[killed by signal: …]`) được `renderResult` nối thêm — việc phân giải là phép nghịch đảo chính xác của việc phát marker, cả hai cùng tiến hóa trong cùng một file, được một test round-trip bảo vệ mối quan hệ này. Việc giải phóng tài nguyên không bị ảnh hưởng: không cần thêm logic dọn dẹp, vì lớp cầu nối không bao giờ tạo terminal phía client.

## Phương án thay thế từng cân nhắc

- **Tiểu giao thức terminal phía client của ACP (`terminal/create`)**: bị bác bỏ rõ ràng. Editor sẽ thực thi tiến trình, bỏ qua việc làm sạch môi trường, quyền sở hữu tác vụ nền, và cwd theo từng phiên của `dsh-bash`, chia việc thực thi ra hai backend. Cả hai agent tham chiếu cũng bác bỏ theo cách tương tự (xem phát hiện then chốt ở trên); việc thực thi phía agent kết hợp quy ước `_meta` là hình thức duy nhất để có terminal card trong khi vẫn giữ chính sách thực thi của harness.
- **Truyền thông tin exit có cấu trúc qua event schema**: bị bác bỏ, thay bằng phương án round-trip marker. Seam `presentResult(args, result)` thuần túy chỉ nhìn thấy content block, còn việc phân giải là phép nghịch đảo chính xác của việc phát marker, cả hai cùng tiến hóa trong cùng một file, được một test round-trip bảo vệ.

## Hệ quả

- **Key `_meta` theo quy ước của Zed.** Terminal card phụ thuộc vào các key riêng của Zed (`terminal_info`/`terminal_output`/`terminal_exit`), nằm trong điểm mở rộng `_meta` được đặc tả ACP công nhận, chứ không phải tiểu giao thức terminal của ACP. Client không nhận diện các key này vẫn nhận được fallback văn bản (cổng khả năng đảm bảo chúng tôi chỉ phát các key này khi client khai báo hỗ trợ qua `_meta.terminal_output`), nên client không phải Zed không bị tệ đi. Nếu ACP sau này chuẩn hóa terminal do agent thực thi, hệ thống sẽ chuyển sang chuẩn đó và loại bỏ các key theo quy ước.
- **Trung thực về khả năng.** Metadata terminal chỉ được phát khi client khai báo `_meta.terminal_output`; fallback văn bản là hợp đồng với mọi client khác, không bao giờ được suy giảm. Một test không có khả năng bao phủ, khẳng định đường ` ```console `.
- **Xung đột terminalId.** Được suy ra từ `callId` của mỗi lệnh gọi, đảm bảo duy nhất trong phiên và ổn định giữa cặp call/result; không bao giờ tái sử dụng giữa các lệnh gọi.
- **Thông tin exit được phân giải từ văn bản đã render.** Thông tin exit khôi phục `exit_code`/`signal` bằng cách phân giải marker trạng thái của `renderResult`, chứ không truyền exit có cấu trúc qua event schema (seam `presentResult` thuần túy không nhìn thấy cái sau). Việc phân giải là phép nghịch đảo chính xác của việc phát marker, và nằm trong cùng một file; test round-trip cố định mối quan hệ này, nếu định dạng marker thay đổi làm hỏng việc phân giải thì bộ test sẽ fail. Nếu định dạng marker sau này cần tách khỏi thông tin exit, hãy chuyển sang phơi bày exit có cấu trúc trên event result.
- **Sự lan rộng của từ vựng độc lập với provider.** Cấu trúc hiển thị terminal mở rộng bề mặt giao diện của `dsh-tools`; giữ nó trung lập (không để kiểu ACP rò rỉ vào `dsh-tools`), và chỉ cung cấp mức độ phong phú mà một consumer UI thứ hai cũng cần đến.

## Ngoài phạm vi / Không phải mục tiêu

Baseline dạng text block vẫn là hành vi mặc định khi không khai báo khả năng. Hai công việc tiếp theo sau đây cố ý không được xây dựng ở đây, mỗi cái cần một Agent Note riêng: **stream theo phần thời gian thực** (phát `_meta.terminal_output_delta` khi từng đoạn đến, cần bổ sung seam output theo phần trên `dsh-bash`); **phân loại lệnh** (phân giải `cat`/`sed` thành card `read` có vị trí file, phân giải `grep` thành `search`, fallback về terminal card — chỉ để hiển thị, không bao giờ thay đổi nội dung thực thi thực tế).
