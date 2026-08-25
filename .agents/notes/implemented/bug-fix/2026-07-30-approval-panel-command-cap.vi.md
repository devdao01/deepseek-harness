# Agent Note: Panel tiếp quản phê duyệt dùng chung một giới hạn chiều cao văn bản với ô nhập liệu

Status: implemented

[English](2026-07-30-approval-panel-command-cap.md) | Tiếng Việt

## Vấn đề

Panel phê duyệt là một lần tiếp quản composer: khi có một yêu cầu vượt quyền sandbox đang chờ, nó thay thế InputBar trong container composer, hiển thị lý do do model đưa ra, lệnh đi kèm, và một hàng nút từ chối／cho phép. Cả hai đoạn văn bản này đều là đầu ra không giới hạn độ dài của model, mà thẻ khi đó lại không có bất kỳ giới hạn chiều cao nào. Lệnh mà dài — và đây chính là hình thái thường gặp trong thực tế, vì yêu cầu vượt quyền nhắm đúng vào lệnh mà sandbox vừa từ chối, còn lệnh bị từ chối thường là một thao tác ghi inline rất dài — thì thẻ cứ thế cao lên, cho tới khi hàng nút thao tác rời khỏi khung nhìn. Người dùng đọc được yêu cầu, nhưng không thể phản hồi: các nút vẫn tồn tại, chỉ là nằm ngoài màn hình, trong một container bám đáy vốn đã chiếm trọn cả cột.

InputBar bị nó thay thế thì luôn có giới hạn (14 dòng, sau đó textarea tự cuộn), nên lần tiếp quản này cũng là trạng thái duy nhất của composer có thể cao lên vô hạn — chiều cao container tăng vọt khi được chọn, rồi lại tụt xuống sau khi phản hồi.

## Quyết định

Phần lý do và lệnh của panel được chuyển vào cùng một vùng cuộn (`data-approval-scroll`), có giới hạn chiều cao hoàn toàn giống vùng nháp của composer; thanh trạng thái màu hổ phách và hàng nút thao tác nằm ngoài vùng đó, nên dù nội dung dài đến đâu thì hai nút vẫn ở trong thẻ.

Giới hạn này là một giá trị, hai bên tiêu thụ, được khai báo bằng `--dsh-composer-text-max-height: 336px` trên `.composerSeat` của `ConversationRoot` — đây là tổ tiên chung duy nhất của chain composer, bởi InputBar dự phòng và panel tiếp quản được chọn là hai nút anh em. Cả vùng cuộn bản nháp của `InputBar` lẫn vùng cuộn của panel đều đọc giá trị này, nên cùng một container không thể đặt hai giới hạn khác nhau cho hai trạng thái của nó: yêu cầu «có thể thống nhất với chiều cao tối đa của ô nhập liệu» mà bên thiết kế đưa ra, nay là một dữ kiện trong stylesheet, chứ không phải một con số chép ra hai tệp. Vùng này dùng `box-sizing: border-box`, nên giới hạn nói đến chiều cao khung ngoài của nó, cùng một hộp với vùng nháp của composer.

Bản thân vùng này là một điểm dừng Tab (`tabIndex={0}`, kèm `role="group"` có tên). Thân cuộn của composer đặt câu hỏi thì không cần như vậy — hàng lựa chọn của nó vốn đã focus được và sẽ kéo theo cả container; còn ở đây ngoài văn bản thì không có gì khác: không có điểm dừng của riêng mình, người dùng chỉ dùng bàn phím sẽ tới được các nút nhưng không tới được cuối lệnh, và do đó có thể phê duyệt thứ mà mình chưa đọc hết.

Thẻ panel gán lại `--dsh-scrollbar-thumb{,-hover}` sang cặp l2, việc mà mọi vùng cuộn nằm trên bề mặt tầng cao đều phải làm ([quy ước thanh cuộn](../../../../packages/client/ui-theme/src/styles/scrollbar.css)).

## Các phương án từng cân nhắc

