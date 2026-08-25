# Agent Note: Khôi phục sau khi textarea Safari co lại do soft wrap

Status: implemented

[English](2026-08-13-safari-textarea-soft-wrap-reflow.md) | Tiếng Việt

## Vấn đề

composer giữ con trỏ và vùng chọn trong một textarea gốc (native) trong suốt, còn glyph nhìn thấy được thì do backdrop vẽ, và chiều cao đầy đủ của bản nháp do một lớp mirror ẩn quyết định. Do đó, [quyết định một scroll container duy nhất](2026-07-31-composer-text-layers-share-one-scrollport.md) dựa vào việc textarea không mang phần tràn có thể cuộn (scrollable overflow): sau mỗi lần commit bản nháp, `scrollHeight` và `clientHeight` của nó bằng nhau, `scrollTop` bằng 0.

Khi Backspace khiến bản nháp vượt qua ngưỡng soft wrap, đúng lúc React cập nhật lớp mirror, Safari 26.5.2 có thể giữ lại bố cục dòng gốc cũ của textarea. Trong lần chuyển từ hai dòng còn một dòng đã tái hiện được, lớp mirror, backdrop, ngăn xếp tự tăng chiều cao và hộp textarea đều chuyển thành cao 28px, nhưng textarea vẫn báo `scrollHeight=52` và `scrollTop=20`. Con trỏ bị kẹt lại ở dòng gốc cũ, trong khi backdrop đã vẽ đúng thành một dòng.

Khai báo `color` không phải là input của bố cục (layout). Sửa inline style sẽ đổi màu đã tính toán, nhưng vẫn giữ nguyên trạng thái cũ `52/28/20`. Việc sửa rule trong stylesheet lại tình cờ kích hoạt việc invalidate ở phạm vi rộng hơn, và xóa trạng thái về `28/28/0` — đây chính là lý do Web Inspector khiến khai báo đó trông như nguyên nhân gốc.

## Quyết định

`InputBar` nhận diện Safari một lần duy nhất qua vendor Apple và user agent dạng `Version/... Safari/...`, đồng thời loại trừ các token trình duyệt iOS khác đã biết như `CriOS`, `FxiOS`, `EdgiOS`, `OPiOS`. Với những browser shell không thể phân biệt được chỉ bằng các trường identity này, logic khôi phục vẫn chỉ sửa bố cục sau khi textarea đã vi phạm bất biến overflow.

Change handler của textarea gốc ghi lại việc lượt sửa này có làm bản nháp được kiểm soát (controlled draft) ngắn lại hay không. Sau khi bản nháp được commit, layout effect sẽ trả về ngay trước khi đọc hình học, trừ khi đồng thời có cả identity Safari đã cache lẫn tín hiệu co ngắn gốc. Sau đó nó mới kiểm tra bất biến scroll container duy nhất: `scrollHeight` bằng `clientHeight` nghĩa là trạng thái ổn định, không kích hoạt forced layout. Khi có sai lệch, logic sẽ đổi chiều cao thực của textarea đi một pixel, ép layout, rồi khôi phục lại chiều cao của riêng nó và ép layout thêm lần nữa. Cách này khôi phục được bố cục của control văn bản gốc trên Safari mà không cần đổi value, vùng chọn, trạng thái ghép chữ IME (input method composition), hay giao dịch undo.

Ngay cả khi textarea đã được khôi phục đúng, phần overflow gốc tạm thời vẫn có thể khiến chiều cao auto của scroll container bản nháp bị kẹt ở số dòng cũ. Vì vậy, sau khi sửa textarea, logic khôi phục lặp lại thêm một lượt invalidate một pixel cho `[data-input-scroll]`. Cả hai phần tử đều khôi phục lại style riêng của mình trước khi vẽ; trạng thái một dòng ổn định là `scrollHeight=clientHeight=28`, `scrollTop=0`, và chiều cao scroll container là 28px.

## Kiểm chứng

Test component tổng hợp các số đo cũ kiểu Safari, khẳng định thứ tự invalidate là textarea trước rồi tới scroll container, giữ nguyên vùng chọn, và chứng minh việc bản nháp gốc tăng lên không đọc hình học. Test identity trình duyệt bao phủ Safari desktop và mobile, Chromium desktop, Chrome/Edge/Opera trên iOS, và Apple web view.

