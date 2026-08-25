# Agent Note: Thanh cuộn sidebar hiển thị theo con trỏ

Status: implemented

[English](2026-08-04-pointer-revealed-sidebar-scrollbars.md) | 中文

## Vấn đề

Danh sách session của sidebar sẽ tràn ngay khi có vài session, và kể từ lúc đó thanh cuộn của nó luôn được vẽ ra — cột chứa nó phần lớn thời gian đứng yên, trong khi các nút thao tác của chính dòng trong danh sách chỉ xuất hiện khi hover. Đây là thành phần duy nhất trong sidebar luôn thường trú, và trước khi có ai đó thực sự đưa tay vào thao tác nó, nó không mang lại khả năng thao tác nào. Yêu cầu sản phẩm (2026-08-04) là chỉ vẽ nó khi con trỏ nằm trong sidebar, và giữ lại một khoảng trễ nhỏ (linger), để tránh nó nhấp nháy khi con trỏ chỉ đi ngang qua.

## Quyết định

`SidebarRoot` theo dõi con trỏ trên toàn bộ cột, và gắn class `quietBars` vào phần tử root bất cứ khi nào con trỏ không nằm trong cột. Quy tắc được chọn bởi class đó tái gán bộ biến gián tiếp của ui-theme — `--dsh-scrollbar-thumb` và `--dsh-scrollbar-thumb-hover` — thành `transparent`, nên mọi vùng cuộn lồng bên trong cột này sẽ không vẽ thanh trượt. Hiện tại chỉ có danh sách session là vùng như vậy; các vùng mới thêm trong tương lai sẽ tự động kế thừa hành vi này mà không cần đấu nối riêng lẻ.

Độ trễ (linger) là `SCROLLBAR_LINGER_MS = 2000`: khi rời đi sẽ khởi động một timer, khi quay lại sẽ hủy timer chưa kích hoạt, chỉ khi timer thực sự kích hoạt mới gắn lại class. Khi con trỏ vượt qua ranh giới cột rồi quay lại — ví dụ đi vòng qua một menu portal, hoặc lao về phía một dòng nhưng vượt quá — sẽ không thấy thanh trượt nhấp nháy.

Sự kiện vào dùng `pointerenter` của chính cột; sự kiện ra thì phán định theo hộp giới hạn (box) của cột, thông qua một listener `pointermove` chỉ tồn tại trong lúc thanh cuộn đang hiển thị. Quan hệ chứa trong DOM không thể dùng để phán định việc ra: ui-settings render toàn bộ panel setting full màn hình dưới dạng *hậu duệ* định vị fixed của cột này, việc con trỏ di chuyển vào panel đó — hoặc di chuyển vào vùng hội thoại sau khi panel đóng lại — sẽ không kích hoạt `pointerleave` ở đây, và thanh cuộn sẽ tiếp tục được vẽ trên một cột mà không ai đang trỏ vào. Sự kiện leave của chính phần tử vẫn được giữ lại, để xử lý trường hợp mà phán định hình học không thấy được: khi con trỏ ra khỏi cửa sổ thì sẽ không còn sự kiện di chuyển nào được phát ra nữa.

Vật mang con trỏ là toàn bộ cột, chứ không phải danh sách. Con trỏ lao về phía thanh cuộn sẽ phải đi qua dòng logo, viên nang New Session và ô tìm kiếm trước, nên nếu chỉ hiển thị trên danh sách, thanh cuộn sẽ phải chờ tới khi con trỏ đã nằm giữa dòng mới xuất hiện.

`transparent` chính là lý do khiến lần hiển thị này không kích hoạt bất kỳ thay đổi layout nào. `scrollbar-gutter: stable` trên danh sách tồn tại chính là để giữ cho dòng không bao giờ di chuyển (xem [Agent Note về khe rỗng](../bug-fix/2026-07-28-themed-scrollbars-and-reserved-gutter.md)); việc tái gán chỉ thay đổi màu, còn phần dự trữ đó luôn có hiệu lực, nên thanh trượt xuất hiện đúng trong khoảng không gian mà danh sách vốn đã dành sẵn cho nó.

Chọn bộ biến gián tiếp này thay vì thêm quy tắc cho danh sách, vì chính bộ biến này là thỏa ước tái gán mà ui-theme đã quy định: một lần khai báo tác động đồng thời lên cả hai đường render (pseudo-element của WebKit và `scrollbar-color` của Firefox), còn custom property thì được kế thừa — đây chính là lý do khiến toàn bộ cột, chứ không phải từng vùng cuộn riêng lẻ bên trong cột, trở thành chủ sở hữu của trạng thái này.