**Đặt giới hạn cho cả thẻ, thay vì cho vùng văn bản.** Chỉ một khai báo, không cần tái cấu trúc, và đọc lên đúng nghĩa đen là «cùng chiều cao tối đa với ô nhập liệu». Bị bác bỏ vì: thẻ còn chứa thanh trạng thái và hàng nút thao tác — với tổng chiều cao 336px, lý do và lệnh chỉ được chia khoảng 250px, thấp hơn cả vùng nháp mà nó thay thế, và việc con số hai bên khớp nhau chỉ là trùng hợp do chiều cao thanh trạng thái. Chỉ khi đặt giới hạn cho vùng văn bản thì hai trạng thái mới dừng lại ở cùng một chiều cao văn bản, mà đây đúng là tính chất khiến phần đáy không còn nhảy.

**Đặt giới hạn theo khung nhìn như composer đặt câu hỏi (`min(60vh, 520px)`).** Component anh em cũng là panel tiếp quản đã làm như vậy, nên đây là tiền lệ sẵn có tại chỗ. Bị bác bỏ vì: yêu cầu của bên thiết kế là căn theo InputBar, mà hai panel tiếp quản lại không cùng hình thái — nội dung cuộn của composer đặt câu hỏi là một nhóm lựa chọn mà người dùng cần so sánh với nhau, chiếm được bao nhiêu khung nhìn thì nên chiếm bấy nhiêu; còn nội dung cuộn của panel phê duyệt là một câu lệnh, người dùng chỉ cần lướt qua trước khi quyết định. Đặt giới hạn theo khung nhìn còn khiến chiều cao container lại nhảy khi được chọn, chỉ là theo hướng ngược lại.

**Cắt bớt lệnh hoặc thêm dấu ba chấm.** Không cần vùng cuộn, không cần giới hạn, các nút cũng không bị dịch chuyển. Bị bác bỏ vì: lệnh chính là đối tượng được phê duyệt, giấu đi phần đuôi của nó tức là bắt người dùng bảo chứng cho đoạn văn bản mà họ không đọc được. Cắt bớt ở đây còn là không thể khôi phục — panel chính là toàn bộ giao diện phê duyệt, không có chỗ nào để đặt «xem thêm».

**Giữ hàng nút thao tác bên trong vùng cuộn, chỉ đặt giới hạn cho vùng đó.** Ít phải sửa hơn so với việc cố định hàng nút. Bị bác bỏ vì: cách này chỉ dời khiếm khuyết vào bên trong thẻ — nút cuộn ra khỏi vùng đó, người dùng phải phát hiện có thanh cuộn thì mới chạm tới được chúng.

## Hệ quả

- Lệnh dài sẽ cuộn bên trong thẻ, nút từ chối／cho phép ở lại trong màn hình. Đã đo thực tế trên client dựng từ sản phẩm build ở 900x1000 và 900x700: `scrollHeight` mà vùng này báo cáo vượt `clientHeight`, cả hai nút đều ở trong thẻ và cũng đều ở trong khung nhìn.
- Việc chọn panel tiếp quản không còn làm thay đổi chiều cao mà container composer có thể đạt tới, nên khi phê duyệt xuất hiện hay được giải quyết, transcript (bản ghi văn bản) phía trên sẽ không bị bố trí lại hàng trăm pixel.
- Giới hạn 14 dòng của InputBar nay được phân giải qua một custom property kế thừa từ `.composerSeat`, và rơi đúng vào hộp thực sự cuộn bản nháp ([hai lớp văn bản dùng chung một vùng cuộn](2026-07-31-composer-text-layers-share-one-scrollport.md) đã dời khai báo này ra khỏi lớp gương tự tăng chiều cao). Render thanh nhập liệu ra ngoài container đó sẽ mất khai báo này (một `var()` không phân giải được và không có giá trị dự phòng), nên host composer trong tương lai bắt buộc phải mang theo thuộc tính này — và đó cũng chính là lý do nó được khai báo trên container dùng chung chứ không phải trên node gốc của ứng dụng.
- Lệnh được ghi lại trong kịch bản này là một khối ký tự 200 token, vượt xa mức cần cho một lần đi-về. Cái giá này được trả có chủ đích: không có nội dung vượt quá giới hạn thì giới hạn này không thể bị bác bỏ, mà model thì sẽ nén mọi payload có quy luật (lần ghi đầu tiên, model viết «lặp alpha 400 lần» thành `printf 'alpha %.0s' {1..400}`, một lệnh một dòng chẳng chứng minh được điều gì).

