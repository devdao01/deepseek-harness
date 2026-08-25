# Agent Note: Cột session dành riêng cùng một khe thanh cuộn cho mỗi view

Status: implemented

[English](2026-08-04-composer-tab-gutter-reservation.md) | 中文

## Vấn đề

Chỗ ngồi (seat) của composer trong cây component chỉ có một node, một vị trí, nhưng nó thực sự căn theo cạnh nào lại phụ thuộc vào tab view nào đang hiển thị.

Trong Chat, nó là **phần tử con** sticky của container cuộn cột session (`[data-conversation-scroll]`), do đó gắn liền với content box của container đó — mà một thanh cuộn chiếm chiều rộng layout sẽ thu hẹp box này đi đúng bằng chiều rộng thanh cuộn. Các view khai báo `data-conversation-composer-overlay` (Trajectory là một ví dụ) chuyển việc cuộn của cột session vào bên trong chính view đó: nhánh có điều kiện dựa trên thuộc tính này giữ container cuộn ở dạng `overflow: hidden`, và đổi seat sang absolute positioning — căn theo padding box, mà thanh cuộn không bao giờ thu hẹp box này.

Do đó, chỉ cần transcript (bản ghi văn bản) vượt quá một màn hình — trạng thái thông thường của bất kỳ session nào có lịch sử — hai tab lệch nhau đúng bằng chiều rộng một thanh cuộn. Thẻ input được căn giữa, nên với thanh cuộn 8px, việc chuyển tab sẽ khiến nó dịch ngang 4px, còn khoảng trắng bên phải thay đổi trọn 8px. Cùng độ dịch chuyển này cũng xuất hiện ngay trong Chat: ở khoảnh khắc transcript tăng đến mức bắt đầu cuộn, và khi chuyển từ trạng thái hero sang turn có thể cuộn đầu tiên.

## Quyết định

`.scrollBody` khai báo `scrollbar-gutter: stable` cho trạng thái Chat, còn nhánh overlay ghi đè thành `scrollbar-gutter: auto`, đồng thời vẫn giữ là container cuộn hai trục — `overflow-x: hidden; overflow-y: auto`. Việc dành chỗ này chỉ thuộc về Chat: nó giữ cho content box của seat có cùng chiều rộng bất kể transcript có tràn hay không, nên thẻ không nhảy ở khoảnh khắc transcript tăng đến mức bắt đầu cuộn, cũng không nhảy giữa trạng thái hero và turn có thể cuộn đầu tiên. Nhánh overlay không dành chỗ nào cả — view tự cuộn lấy, khe chỗ chỉ vô ích thu hẹp nội dung view — seat của nó chuyển sang bù trừ chiều rộng thanh cuộn ([bù trừ chiều rộng seat](2026-08-12-composer-overlay-seat-width-compensation.md)).

Chọn `stable` thay vì `auto`, vì `auto` chỉ dành chỗ khi box thực sự tràn, mà "tràn hay không" chính là điểm khác biệt giữa hai pha của Chat — cách viết `auto` chỉ diễn đạt lại lỗi, chứ không sửa được nó.

Việc dành chỗ này nằm trên box `overflow-y: auto`, và hình thức này mang tính chịu lực: WebKit áp dụng `scrollbar-gutter` cho box `overflow-y: auto`, nhưng bỏ qua nó với box hidden — điều này đã được kiểm chứng thực tế trên chính lớp của composer trong ứng dụng này, và được ghi lại trong [ghi chú về scroll viewport của composer](2026-07-31-composer-text-layers-share-one-scrollport.md) — nên đặt việc dành chỗ trên box hidden sẽ đúng trên Chromium, nhưng âm thầm sai trên Safari. Nhánh overlay cũng giữ hình thức `overflow-y: auto`, như một clipping box mà không có nội dung nào cuộn ra ngoài: box cuộn một trục sẽ tính `visible` của trục còn lại thành `auto`, nên trục ngang khai báo tường minh là `hidden` thay vì để suy luận, nếu không thì lần đầu nội dung của một view nào đó vượt ra ngoài cột, nó sẽ tự mọc thanh cuộn ngang riêng.

Việc dành chỗ này chỉ đáng giá với cái giá của nó với tiền đề rằng thanh cuộn ở đây thực sự chiếm không gian layout — đây không phải hành vi mặc định của browser, mà là lựa chọn của client này: stylesheet của ui-theme khai báo chiều rộng cho `::-webkit-scrollbar` ([theme hóa thanh cuộn](2026-07-28-themed-scrollbars-and-reserved-gutter.md)), và danh sách session của sidebar cũng dành khe thanh cuộn riêng của nó chính vì lý do tương tự.

## Các phương án đã cân nhắc

**Thu vào seat overlay theo chiều rộng thanh cuộn.** Đây là cách diễn giải hẹp nhất cho lỗi này — hai trạng thái lệch 8px, thì trừ 8px từ một bên. Bị bác bỏ, vì con số này thuộc về engine chứ không thuộc về ta: đường WebKit vẽ thanh cuộn 8px từ stylesheet, đường Firefox vẽ chiều rộng resolve từ `scrollbar-width: thin`, việc thu vào hard-code sẽ khiến hai trạng thái khớp nhau trên Chromium nhưng tiếp tục trôi dạt ở nơi khác. Khe thanh cuộn nên để engine tự dành chỗ theo đúng chiều rộng thanh cuộn của chính nó, bất kể là bao nhiêu.