Việc này mở rộng thỏa ước tái gán, nên cơ chế gate của nó ghi rõ hình thái mới ra, thay vì mặc nhiên cho qua: `ui-theme/tests/scrollbar-styles.spec.ts` chỉ chấp nhận hai đích tái gán, là bộ l2 hoặc `transparent`, và phán định trên **toàn bộ quy tắc** chứ không phải từng khai báo riêng lẻ — một quy tắc pha trộn (`thumb: transparent` đặt cạnh hover của l2) sẽ tô màu lại ngay khi con trỏ chạm vào thanh cuộn, nhưng vẫn qua được kiểm tra từng khai báo riêng lẻ. Nửa còn lại của việc nâng cấp so sánh toàn bộ giá trị với cách viết chuẩn của bộ biến này, việc này cũng từ chối các liên kết chéo và token bị bọc trong biểu thức chữ; việc gán lại về l1 và màu trần vốn đã bị chặn ngoài cửa.

Việc ẩn không còn được coi là nâng cấp: chỉ tái gán l2 mới giúp một stylesheet thoát khỏi quy tắc "bất kỳ stylesheet nào cuộn trên bề mặt đã nâng cấp đều phải tái gán". Một stylesheet vừa ẩn thanh cuộn vừa cuộn trên bề mặt đã nâng cấp thì vẫn còn thiếu l2 cần thiết để thực sự vẽ thanh trượt tại đó.

## Các phương án thay thế từng cân nhắc

**Chỉ dùng CSS `:hover` trên cột, không dùng trạng thái JavaScript.** Toàn bộ cơ chế chỉ cần một quy tắc, nhưng nó không thể diễn đạt độ trễ (linger): thanh trượt sẽ biến mất ngay khung hình mà con trỏ vượt qua ranh giới, và đó chính là lúc con trỏ đang lao về vùng hội thoại hoặc đi vòng qua menu portal. Yêu cầu đã nêu rõ độ trễ, phiên bản chỉ dùng hover đọc lên giống như nhấp nháy.

**Giữ trong CSS, dùng transition để tạo độ trễ này**, tức đăng ký `--dsh-scrollbar-thumb` qua `@property` để custom property có thể animate, rồi dùng `transition-delay` để giữ màu. Bị từ chối vì cái giá và phạm vi ảnh hưởng: việc đăng ký này có tính toàn cục cho mọi bề mặt đọc bộ biến này, nhưng chỉ phục vụ thời gian của một cột; hơn nữa, pseudo-element thanh cuộn của WebKit — nơi bộ bảng màu này thực sự được render — không hỗ trợ transition một cách đáng tin cậy; độ trễ sẽ được khai báo ở nơi không thể quan sát được nó.

**Ẩn thanh cuộn trực tiếp** — `scrollbar-width: none`, hoặc `display: none` cho `::-webkit-scrollbar`. Bị từ chối, vì cách này sẽ đồng thời hủy luôn phần dự trữ: khi thanh cuộn xuất hiện lại nó sẽ chiếm lại 8px, khiến mọi dòng dịch chuyển ngang ngay dưới con trỏ đang kích hoạt việc hiển thị của nó — đây chính là hồi quy mà phần dự trữ khe rỗng ban đầu đã được thêm vào để sửa.

**Tự vẽ một thanh trượt overlay trong app**, và ẩn hoàn toàn thanh cuộn gốc, đây là cách cần thiết để có hiệu ứng fade-in/out hoàn toàn tùy chỉnh. Đổi lại được style tùy ý, nhưng cái giá là hit-testing, kéo thả, cuộn chuột, quán tính và trạng thái hover dưới hai bộ bảng màu — trong một client mà thanh cuộn đã được theme hóa thống nhất bằng token, cái giá phải trả cho vẻ ngoài là một bề mặt tự quản lý lớn.

**Thu hẹp phạm vi hiển thị về danh sách đang cuộn thay vì toàn bộ cột.** Ít phần tử liên quan hơn, nhưng lại đặt sai ranh giới hiển thị: con trỏ đến dòng cuối cùng, thanh cuộn sẽ chờ đến khi người dùng đã đang đọc các dòng đó mới xuất hiện; và mọi vùng cuộn khác thêm vào sidebar sau này đều phải đấu nối thủ công.

**Sự kiện cuộn cũng kích hoạt hiển thị**, để việc cuộn bằng bàn phím hoặc chạm cũng hiển thị thanh cuộn. Bị từ chối, vì đó là vẽ ra một khả năng cho phương thức nhập không cần đến nó; bản thân dòng đã cho thấy danh sách đã di chuyển.

## Hệ quả

- Cuộn danh sách bằng bàn phím hoặc kéo chạm sẽ không hiển thị thanh trượt sau khi hết độ trễ, vì cả hai cách này đều không giữ con trỏ trên cột. E2e sẽ cố định điều này, chứ không chỉ ghi lại nó bằng văn bản.
- Kéo chính thanh trượt ra khỏi cột sẽ không ẩn nó giữa chừng thao tác kéo: thanh cuộn tiếp quản pointer capture, trang không nhận được `pointermove` trong lúc giữ nút. Đã kiểm chứng thực tế trên Chromium — con trỏ kéo tới điểm cách bên phải cột 900px, vượt quá cửa sổ độ trễ, thanh cuộn vẫn được vẽ và tiếp tục cuộn.
- Khi khởi động lạnh, cột ở trạng thái im lặng cho tới lần đầu tiên con trỏ di chuyển vào nó. Con trỏ đang đứng yên tại vị trí đó khi trang tải xong sẽ không kích hoạt sự kiện nào cho tới khi nó di chuyển, đây là quy tắc của trình duyệt, không phải của shell này.
- Các bề mặt đã nâng cấp lồng bên trong cột, tự tái gán bộ biến này về l2 cho tầng nâng cấp riêng của chúng, sẽ ghi đè trạng thái im lặng và tiếp tục vẽ thanh cuộn riêng của chúng. Hiện tại không có bề mặt như vậy trong sidebar.
- DOM của shell giờ mang một class trạng thái, nên snapshot shell của ui-sidebar sẽ cố định `quietBars`, hồi quy về trạng thái mặc định sẽ thể hiện dưới dạng diff snapshot, chứ không phải thứ cần ai đó nhìn ra từ ảnh chụp màn hình.