## Kiểm chứng

`apps/web/tests/approval-composer.e2e.ts` điều khiển một tổ hợp thật: một phiên chỉ đọc, một thao tác ghi bị từ chối, lần thử lại có vượt quyền của model, và phản hồi hoàn tất bằng cú nhấp trên panel. Các khẳng định hình học được thực thi trên panel đang hoạt động ở hai chiều cao khung nhìn, kèm bảo vệ chống việc chúng đúng một cách rỗng tuếch — vùng này phải thực sự đang ở trạng thái cuộn, và giới hạn đo được phải bằng giới hạn của chính composer, giá trị mà bài test đọc ra từ vùng cuộn bản nháp đang hoạt động trước khi gửi, chứ không ghi cứng con số pixel đó.

Đã xác nhận theo cả hai chiều trên client dựng từ sản phẩm build. Sau khi gỡ bỏ giới hạn, vùng này báo cáo `scrolls: false` và cao lên bằng toàn bộ chiều cao của lệnh (ở 900x1000, khối ký tự được ghi là 1798px, còn khi có giới hạn là 336px); ở 900x700, thẻ cao 680px trong khi khung nhìn cao 700px, cạnh dưới của hàng nút thao tác rơi vào y=749 — nằm dưới khung nhìn, khớp hoàn toàn với phản hồi của bên thiết kế. Sau khi khôi phục giới hạn, kịch bản này vượt qua ở chế độ phát lại.

Để tái hiện việc nút chạy ra ngoài màn hình, cần một thẻ cao hơn khung cuộn, chứ không chỉ là một thẻ rất cao. Container composer có `position: sticky; bottom: 0`, nên chừng nào khung cuộn còn chứa được thẻ thì nó vẫn bám đáy khung nhìn và các nút vẫn nhìn thấy được — ở 900x1000, thẻ không giới hạn ngốn hết cả transcript nhưng vẫn giữ hàng nút thao tác trong màn hình. Chỉ khi thẻ dài hơn khung cuộn thì sticky mới không còn giữ nổi cạnh đáy, và hàng nút chìm xuống dưới khung nhìn.

Khối khẳng định hình học và golden chỉ được thực thi ở chế độ phát lại, để chế độ ghi có thể đi tới bước ghi fixture (dữ liệu chuẩn bị cho test) chứ không dừng lại ở bước kiểm tra bố cục.

Kịch bản này chỉ giữ một golden — panel đang chờ; trạng thái sau khi phản hồi thì chuyển sang khẳng định về thế giới (kết quả quyết định, tệp mà lệnh vượt quyền ghi ra, `DONE`, panel biến mất, ô nhập liệu dùng lại được). Một golden cho «transcript đã phản hồi» thì không đứng vững: lần thử đầu tiên bị từ chối sẽ render chính văn bản từ chối của hệ điều hành, mà văn bản này khác nhau theo nền tảng (macOS là `bash: notes.txt: Operation not permitted`, Linux là `bash: line 1: notes.txt: Read-only file system`). Mọi kịch bản có transcript chứa lệnh bị sandbox từ chối đều thừa hưởng điều này, nên loại từ chối như vậy chỉ được đưa vào khẳng định, tuyệt đối không đưa vào golden.

Panel này được phát hành dưới dạng gói module phía client: chỉ chạy riêng `pnpm run build:web` sẽ không mang theo thay đổi ở `ApprovalPanel.module.css`, cũng không mang theo các hook `data-` mới thêm trong `ApprovalPanel.tsx` — bắt buộc phải chạy build gói trước, nếu không kênh test trình duyệt sẽ khẳng định trên một client cũ hơn cây làm việc.
