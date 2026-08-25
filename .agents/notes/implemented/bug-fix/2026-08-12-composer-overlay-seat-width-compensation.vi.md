# Agent Note: Seat của composer trong overlay view đổi sang bù chiều rộng scrollbar, không còn dành sẵn rãnh scrollbar

Status: implemented

[English](2026-08-12-composer-overlay-seat-width-compensation.md) | Tiếng Việt

## Vấn đề

[composer tab gutter reservation](2026-08-04-composer-tab-gutter-reservation.md) khiến scroll container của cột session luôn dành sẵn một rãnh scrollbar vô điều kiện, để seat của composer đo được cùng chiều rộng ở cả view Chat và các view có overlay composer. Cái giá này do mỗi overlay view gánh chịu: cột nội dung của view hẹp hơn cạnh phải của cột 8px, vì scroll container dành sẵn rãnh cho một scrollbar mà nó không bao giờ vẽ ra — trajectory ledger được cuộn bởi scroll container riêng bên trong view, còn hộp bên ngoài chưa bao giờ cuộn.

Bảng trajectory làm cái giá này hiện hình: đường phân cách của cả hàng dừng lại trước cạnh phải panel 8px, để lại một dải trắng ở bên phải mỗi đường và ở bên phải toàn bộ cột nội dung.

## Quyết định

Việc dành rãnh giờ chỉ thuộc về Chat. Nhánh overlay khai báo `scrollbar-gutter: auto`, nội dung view chiếm trọn cột; seat composer của nhánh overlay (định vị tuyệt đối theo padding box) dùng `right: var(--dsh-scrollbar-width)` để nhường lại chiều rộng scrollbar, giúp thẻ input vẫn đo được cùng chiều rộng như seat của Chat, không di chuyển khi chuyển tab.

Giá trị bù không phải là một literal: scrollbar.css của ui-theme định nghĩa `--dsh-scrollbar-width` (8px trên đường WebKit) ngay cạnh quy tắc `::-webkit-scrollbar` mà nó phản chiếu, seat đọc biến này. Spec scrollbar-styles kiểm tra ghép cặp biến đó với quy tắc phản chiếu, cùng với bên tiêu thụ giá trị bù, nên nếu chiều rộng scrollbar trong stylesheet thay đổi mà biến không đổi theo — hoặc biến đổi mà bên tiêu thụ không đổi theo — sẽ khiến gate thất bại, chứ không chỉ được phát hiện lúc review.

## Phương án thay thế

**Giữ nguyên việc dành rãnh vô điều kiện, nén mỗi overlay view lại.** Hành vi trước khi sửa. Chỉ một khai báo cho cả hai tab, nhưng mỗi overlay view phải trả giá 8px cột nội dung, trajectory ledger biến điều đó thành khoảng trắng nhìn thấy được. Đã bị từ chối: overlay view tự cuộn riêng, không nên phải trả tiền cho scrollbar của Chat.

**Cũng dành rãnh ở nhánh overlay, để view tràn vào rãnh scrollbar.** Nhiều bộ phận hoạt động hơn cho cùng kết quả: rãnh scrollbar vẫn tồn tại trên một hộp không bao giờ cuộn, view còn phải phá vỡ content box mới lấy lại được chiều rộng.

**Chấp nhận dịch chuyển thẻ 4px.** Bỏ việc dành rãnh mà không bù seat sẽ làm thẻ input di chuyển mỗi lần chuyển tab — đúng triệu chứng mà note trước đã sửa. Đã bị từ chối: vị trí thẻ là một bất biến xuyên tab được giữ có chủ đích.

**Thu seat overlay vào trong theo chiều rộng scrollbar.** [Note dành rãnh scrollbar](2026-08-04-composer-tab-gutter-reservation.md) trước đây đã phủ quyết chính phương án này, note này áp dụng lại nó; điều thay đổi là tiền đề của việc phủ quyết. Con số này thuộc về engine chứ không thuộc về chúng ta — đường WebKit vẽ scrollbar 8px trong stylesheet, đường Firefox vẽ chiều rộng suy ra từ `scrollbar-width: thin` — nên việc thu vào theo số cứng sẽ khiến hai trạng thái khớp nhau trên Chromium nhưng tiếp tục lệch ở nơi khác. Trước đây nhánh overlay tự dành rãnh có chiều rộng do engine suy ra, việc thu vào phải khớp chính xác chiều rộng đó. Nay nhánh overlay không dành bất kỳ rãnh nào, việc bù trở thành cơ chế duy nhất ở phía overlay; nửa "literal" từng bị phủ quyết được xử lý bằng cách biến 8px thành một biến nằm trong cùng diff với quy tắc `::-webkit-scrollbar`. Nửa Firefox vẫn còn tồn tại: Chat dành rãnh theo chiều rộng engine suy ra, phần bù giữ cố định 8px, phần lệch còn lại ở chỗ hai giá trị không bằng nhau được ghi nhận như cái giá chấp nhận trong phần hậu quả.

## Hậu quả

- Chat giữ nguyên rãnh scrollbar và vị trí thẻ ổn định; tab này không có gì thay đổi.
- Overlay view (trajectory) chiếm trọn cột; đường phân cách của trajectory ledger chạm tới cạnh phải panel.
- Thẻ input vẫn giữ cùng vị trí ngang giữa tab Chat và Trajectory, giờ đạt được bằng hai cơ chế thay vì một: Chat dành rãnh, seat overlay bù.
- Chat dành rãnh theo chiều rộng engine suy ra, seat overlay bù một giá trị cố định 8px. Chỗ hai giá trị không bằng nhau — đường Firefox suy ra `scrollbar-width: thin` theo nền tảng, còn e2e chỉ chạy trên Chromium — thẻ sẽ lệch nửa phần chênh lệch khi chuyển tab. Đây là cái giá còn sót lại được chấp nhận, ghi nhận trung thực ở đây chứ không tuyên bố đã loại bỏ: thay đổi này không cung cấp số đo thực tế của chiều rộng thin trên Firefox ở nền tảng mục tiêu.
- `--dsh-scrollbar-width` trở thành biến công khai của ui-theme, được đọc từ bên ngoài ui-theme; spec scrollbar-styles kiểm tra ghép cặp nó với quy tắc chiều rộng `::-webkit-scrollbar` được phản chiếu, cùng với bên tiêu thụ giá trị bù, bù đắp khoảng trống gate ở tầng gián tiếp mà biến này lẽ ra sẽ để lại.

## Kiểm thử

`apps/web/tests/composer-tab-geometry.e2e.ts` vẫn khẳng định thẻ input giữ nguyên vị trí giữa các tab, và bổ sung assertion tách biệt: scroll container của Chat giữ `scrollbar-gutter: stable` với rãnh khác không, nhánh overlay resolve thành `auto` với rãnh bằng không. Việc kiểm soát cascade thay đổi theo cơ chế: giờ đây gỡ bỏ phần bù `right` của seat (thay vì gỡ rãnh mà Chat chưa bao giờ có ở nhánh này), đo được cùng độ dịch chuyển 4px, chứng minh các hình chữ nhật bằng nhau không phải vì tab chuyển đổi chưa từng chạm tới layout. Golden đã commit ghi lại cả hai trạng thái.
