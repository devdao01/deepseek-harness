# Agent Note: Tự động đặt tên terminal từ tin nhắn đầu tiên

Status: implemented
Archived: 2026-07-26

[English](2026-07-21-tui-auto-pane-title.md) | 中文

> **Đã bị thay thế**: xem [Agent Note về chuẩn hóa tiêu đề](../simplification/2026-07-22-tui-titles-from-session-title-service.md). Việc sinh `autoTitle` cục bộ trong TUI đã được loại bỏ; tiêu đề giờ lấy từ service session-title được ghi trong log, và việc đổi tên terminal tiêu thụ sự kiện `session/title`.

> **Đã bị thay thế** (về giá trị mặc định và hành vi khôi phục), xem [Agent Note về tự động bật tiêu đề mặc định](2026-07-21-tui-auto-title-default-on.md): `autoTitle` giờ mặc định bật, việc khôi phục session sẽ suy luận lại tiêu đề từ tin nhắn đầu tiên đã lưu, thay vì giữ nguyên tiêu đề tĩnh. Đường dẫn OSC 0 bên dưới, cơ chế chốt một lần, hình thức tóm tắt bằng model, lệnh gọi phát-rồi-không-đợi-kết-quả (fire-and-forget), và từng phương án dự phòng khi thất bại — tất cả vẫn còn đúng.

## Problem

Tiêu đề terminal của TUI là một chuỗi tĩnh dùng chung cho mọi session (`title`, mặc định là `DeepSeek Harness`). Với người dùng chạy mỗi agent (tác nhân) trên một pane tmux hoặc một tab terminal riêng, tất cả các tab của họ đều giống hệt nhau, khiến các pane không thể phân biệt được thoáng qua, và thanh tab cũng không mang bất kỳ tín hiệu nào về việc mỗi session đang làm gì.

## Decision

- `TuiConfig` thêm một trường boolean mới là `autoTitle` (mặc định `false`). Khi bật, TUI sẽ thực hiện một lệnh gọi model nền sau tin nhắn đầu tiên của người dùng trong một session hoàn toàn mới, và thay tiêu đề terminal bằng một nhãn ngắn gọn do model sinh ra; `title` tĩnh là giá trị khởi tạo trước khi thay thế, đồng thời cũng là phương án dự phòng.
- Nhãn này là một bản tóm tắt của model, chứ không phải là phần cắt ngắn của prompt. Request mang theo một chỉ dẫn tác vụ cố định (tóm tắt request này thành một tiêu đề ngắn gọn từ hai đến năm từ viết thường, không dấu câu) cộng với tin nhắn đầu tiên của người dùng, và không kèm tool nào; TUI lấy dòng đầu tiên không rỗng trong phản hồi và cắt ngắn còn tối đa 40 ký tự (39 ký tự cộng một dấu ba chấm).
- Tiêu đề được đặt qua `runtime.terminal.setTitle` — cùng đường dẫn OSC 0 mà `title` tĩnh vốn đã dùng. Không có mặt phẳng điều khiển terminal mới nào được đưa vào, và việc ghi terminal vẫn thuộc quyền sở hữu của pi-tui.
- Lệnh gọi này được phát ra mà không đợi kết quả trả về, và chỉ một lần cho mỗi session. Một chốt `titleSettled` bảo vệ nó: khi `autoTitle` tắt, chốt được đặt sẵn ở trạng thái đã chốt và không bao giờ chạy; ở các session được khôi phục mà tin nhắn `user/message` đầu tiên đã có trong log, chốt cũng được đặt sẵn ở trạng thái đã chốt, do đó tiêu đề tĩnh được giữ nguyên; tin nhắn đầu tiên chỉ chứa khoảng trắng sẽ bị bỏ qua và không tiêu tốn lượt dùng. Bất kỳ lỗi nào, phản hồi rỗng, thiếu service `llm`, hoặc agent thiếu `provider` hay `model`, đều khiến tiêu đề tĩnh giữ nguyên không đổi. Một `AbortController` chuyên dụng sẽ hủy request đang chạy dở khi đóng.
- Lệnh gọi tiêu đề đi thẳng tới `ctx.llm.stream`, chứ không qua `agent.send`, do đó nó không bao giờ được thêm vào session hay transcript (bản ghi văn bản), và cũng không thể làm nhiễu loạn agent loop (vòng lặp tác nhân).
- Tính năng này mặc định tắt, chỉ bật trong cấu hình sản phẩm tương tác (`examples/tui-agent/cordis.yml`) và trong fixture PTY viết kịch bản sẵn (dữ liệu chuẩn bị cho test). Nếu bật trong giá trị mặc định của schema `dsh-tui-demo` dùng chung, nó sẽ tạo thêm một lệnh gọi model trong các kịch bản replay và khởi động không cần key mà không gửi bất kỳ tin nhắn người dùng nào.

