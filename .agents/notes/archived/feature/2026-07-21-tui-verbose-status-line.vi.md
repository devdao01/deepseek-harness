# Agent Note: Dòng trạng thái chạy hiển thị giai đoạn lượt và thời lượng đã dùng

Status: implemented

Archived: 2026-07-26

[English](2026-07-21-tui-verbose-status-line.md) | 中文

## 问题

Trong lúc lượt đang chạy, [TUI toàn màn hình](2026-07-17-dedicated-full-screen-tui-front-door.md) trước đây chỉ hiển thị một hoạt ảnh loader "Working" tĩnh. Nó không cho biết bước hiện tại đã tốn bao lâu, cũng không cho biết agent (trí tuệ nhân tạo) đang làm gì — chờ mô hình, suy nghĩ, stream ra câu trả lời, hay đang chạy công cụ — do đó không thể phân biệt được lượt chạy chậm hoặc bị treo với lượt chạy nhanh.

## 决策

- Trong lúc lượt đang chạy, dòng trạng thái phía trên editor hiển thị một nhãn giai đoạn được suy ra cùng thời lượng đã dùng, và vẫn giữ gợi ý `— Enter sends steering, Esc cancels` ở cuối. Bốn giai đoạn cùng nhãn của chúng là `waiting` → "Waiting for the first token", `thinking` → "Thinking", `responding` → "Responding", `executing` → "Executing tools".
- Giai đoạn là trạng thái hiển thị mà TUI suy ra từ các sự kiện phiên thời gian thực, chứ không phải sự kiện phiên hay trạng thái agent riêng của nó. `step/start` chuyển sang `waiting`; đoạn reasoning trong `assistant/chunk` hoặc khối reasoning bắt đầu (`block-start`) chuyển sang `thinking`; đoạn text hoặc khối text bắt đầu chuyển sang `responding`; `tool/call` chuyển sang `executing`. Bản ánh xạ sự kiện này có thể mở rộng bằng cách gộp thêm, do đó mọi loại sự kiện còn lại rơi vào nhánh mặc định, giữ nguyên giai đoạn không đổi.
- Nhãn báo cáo hai đồng hồ — `<phase> <phase-elapsed> · total <step-elapsed>` — nhưng `waiting` chỉ hiển thị tổng thời lượng của bước. Đồng hồ giai đoạn được đặt lại khi thực sự có chuyển đổi giai đoạn hoặc bước mới bắt đầu; đồng hồ bước được đặt lại khi có `step/start`. Thời lượng được định dạng thành `8s` khi dưới một phút, và `1m05s` khi đạt hoặc vượt một phút. Thời gian công cụ giữa `step/end` và `step/start` tiếp theo được tính vào tổng thời lượng của bước đã kết thúc.
- Một bộ điều khiển `RunningStatus` duy nhất — loader, giai đoạn, hai mốc thời gian tham chiếu và một bộ đếm giờ làm mới — chỉ tồn tại trong lúc lượt đang chạy. Một `setInterval` kích hoạt mỗi giây sẽ làm mới thời lượng đã dùng; các sự kiện giai đoạn thì làm mới ngay lập tức. `clearStatus` xóa interval đó, dừng loader và loại bỏ bộ điều khiển, do đó bất kỳ chuyển đổi nào sang idle hay disposed đều không để lại bộ đếm giờ đang hoạt động, nhất quán với việc dọn dẹp bộ đếm giờ của [banner không viền](2026-07-21-tui-borderless-banner.md). Việc dựng lại bảng màu giữa chừng lượt (khi lược đồ màu terminal thay đổi, `setStatus` sẽ suy ra lại viền editor) sẽ mang theo cả giai đoạn và hai mốc thời gian tham chiếu, do đó trạng thái đang chạy không bao giờ tụt về `waiting`.

## 曾考虑的替代方案

**Phát ra giai đoạn như một sự kiện phiên hoặc trạng thái agent.** Đã bác bỏ: giai đoạn là chi tiết hiển thị mà TUI dựng lại từ các sự kiện đã ghi log. Một giai đoạn tồn tại lâu dài, mô hình có thể nhìn thấy sẽ, theo quy tắc model-visible ⟺ logged, yêu cầu thêm một sự kiện phiên mới mà không mang lại lợi ích gì cho mô hình.

**Tái sử dụng bộ đếm giờ hoạt ảnh `Loader` của pi-tui để làm mới văn bản thời lượng đã dùng.** Không khả thi: `Loader` là phụ thuộc vendored, chỉ điều khiển glyph hoạt ảnh loading của nó, phần dist của nó không thuộc quyền chúng ta chỉnh sửa. TUI tự giữ một interval mỗi giây độc lập, và xóa nó khi tháo dỡ.

**Suy ra giai đoạn từ trạng thái cạn công cụ hoặc thành phần streaming.** Đã bác bỏ: các sự kiện vòng đời `step/start`, `assistant/chunk` và `tool/call` là những tín hiệu sạch hơn, đã được xử lý trong cùng một listener thời gian thực, và tránh làm dòng trạng thái phụ thuộc vào các thành phần khác.

**Chỉ hiển thị thời lượng đã dùng, hoặc chỉ hiển thị giai đoạn.** Đã bác bỏ: cần cả hai — thời lượng theo giai đoạn trả lời agent đang làm gì, tổng thời lượng theo bước trả lời bước đó đã tốn bao lâu.

## 后果

- Dòng trạng thái ví dụ hiển thị `Thinking 4s · total 8s — Enter sends steering, Esc cancels`, nhờ đó hoạt động hiện tại của agent và thời lượng bước hiện rõ ràng, cả hiện tượng treo cũng trở nên có thể quan sát.
- Việc phát hiện giai đoạn là hiển thị nỗ lực tối đa: các đoạn hoặc loại sự kiện chưa xử lý trong tương lai sẽ giữ nguyên giai đoạn trước đó, tuyệt đối không ném lỗi.
- Mỗi lượt đang hoạt động chạy đúng một `setInterval`, được xóa cùng bộ điều khiển ở mỗi lần chuyển sang idle hay disposed cũng như khi tắt.

## 测试

`packages/ui/tui/tests/tui.spec.ts` cố định từng nhãn giai đoạn theo sự kiện kích hoạt (`step/start`, đoạn và khối bắt đầu của reasoning và text, `tool/call`), và cố định rằng bước mới sẽ mở lại cửa sổ chờ, thời lượng đã dùng tăng lên sau khi vượt quá một giây trên bộ đếm giờ riêng của bộ điều khiển, bước vượt quá một phút render thành `1m…`, việc thay đổi lược đồ màu giữa chừng lượt sẽ giữ lại giai đoạn và thời lượng đã dùng, và các sự kiện thời gian thực đến trước khi lượt bắt đầu không di chuyển bất kỳ trạng thái nào. Đã xác minh thực tế trong tmux.
