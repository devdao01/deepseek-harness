# Agent Note: Loại bỏ banner khởi động

Status: implemented

Archived: 2026-07-26

[English](2026-07-21-tui-no-banner.md) | 中文

> **Đã bị thay thế**, xem [Agent Note về banner không khung viền](2026-07-21-tui-borderless-banner.md): banner cùng animation sweep của nó đã quay lại, chỉ bỏ khung. Nơi footer mà ghi chú này thiết lập cho model vẫn được giữ nguyên.

## Problem

Khi khởi động, TUI hiển thị một banner sản phẩm có khung ("DEEPSEEK HARNESS" + chi tiết model/session), phiên bản gần nhất còn có animation sweep ([Agent Note về banner sweep](2026-07-21-tui-banner-sweep.md)). Phán quyết của người dùng: xóa nó. Một tiêu đề sản phẩm được đọc lại mỗi lần khởi động chỉ là trang trí, khung viền chiếm mất bốn dòng trước bất kỳ nội dung nào, còn thông tin nhận dạng nó mang theo (model, session) có nơi tốt hơn để đặt.

## Decision

- Xóa `HeaderComponent`, animation sweep và phần kết nối vòng đời của nó. TUI mount trực tiếp vào transcript; khi khởi động không render gì phía trên đường phân cách.
- Tên model chuyển vào đoạn bên trái của dòng trạng thái footer (`<model>  <cwd>  ↑tokens ↓tokens`), do đó model mà session đang dùng luôn hiển thị, chứ không chỉ lúc khởi động. Session id không còn hiển thị nữa — nó tồn tại trong log session và tên file `./.sessions`, `dsh --resume <id>` và bộ chọn `/resume` sẽ lấy id từ đó.
- Khi `welcome` được cấu hình, nó xuất hiện như dòng đầu tiên của transcript (một thông báo được làm mờ) render bên trong `rebuildTranscript`, do đó việc chuyển đổi bảng màu vẫn giữ nguyên nó. Nếu không thiết lập thì không render gì cả. Fixture giữ nguyên lời chào theo cấu hình riêng của mình; điểm neo khởi động của smoke test PTY được đổi thành tên model ở footer — đây là văn bản duy nhất được đảm bảo render sau khi mount, bất kể cwd dài đến đâu.

Ghi chú này thay thế hoàn toàn [Agent Note về banner sweep](2026-07-21-tui-banner-sweep.md): cả animation sweep lẫn banner mà nó tạo hiệu ứng đều đã bị loại bỏ.

## Alternatives considered

**Giữ lại header một dòng (bỏ khung viền).** Từ chối: thông tin duy nhất đáng giữ lại là tên model, mà footer đã tổng hợp trạng thái session rồi; giữ một dòng header riêng cho một thông tin duy nhất vẫn là cùng một loại trang trí, chỉ nhỏ hơn.

**Đưa session id vào footer.** Từ chối: một UUID 36 ký tự sẽ chiếm hết footer 100 cột và cắt mất đoạn trạng thái; công dụng của nó là định danh để khôi phục session, thuộc mối quan tâm của log/hệ thống file, không phải thông tin cần nhìn thoáng qua là thấy.

**Render lời chào ngoài transcript (phía trên đường phân cách).** Từ chối: bất kỳ vùng cố định nào phía trên transcript cũng sẽ lại biến thành banner; là một dòng transcript, nó sẽ tự nhiên cuộn đi và được giữ lại sau khi tái tạo thông qua cùng đường dẫn với các thành phần transcript khác.

## Consequences

- Output khởi động lại hoàn toàn xác định — không còn khung hình animation nào; cơ chế vòng đời timer để lại từ hai lần lặp animation đã bị loại bỏ hoàn toàn.
- Toàn bộ 26 snapshot terminal pi-tui được ghi lại (`test:snapshot:refresh`): dòng banner biến mất, dòng footer có thêm prefix model.
- Nội dung neo vào văn bản banner (`DEEPSEEK`, góc khung) được đổi thành neo vào tên model ở footer; `main-session-` không còn xuất hiện trong output khởi động.
- `/clear` giờ cũng xóa cả dòng chào: nó là một dòng transcript bình thường, và `/clear` xóa transcript (banner cũ có thể sống sót qua `/clear` chỉ vì nó nằm ngoài transcript).
- Đoạn trái của footer rộng ra; đoạn trạng thái bên phải bị cắt sớm hơn trên terminal hẹp.

## Testing

`packages/ui/tui/tests/tui.spec.ts` cố định: khi `welcome` không được thiết lập thì không có góc khung/tiêu đề sản phẩm, transcript rỗng, model ở footer; lời chào đã cấu hình xuất hiện là dòng đầu tiên của transcript và không có banner; lời chào được giữ lại sau khi tái tạo transcript do chuyển đổi bảng màu. Smoke test PTY lấy tên model ở footer làm điểm neo khởi động và khẳng định `DEEPSEEK HARNESS` không xuất hiện. Snapshot kiểm chứng toàn bộ khung hình.