## Alternatives considered

**Cắt ngắn tin nhắn đầu tiên của người dùng, thay vì dùng model để sinh tiêu đề.** Bị từ chối: người dùng chọn một nhãn ngắn gọn do model tạo ra; prompt gốc sau khi cắt ngắn thường ồn, hay bắt đầu bằng văn bản mẫu, và hiếm khi đọc giống một tiêu đề.

**Đổi tên window (OSC 2) hoặc window của tmux.** Bị từ chối: OSC 0 chỉ đặt `pane_title`, do đó nó đánh dấu pane chứ không đổi tên, cũng không rò rỉ vào tiêu đề window của người dùng; người dùng xác nhận OSC là phương tiện đúng.

**Cho tính năng này mặc định bật.** Bị từ chối: bật trong schema demo dùng chung sẽ làm nhiễu loạn replay và snapshot khởi động không cần key, đồng thời tốn một lệnh gọi model cho mỗi session hoàn toàn mới; bật theo lựa chọn ở từng deployment giúp mặt bằng mặc định giữ được sự thụ động.

**Gộp chung với công việc tiêu đề session dựa trên log (PR #451).** Bị từ chối: thay đổi đó là metadata session được lưu bền vững vào log; hạng mục này là nhãn terminal không lưu bền vững. Giữ hai thứ độc lập nhau giúp mỗi bên tự thân nhất quán và tránh dependency dùng chung.

**Chặn lượt đầu tiên cho đến khi tiêu đề sẵn sàng.** Bị từ chối: đợi tiêu đề trước khi gửi tin nhắn người dùng sẽ thêm độ trễ vào request thực tế; phát-rồi-không-đợi-kết-quả giúp việc đổi tên không ảnh hưởng đến lượt đó.

## Consequences

- Khi bật, mỗi session hoàn toàn mới sẽ tốn thêm một lệnh gọi model không dùng tool, chỉ mang một tin nhắn người dùng ngắn gọn và một lượng nhỏ token đầu ra; khi tắt mặc định thì không phát sinh chi phí nào.
- Vì lệnh gọi tiêu đề được gắn `sessionId`, nó dùng chung con trỏ `llm-replay` với session: bật `autoTitle` trong các kịch bản snapshot dựa trên replay sẽ tiêu tốn một mục kịch bản đã ghi. Đây chính là lý do nó mặc định tắt, và fixture PTY viết kịch bản sẵn dùng một adapter phân nhánh theo tool thay vì replay để trả lời lệnh gọi đó.
- `packages/ui/tui/tests/tui.spec.ts` ghim hành vi này bằng một adapter `llm` giả (mock): tiêu đề được sinh ra thay thế tiêu đề tĩnh, đầu ra quá dài bị cắt bằng dấu ba chấm, tin nhắn đầu tiên chỉ chứa khoảng trắng vẫn giữ lại lượt dùng một lần, phản hồi rỗng hoặc lỗi vẫn giữ tiêu đề, session được khôi phục không bao giờ kích hoạt, và các đường dẫn tính năng tắt / không có service / thiếu provider / thiếu model đều giữ tiêu đề tĩnh. Một test khi tắt tính năng khẳng định request đang chạy dở bị hủy.
- `examples/tui-agent/tests/tui-keyless-smoke.e2e.ts` chứng minh đường dẫn thật đã qua Loader khởi động: adapter viết kịch bản sẵn trả lời lệnh gọi tiêu đề không dùng tool bằng một chuỗi cố định, các kịch bản hội thoại khẳng định chuỗi OSC 0 đến được PTY. Các kịch bản khởi động không gửi tin nhắn người dùng, nên chúng không bao giờ kích hoạt lệnh gọi này.