**Giữ `overflow: hidden`, chỉ thêm `scrollbar-gutter: stable`.** Phiên bản một dòng. Nó sửa được triệu chứng nhìn thấy trên engine mà làn browser test dùng, nhưng để nguyên triệu chứng trên Safari, và không test nào sẽ fail — đây chính là kiểu thất bại mà nửa sau của thay đổi này phòng ngừa.

**Di chuyển seat của composer trong Chat ra khỏi container cuộn luôn, để hình học của overlay trở thành hình học duy nhất.** Đây là xóa bỏ khác biệt từ gốc, thay vì hòa giải nó, với cái giá là từ bỏ một tính chất cố ý: seat sticky nằm trong luồng cuộn, nên lăn chuột trên composer sẽ kéo theo transcript hội thoại ([sticky composer](2026-07-29-sticky-composer-conversation-scroll.md)), lớp phủ mờ dần phía trên nó cũng do chính background của seat vẽ. Cả hai đều là hành vi đã có chủ sở hữu rõ ràng và có test bao phủ riêng; xây lại chúng chỉ để xóa bỏ sự bất đối xứng 8px là một thay đổi lớn hơn, chứ không nhỏ hơn.

**Thêm padding bằng chiều rộng thanh cuộn cho cột session, thay vì dành khe thanh cuộn.** Padding có hiệu lực bất kể có thanh cuộn hay không, nên sẽ trả giá vô điều kiện cho chiều rộng đó ở mọi trạng thái, và nó đóng đinh một giá trị vốn do engine quyết định tại thời điểm layout vào stylesheet. Lý do bác bỏ giống hệt lý do sidebar list từng bác bỏ nó.

## Hệ quả

- Cột nội dung của Chat vĩnh viễn hẹp hơn 8px — kể cả ở trạng thái hero và khi transcript còn ngắn, hoàn toàn không vẽ thanh cuộn. Đây chính là sự đánh đổi: đổi cột rộng nhất lấy việc thẻ chỉ có một vị trí duy nhất ở mọi chiều cao nội dung.
- Thẻ giữ nguyên cùng vị trí qua ba lần chuyển đổi, đạt được bằng hai cơ chế: việc dành chỗ giữ cho seat của Chat có cùng chiều rộng qua các pha của chính nó (transcript ngắn ↔ có thể cuộn, hero ↔ turn có thể cuộn đầu tiên), còn việc chuyển Chat ↔ Trajectory được căn chỉnh bằng bù trừ của seat overlay ([bù trừ chiều rộng seat](2026-08-12-composer-overlay-seat-width-compensation.md)).
- Trạng thái overlay giờ là một container cuộn. Hiện tại không có nội dung nào trong đó tràn ra; nếu về sau có view cho phép nội dung của chính nó vượt quá cột session, box này sẽ cuộn thay vì cắt, và view đó cần tự có clipping riêng giống như view Trajectory.
- Golden đã commit ghi lại dải dành chỗ, nên thay đổi chiều rộng `::-webkit-scrollbar` trong stylesheet — giá trị quyết định việc dành chỗ này rộng bao nhiêu — sẽ xuất hiện dưới dạng diff có thể review trong kịch bản này, giống như trong kịch bản sidebar.

## Kiểm thử

`apps/web/tests/composer-tab-geometry.e2e.ts` đo hình chữ nhật của thẻ input dưới hai tab, lần lượt lấy viewport mà thẻ đang ở giới hạn chiều rộng và viewport mà thẻ co lại theo cột, rồi khẳng định hai hình chữ nhật đó là cùng một hình chữ nhật. Chỉ engine thật mới báo cáo được điều này: jsdom trả về kích thước box bằng 0 cho mọi phần tử, cũng không có thanh cuộn, nên unit test chỉ có thể khẳng định các khai báo tồn tại, không thể khẳng định hai trạng thái rơi vào cùng vị trí. Vì cùng lý do đó, lần này không kèm unit test đọc CSS text — nó chỉ diễn đạt lại khai báo, không bổ sung được fact mà làn browser test chưa xác lập.

Kịch bản này khởi động chromium mà bỏ cờ `--hide-scrollbars` mặc định của Playwright, điều này mang tính chịu lực: khi có cờ đó, thanh cuộn không chiếm chiều rộng layout nào, nên hai tab sẽ nhất quán như nhau dù có bù trừ hay không, và mọi phép so sánh trong file sẽ pass một cách vô nghĩa. Kiểm chứng thực tế: khi có cờ đó, cả hai dải dành chỗ đều là 0; bỏ cờ đó thì lần lượt là 8 và 0.

Sau đó, một tầng CSS chưa bù trừ được inject vào trang — qua `!important` hạ bù trừ `right` của seat overlay về 0, giữ nguyên việc dành chỗ của Chat — và đo lại cùng hai tab đó bên dưới tầng CSS này, đây chính là bước phân biệt "thẻ thực sự không di chuyển" với "việc chuyển tab hoàn toàn chưa chạm tới layout". Nó tái hiện triệu chứng đã báo cáo thành một con số: 4px mỗi cạnh, đúng bằng một nửa dải 8px. Golden ghi lại phần đối chiếu này song song với trạng thái sau khi sửa, nên fixture (dữ liệu tiền đề của test) mang theo chính khoảng chênh lệch mà thay đổi này loại bỏ, chứ không chỉ là sự vắng mặt của nó.