## Kiểm thử

`packages/client/ui-sidebar/tests/pointer-scrollbars.client.spec.tsx` dùng fake timer để đi qua các chuyển tiếp của class này: hiển thị khi vào, vẫn hiển thị 1ms trước khi hết độ trễ, chuyển sang im lặng 1ms sau khi hết, và việc quay lại trong cửa sổ sẽ hủy việc ẩn. Ngoài ra có hai ca bao phủ phán định hình học khi ra: `pointermove` rơi ngoài hộp giới hạn của cột sẽ ẩn thanh cuộn mà không có bất kỳ sự kiện leave DOM nào (tức hình thái giống panel setting), còn rơi trở lại trong hộp thì hủy việc ẩn đang chờ kích hoạt. Nó còn unmount component giữa lúc độ trễ đang diễn ra và assert không có timer nào còn sống — việc ẩn đang chờ kích hoạt rơi vào component đã bị hủy chính là lỗi dễ mắc phải với cách viết này. Sự kiện dùng `pointerover`/`pointerout` kèm `relatedTarget`, vì React tổng hợp enter và leave từ hai sự kiện này, còn hai sự kiện gốc thì bị bỏ qua.

`packages/client/ui-sidebar/tests/scrollbar-quiet-styles.client.spec.ts` đọc trực tiếp stylesheet: quy tắc này phải viết ra cả hai nửa của bộ biến này — chỉ tái gán thanh trượt trạng thái tĩnh sẽ khiến màu hover lộ ra ngay khi con trỏ chạm vào thanh cuộn — và không được có `scrollbar-gutter`, thuộc tính đó thuộc về chính vùng cuộn.

`apps/web/tests/sidebar-scrollbar.e2e.ts` là nơi hai nửa này hội tụ trong engine thật. Nó dừng con trỏ trên danh sách trước mỗi lần đọc màu, vì một kịch bản không bao giờ di chuyển chuột sẽ đo được toàn bộ trạng thái im lặng, và pass mà không thực sự kiểm chứng hành vi mục tiêu. Sau đó, ca test riêng của nó di chuyển con trỏ ra, assert rằng thanh trượt vẫn đang được vẽ ngay tại thời điểm leave, poll cho tới khi nó phân giải thành `rgba(0, 0, 0, 0)`, đo lại hình học ở trạng thái đó để chứng minh phần dự trữ vẫn có hiệu lực trong lúc thanh cuộn bị ẩn, và cuộn danh sách theo lập trình — điều mà bàn phím hoặc kéo chạm sẽ làm — để cố định rằng cuộn không có con trỏ sẽ không vẽ bất kỳ thanh trượt nào. Golden đã commit ghi lại màu thanh trượt dưới hai bộ bảng màu, tại hai vị trí con trỏ.

Đối chứng của e2e này là một lần mutation, và nó cần chính sản phẩm build của plugin: bỏ `quietBars` khỏi shell, build lại `@deepseek-ai/dsh-client-ui-sidebar` trước, rồi mới chạy `build:web`, ca này sẽ đỏ vì thanh trượt phân giải thành `rgb(229, 229, 229)` trong khi kỳ vọng `rgba(0, 0, 0, 0)`. Nếu chỉ chạy lại `build:web` sẽ dùng sản phẩm build cũ, vẫn pass ngay cả khi thay đổi đã bị xóa, đây chính là cái bẫy mà [Agent Note về khe rỗng](../bug-fix/2026-07-28-themed-scrollbars-and-reserved-gutter.md) đã ghi lại.

Cơ chế gate đã mở rộng cũng có đối chứng riêng, mỗi cái là một thay đổi khai báo trên stylesheet thật: pha trộn `transparent` với hover của l2, và bọc token l2 vào `color-mix(…)`, đều sẽ khiến assertion theo cặp đó đỏ.

Bản ghi hình minh họa hành vi này bắt buộc phải dùng trình duyệt có giao diện (headed). Chromium headless vẫn dành phần dự trữ đó (`offsetWidth - clientWidth` là 8), nhưng không vẽ thanh trượt vào khung hình được capture — đã kiểm chứng thực tế bằng cách đếm số pixel màu thanh trượt trong dải đó trước và sau khi hiển thị: headless luôn đứng ở mức nhiễu, còn headed thì nhảy từ 46 lên 1466.