Package đã lắp ráp còn được kiểm chứng qua đường Backspace gốc thật từ 51 ký tự xuống 50 ký tự trên Safari 26.5.2. Playwright WebKit 26.5, trên cả ứng dụng đã lắp ráp lẫn trang tối giản, đều ổn định đúng mà không cần cách vòng này, nên luồng trình duyệt Chromium của repo không thể tái hiện khiếm khuyết ứng dụng này trên Safari; cho tới khi có một luồng Safari có thể tự động hóa, trạng thái engine này được chốt lại bằng test component tập trung.

## Các phương án đã cân nhắc

**Sửa `color` hoặc dùng `-webkit-text-fill-color`.** Bị bác bỏ, vì cả việc sửa color inline lẫn text fill trong suốt đều không thay đổi hình học gốc đã cũ. Việc sửa rule trong stylesheet có tác dụng chỉ vì phạm vi invalidate của nó rộng hơn ngữ nghĩa vẽ của khai báo đó.

**Đặt `scrollTop=0`.** Bị bác bỏ, vì cách này chỉ dịch chuyển nội dung gốc đã cũ, không dựng lại `scrollHeight` hai dòng của nó; con trỏ có thể chuyển từ lệch vị trí sang bị cắt mất.

**Ghi lại value của textarea.** Xóa trắng rồi khôi phục value có thể dựng lại control văn bản của Safari, nhưng sẽ thay đổi trạng thái chỉnh sửa đang giữ IME composition và vùng chọn. Việc invalidate chiều cao không đụng tới value.

**Dùng `field-sizing: content`.** Bị bác bỏ, vì sau cùng một lượt xóa, chiều cao vốn có hai dòng của Safari vẫn sẽ bị cũ, và composer vẫn cần lớp mirror làm thước đo con trỏ cùng đối trọng số đo cho backdrop.

**Chỉ invalidate textarea hoặc scroll container.** Bị bác bỏ, vì chỉ khôi phục textarea tuy xóa được `52/28/20`, nhưng có thể để lại scroll container ở mức 52px; còn chỉ khôi phục scroll container thì không thay đổi được phần overflow gốc của textarea. Cặp thao tác có thứ tự này là bước khôi phục đầy đủ tối thiểu.

**Kiểm tra hình học sau mỗi lần commit bản nháp trên Safari.** Bị bác bỏ, vì đọc `scrollHeight` hoặc `clientHeight` sau khi React đổi lớp mirror có thể thực thi layout đồng bộ ngay cả khi bản nháp tăng lên bình thường, không có vấn đề gì. Tín hiệu co ngắn gốc giới hạn việc đọc bất biến chỉ trong những lượt sửa có khả năng gây ra khiếm khuyết co lại đã quan sát được.

**Chạy logic khôi phục trên mọi trình duyệt.** Bị bác bỏ, vì Chromium, Playwright WebKit và Firefox đều giữ được bất biến đó mà không cần forced layout. Identity Safari cùng với sai lệch đã quan sát được cùng nhau giới hạn phạm vi công việc đồng bộ này.

## Ảnh hưởng

Trình duyệt không phải Safari, việc cập nhật bản nháp theo chương trình, và các lượt sửa gốc không làm ngắn bản nháp đều không đọc hình học. Việc co ngắn gốc trên Safari sẽ đọc bất biến overflow, và chỉ phải chịu bốn lần forced layout khi textarea vi phạm bất biến đó. Đường xử lý ngoại lệ đánh đổi một chút công việc cục bộ hiếm gặp trước khi vẽ, để lấy lại sự căn chỉnh con trỏ, ngữ nghĩa chỉnh sửa gốc, và một hộp cuộn duy nhất. Chưa quan sát được trạng thái cũ tương tự chỉ do resize hoặc đổi chiều rộng sidebar gây ra, và trigger khôi phục này cũng không bao phủ trường hợp đó. Khoảng trống về test trình duyệt được giữ tường minh: bằng chứng Safari thật chịu trách nhiệm cho khiếm khuyết của engine, còn phần bao phủ component xác định (deterministic) chịu trách nhiệm cho logic khôi phục và việc gating theo trình duyệt.
