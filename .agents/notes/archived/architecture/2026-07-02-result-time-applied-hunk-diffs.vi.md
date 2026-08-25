# Agent Note: Diff applied-hunk tại thời điểm kết quả dùng cho thay đổi file

Status: implemented
Archived: 2026-07-27

[English](2026-07-02-result-time-applied-hunk-diffs.md) | 中文

## Vấn đề

[Union kiểu render-intent có gắn nhãn](2026-07-02-tool-render-intent-union.md) cung cấp `card:'diff'` cho write/edit của `dsh-tool-fs` tại thời điểm gọi, được suy ra thuần túy từ tham số công cụ: write ⇒ `{oldText:null, newText:content}` (toàn bộ file mới), edit ⇒ `{oldText:old_string, newText:new_string}` (đoạn thay thế trần). UI có thể render nó thành diff nội tuyến, nhưng đây là một diff **không có ngữ cảnh**: `old_string`→`new_string` trần không có các dòng xung quanh, và một lần `replace_all` chạm vào năm vị trí rải rác vẫn render thành một cặp đoạn.

Khi tích hợp với ACP (Agent Client Protocol) bridge của chính `claude-agent-acp`, có thể thấy hình dạng của một diff trình soạn thảo đầy đủ: sau khi thay đổi được áp dụng, nó phát ra một `tool_call_update` thứ hai, với diff là **applied hunk có ±3 dòng ngữ cảnh** (mỗi vị trí thay đổi của `replace_all` có một hunk riêng), được tái tạo từ `structuredPatch` của công cụ. Chính hunk tại thời điểm kết quả này khiến Zed hiển thị thay đổi *tại chỗ* trong file (thay vì đoạn nổi). Các công cụ của chúng ta chỉ dừng ở đoạn tại thời điểm gọi; kết quả sau khi hoàn tất chỉ mang văn bản thuần "updated successfully", không có diff.

Trở ngại nằm ở một ranh giới seam: `presentResult(args, result)` là **hàm thuần túy của `args` + `result` hướng tới mô hình (`{content, isError}`)** — nó chạy cả trong streaming thời gian thực lẫn khi phát lại nhật ký phiên, do đó phải có tính xác định khi phát lại và không được thực hiện I/O. Nó không nhìn thấy nội dung file trước/sau, và `FsEditOutcome`/`FsWriteOutcome` chỉ mang số lượng thay thế và số phiên bản, không có văn bản. Vì vậy không thể tính toán — thậm chí không thể mang — applied hunk cho presenter.

## Quyết định

Thêm một **kênh trình bày riêng của công cụ, được lưu bền vững**, cho phép `execute` của công cụ đính kèm một payload render tại thời điểm kết quả và tồn tại qua phát lại, và dùng nó để mang diff applied-hunk.

### 1. Quy chuẩn hóa phép chiếu trình bày có thể phát lại trên đầu ra công cụ (core)

Cách triển khai ban đầu cho phép `execute` trả về `{ content, meta }`. [Hợp đồng đầu ra công cụ chuẩn](2026-07-20-canonical-tool-output-contract.md) thay thế hình thức viết này: mỗi công cụ giờ trả về một giá trị JSON được schema khai báo, `output.render(args, value)` suy ra các khối nội dung hướng tới mô hình từ đó, còn `output.presentationMeta(args, value)` tùy chọn suy ra dữ liệu UI có thể phát lại.

`presentationMeta` là một `JsonValue` thuộc sở hữu của công cụ; core lưu bền vững nó nhưng không diễn giải các trường bên trong. `Session.append` xác thực nó cùng với phần còn lại của sự kiện, và khi phát lại, payload đã lưu được truyền lại cho `presentResult`; nhờ đó trình bày tái tạo được mà không cần I/O hay tính toán lại. Bản thân giá trị chuẩn chỉ tồn tại trong lúc thực thi, không gia nhập định dạng phiên.

Đây vẫn là một hình thức chung ("công cụ chiếu kết quả trình bày được lưu bền vững"), chứ không riêng cho fs; bất kỳ công cụ nào cũng có thể dùng.

### 2. Công cụ tính hunk; backend trả về before/after (fs)

Theo [tách capability-seam](2026-06-13-capability-seams.md), backend lưu trữ chỉ trả về **sự kiện lưu trữ**, còn công cụ hướng tới mô hình sở hữu **trình bày**:

