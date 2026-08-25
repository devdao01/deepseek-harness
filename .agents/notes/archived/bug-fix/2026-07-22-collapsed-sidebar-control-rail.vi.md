# Agent Note: Giữ lại thanh điều khiển khi sidebar bị thu gọn

Status: implemented
Archived: 2026-07-26

[English](2026-07-22-collapsed-sidebar-control-rail.md) | 中文

## Vấn đề

Thao tác đóng sidebar sẽ lưu bền (persist) giá trị chiều rộng ưa thích là `0`, sau đó layout ánh xạ giá trị này thành một track lưới có chiều rộng bằng không. Nút bật/tắt và điểm truy cập cài đặt duy nhất của sidebar đều nằm trong track bị cắt này, vì vậy đóng sidebar sẽ loại bỏ toàn bộ control có thể nhìn thấy để khôi phục lại. Khi tải lại trang, giá trị ưa thích "đóng" vẫn được đọc lại, khiến trạng thái này rơi vào tình trạng không thể khôi phục.

## Quyết định

Layout ánh xạ sidebar đã đóng (chiều rộng lưu bền là `0`) thành một chiều rộng cố định `SIDEBAR_COLLAPSED` là 56px: đặt một cột control dạng icon 24px giữa hai lề trong (padding) ngang 16px ở hai bên sidebar. Track sidebar có chiều rộng cố định trong bộ giải (solver) — dù mở rộng hay thu gọn đều không nhường cho áp lực viewport (chỉ có phần details mới co lại rồi tự động đóng); thanh điều khiển giữ lại đường viền phải, và chiều rộng đã mở rộng được lưu trữ vẫn giữ nguyên không đổi.

`AppFrame` đánh dấu sidebar là đã thu gọn hay chưa dựa trên giá trị chiều rộng ưa thích đã lưu bền, chứ không dựa trên chiều rộng track sau khi giải; khi thu gọn, tay cầm chỉnh kích thước bị loại bỏ, và tại điểm render, `collapsed` được truyền vào slot sidebar dưới dạng owner props. Thu gọn và mở rộng đều có animation: frame áp dụng đường cong chuyển động (transition curve) sidebar của deepsuite cho `grid-template-columns` (và `left` của tay cầm còn lại) — dùng `--ds-ease-in-out` kết hợp `--ds-transition-duration-slow`, cả hai biến này do bảng base của ui-theme cung cấp; transition tạm dừng trong lúc kéo và khi bật `prefers-reduced-motion`.

`SidebarRoot` đọc thuộc tính `collapsed` từ owner, transition là kết hợp trượt + crossfade: nội dung ở trạng thái mở rộng được đóng băng ở chiều rộng ban đầu bằng inline style, mờ dần tại chỗ trong 150ms, và cột lưới đang trượt sẽ cắt (clip) nó — trong lúc trượt không xảy ra reflow nào. Khi settle, nội dung chỉ dành riêng cho trạng thái rộng (logo thương hiệu, nhãn văn bản, ô nhập, cây phiên) được unmount — kéo theo việc hủy đăng ký (unsubscribe) khỏi danh sách phiên và rời khỏi render tree cũng như accessibility tree — hàng control rơi vào vị trí trên thanh điều khiển (nút bật, tạo phiên mới, tạo workspace mới, tìm kiếm, theo thứ tự từ trên xuống dưới khớp với các hàng ở trạng thái mở rộng), mờ dần hiện ra khi trượt kết thúc. Mỗi control trên thanh điều khiển giữ hành vi tương ứng với control tương đương ở trạng thái mở rộng (icon tìm kiếm mở rộng sidebar và focus vào ô tìm kiếm sau khi trượt kết thúc) và có kèm tooltip; nút bật hiển thị logo cá voi khi tĩnh, chuyển sang icon panel khi hover. Từ khóa tìm kiếm được lưu giữ ở root component, tồn tại xuyên suốt các lần thu gọn/mở rộng qua lại.

## Các phương án thay thế đã cân nhắc

- **Render nút mở rộng phía trên cột trung tâm**: không chọn, vì cách này chỉ khôi phục được nút bật, không giữ lại được vùng cài đặt thường trực, đồng thời khiến UI sidebar bị chia thành hai package (gói) nắm giữ riêng biệt.
- **Giữ track lưới chiều rộng bằng không, để thanh điều khiển tràn (overflow) ra ngoài hiển thị**: không chọn, vì thanh điều khiển sẽ chồng lấn với cột trung tâm, đồng thời khiến việc hit-testing và quan hệ hình học responsive tách rời khỏi layout lưới.
- **Giữ nguyên toàn bộ cây sidebar được mount, ẩn đi bằng cách cắt (clip)**: không chọn, vì các control ẩn vẫn còn lưu trong cây ngữ nghĩa (semantic tree), và vẫn tiếp tục đăng ký, render, dù trạng thái thu gọn chỉ cần hai control.

## Hệ quả

- Sidebar thu gọn chiếm 56px, thay vì nhường toàn bộ chiều rộng cho cột trung tâm. Khi mở rộng, chiều rộng đã lưu bền và hành vi kéo được khôi phục.
- Điểm truy cập cài đặt luôn hiển thị, nhưng vẫn giữ hành vi placeholder như cũ; thay đổi lần này không cung cấp trang tài khoản hay trang cài đặt.
- Test bộ giải layout cố định (pin) chiều rộng thu gọn, test component sidebar cố định các control hiển thị, còn smoke test Web không cần khóa (keyless) dựa trên sản phẩm build thật thì cố định hành vi thu gọn và khôi phục thông qua client đã được lắp ráp.
