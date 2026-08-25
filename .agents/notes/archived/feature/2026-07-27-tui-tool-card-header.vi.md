# Agent Note: Fixed `Tool / <name>` header for tool-call cards

Status: implemented

Archived: 2026-08-04

[English](2026-07-27-tui-tool-card-header.md) | 中文

## Problem

TUI trước đây render mỗi lệnh gọi công cụ thành `{glyph} {title}`, trong đó `title` là chuỗi "động từ cộng chi tiết" do presenter ghép lại (`Read src/index.ts (1200-1360)`, `Edit files`, hoặc mô tả do mô hình sinh ra cho thẻ bash), hiển thị in đậm và gạch chân theo màu trạng thái. Một khe phẳng duy nhất phải mang cả danh tính công cụ, đối tượng thao tác và trạng thái, còn style thì trộn lẫn in đậm, gạch chân và màu sắc, thiếu nhất quán — tiêu đề đọc lên như nhiễu, "công cụ nào đã chạy" không thể phân biệt về mặt hình ảnh với "nó thao tác trên cái gì".

## Decision

Tiêu đề là khung `{ring} Tool / <name>` cố định, dùng một màu trạng thái phẳng duy nhất — không in đậm, không gạch chân, không làm tối — do đó cả dòng giữ màu nhất quán. `Tool` là hằng số chữ nghĩa; `<name>` là tên công cụ gốc. Dấu phân cách là ký tự `/` ASCII. Nhãn hình khuyên là `○` khi lệnh gọi đang treo, `●` khi đã chốt; màu tiêu đề (warning khi đang treo, success khi thành công, error khi lỗi) phân biệt trạng thái treo, thành công và lỗi, do đó cùng một vòng đặc có thể phục vụ cả hai trạng thái đã chốt.

Tiêu đề chỉ mang theo duy nhất một nội dung bổ sung tùy chọn: thẻ bash (terminal) có mô tả do mô hình viết, được nối thêm dưới dạng đoạn ` / <desc>` (`● Tool / bash / Run the coverage gate`). Các công cụ khác không đóng góp chi tiết nào vào tiêu đề.

Mọi chi tiết riêng của từng công cụ được chuyển xuống khối nội dung dưới tiêu đề. Tiêu đề presenter của thẻ không phải terminal (`Read src/index.ts`, `Grep pattern`) trở thành dòng đầu của nội dung, trừ khi nó chỉ lặp lại tên công cụ (presenter dự phòng cho công cụ không có `presentCall`, hoặc công cụ không xác định), lúc đó tiêu đề đã hiển thị rồi. Thẻ terminal giữ lại lệnh của nó làm dòng `$`. Thẻ diff bỏ hẳn tiêu đề của nó — ý nghĩa do tiêu đề đường dẫn của từng tệp và một dòng chân trang thay đổi mang lại — và thêm một dòng chân trang tối màu `└ +A -R · N file(s)`, tổng hợp số dòng thêm/xóa của từng tệp.

Lần cải tổ này chỉ giới hạn ở TUI. Nó thay đổi `ToolCardComponent` trong `packages/ui/tui/src/components/transcript.ts`, không đụng đến bất kỳ presenter nào: khung `Tool / <name>` ở phía TUI suy ra tên từ tên công cụ của lệnh gọi, còn việc di chuyển tiêu đề nội dung tái sử dụng tiêu đề mà presenter đã trả về. `presentation.ts` cùng mọi `presentCall`/`presentResult` đều giữ nguyên không đổi.

## Alternatives considered

**In đậm tên công cụ để làm nổi bật.** Đã bác bỏ: trên terminal render SGR-1 thành biến thể sáng, tên công cụ màu xanh in đậm đọc lên là màu khác với phần còn lại của tiêu đề màu xanh — tái tạo lại chính sự thiếu nhất quán mà lần cải tổ này muốn loại bỏ. Tên công cụ nổi bật nhờ vị trí của nó trong khung cố định, chứ không phải nhờ độ đậm chữ.

**Giữ tiêu đề presenter trong tiêu đề** (ví dụ `Tool / read / Read src/index.ts`). Đã bác bỏ: động từ và tên công cụ trùng lặp, còn công cụ không phải bash thì không thực sự có một mô tả một dòng độc lập — đối tượng thao tác thuộc về nội dung, do đó chỉ bash đóng góp đoạn mô tả vào tiêu đề.

**Thêm một dòng tổng hợp chân trang cho mọi loại thẻ** (số dòng, huy hiệu mã thoát, số lượng diff thống nhất thành một dòng `└ …`). Đã hoãn lại: chỉ chân trang diff được triển khai. Việc thoát terminal giữ nguyên dòng `[exit N]` tối màu sẵn có, đầu ra dài giữ nguyên việc lược bớt đoạn giữa đầu/cuối sẵn có, kết quả rỗng giữ nguyên chỉ có tiêu đề, nội dung lỗi giữ nguyên đơn giản (chỉ màu tiêu đề mang thông tin lỗi) — những cách xử lý sẵn có này là cố ý giữ lại, không phải bỏ sót. Nội dung ban đầu trải phẳng theo màu tiền cảnh mặc định, style này sau đó cũng đã được điều chỉnh: [Hiển thị TUI hợp nhất](../architecture/2026-07-28-consolidated-tui-presentation.md) gom toàn bộ nội dung vào cùng một tông tối màu, nằm dưới tiêu đề trạng thái có màu như mô tả trong bài này.

## Consequences

Lệnh gọi công cụ nay hiển thị danh tính ở một vị trí ổn định, mỗi dòng trạng thái đọc lên là một màu phẳng, do đó việc quét nhanh bản ghi của nhiều lệnh gọi trở thành một cột `Tool / <name>`, chứ không phải một bức tường chuỗi động từ pha trộn style. Cái giá là các công cụ không phải terminal có thêm một dòng nội dung (tiêu đề đã di chuyển), và mất đi việc chống trùng lặp trước đây — khi tiêu đề đã đặt tên đường dẫn thì bỏ qua đường dẫn từng tệp của diff; nay tiêu đề không còn đặt tên bất kỳ đường dẫn nào, do đó mỗi diff sẽ in đường dẫn một lần. Vì thay đổi chỉ giới hạn trong `ToolCardComponent`, các cầu nối UI khác (ACP, JSON-RPC) giữ nguyên cách hiển thị lệnh gọi công cụ riêng của chúng; hình thái `Tool / <name>` là cục bộ của TUI, không thuộc bất kỳ hợp đồng xuyên package nào.

## Testing

`packages/ui/tui/tests/tui.spec.ts` cố định tiêu đề mới (`Tool / <name>`), tiêu đề diff đã bỏ, tiêu đề generic sau khi di chuyển và chân trang `· N file(s)`. Bản chụp nhanh ngữ nghĩa cấp package bao phủ các loại thẻ trong terminal không giao diện. Luồng ứng dụng đã bị xóa trước đây từng cung cấp việc thực thi công cụ đã lắp ráp; các triển khai terminal trong tương lai chịu trách nhiệm cung cấp độ bao phủ transcript tương đương.