- `dsh-fs` mở rộng `FsEditOutcome` để bao gồm `{ before: string; after: string }`, mở rộng `FsWriteOutcome` để bao gồm `{ before: string | null; after: string }` (`before: null` biểu thị việc tạo mới, hoặc file đã tồn tại nhưng không thể diff được vì là nhị phân/không phải UTF-8). Backend cục bộ đã giữ cả hai bản văn bản khi ghi; nó trả về văn bản đã chuẩn hóa LF thô, **không để bất kỳ khái niệm diff/UI nào lọt vào seam**.
- `dsh-tool-fs` trả về sự kiện trước/sau đã chuẩn hóa, và chiếu hunk ngữ cảnh thành `meta: { diffs: FileDiff[] }`. Thay đổi thành công hoàn tất kèm view diff: tạo mới hoặc ghi đè không thay đổi gì sẽ quay lại diff toàn file suy ra từ tham số, còn chỉnh sửa dùng applied hunk. Thay đổi thất bại không mang metadata diff, thông báo lỗi vẫn render bình thường.

### 3. Tầng vận chuyển UI render kết quả view `diff`

`ToolResultView` bao gồm `DiffResultView { card:'diff'; title?; diffs: FileDiff[] }`. TUI và các bên tiêu thụ JSON-RPC/Web switch trên cùng một view có gắn nhãn, thay đoạn không ngữ cảnh của lệnh gọi đang chờ bằng hunk kết quả đã áp dụng. [Tầng bridge ACP chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md) không mang theo trình bày công cụ.

## Phương án thay thế từng cân nhắc

**Tự viết tay hoặc vendor một thuật toán diff.** Hunk ngữ cảnh có các trường hợp biên đã biết, do đó `dsh-tool-fs` dùng gói [`diff`](https://www.npmjs.com/package/diff) có kiểu, và chuẩn hóa đầu ra `structuredPatch` trong một module. Chính sách vendor của repo áp dụng cho mã nguồn framework, không phải cho từng thư viện công cụ lá.

## Hệ quả

Sự kiện `tool/result` mang theo payload `meta` riêng của công cụ; nó thuộc từ vựng định dạng đĩa, bị `Session.append` giới hạn trong JSON tại thời điểm chạy. Bất kỳ công cụ nào cũng có thể chiếu trình bày kết quả được lưu bền vững mà không cần sửa core thêm nữa. Thẻ diff được tái tạo miễn phí khi phiên được nạp lại và khi phát lại snapshot: nó được đọc lại từ nhật ký, không bao giờ tính toán lại. Cái giá: thao tác ghi đè giữ đồng thời cả văn bản cũ và mới trong bộ nhớ để tính hunk chỉ dùng cho UI (`TODO(overwrite-diff-bound)`), và `dsh-tool-fs` đưa vào một dependency runtime nhỏ, đã biết rõ.

## Không phải mục tiêu

- **Streaming diff tăng dần theo thời gian thực.** Hunk được tính một lần sau khi thay đổi hoàn tất; không có diff theo từng phím gõ.
- **Diff cho ghi đè nhị phân/không phải UTF-8.** `before` của các file này là `null` (không có cơ sở để diff văn bản); việc ghi vẫn thành công, kết quả render diff toàn file (`oldText: null`) thay vì hunk ngữ cảnh.
- **Diff cho đổi tên/di chuyển.** Chỉ giới hạn ở diff nội dung của một đường dẫn đã được resolve.
- **Giới hạn kích thước cơ sở diff cho ghi đè.** Thao tác ghi đè đọc toàn bộ file cũ vào bộ nhớ để tính hunk ngữ cảnh (cộng với nội dung mới đã giữ sẵn), do đó việc ghi đè văn bản rất lớn sẽ cấp phát hai bản văn bản chỉ để phục vụ diff cho UI. Cải tiến tương lai có thể đặt giới hạn đọc trước, vượt ngưỡng thì quay về diff toàn file/không ngữ cảnh; được theo dõi tại vị trí đọc bằng `TODO(overwrite-diff-bound)`.

## Liên quan

- Hoàn tất mục cuối cùng về biểu diễn khác biệt được liệt kê là không phải mục tiêu trong [Union kiểu render-intent có gắn nhãn](2026-07-02-tool-render-intent-union.md) — mục "Không phải mục tiêu" của Agent Note đó đã được cập nhật, ghi nhận diff applied-hunk được giao ở đây.
- Dựa trên [capability seam của hệ thống file](2026-06-17-filesystem-capability-seam.md) (before/after là sự kiện lưu trữ do backend trả về) và [phiên nguồn từ sự kiện](2026-06-11-event-sourced-sessions.md) (payload `meta` được lưu bền vững trên sự kiện `tool/result`, nên phát lại tái tạo được thẻ).
- Kênh `meta` được thiết kế có chủ đích để mang tính tổng quát: các công cụ tương lai (tìm kiếm có cấu trúc, kết quả bảng dữ liệu) có thể đính kèm trình bày kết quả bền vững của riêng chúng mà không cần sửa core thêm nữa.
