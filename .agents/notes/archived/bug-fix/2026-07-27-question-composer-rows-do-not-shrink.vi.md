# Agent Note: Hàng lựa chọn trong question composer là nội dung cuộn, không phải nơi hấp thụ khi thiếu không gian

Status: implemented
Archived: 2026-08-07

[English](2026-07-27-question-composer-rows-do-not-shrink.md) | 中文

## Vấn đề

Thẻ (card) question composer có giới hạn chiều cao theo viewport (`max-height: min(60vh, 520px)`), và để danh sách lựa chọn tự cuộn, nhờ đó header và các nút hành động ở cuối luôn có thể truy cập được khi hỏi theo lô (batch). Nhưng khi vùng khả dụng của composer trở nên thấp hơn (cửa sổ nhỏ, hoặc viewport thấp mà panel chi tiết đang mở rộng), các hàng lựa chọn sẽ chồng lấn lên nhau, và chồng lên cả tiêu đề câu hỏi.

Lỗi không nằm ở giới hạn chiều cao này, mà nằm ở việc ai hấp thụ khi không đủ chiều cao. `.options` là một hộp `flex-direction: column`, các phần tử con của nó mặc định nhận `flex-shrink: 1`, vì vậy khi thiếu không gian, các hàng lựa chọn bị co lại trước tiên, thay vì để container cuộn tràn (overflow). Một hàng bị nén xuống `min-height: 42px` của nó, trong khi `.optionCopy` vẫn giữ chiều cao vốn có lớn hơn cần thiết sau khi văn bản xuống dòng (option có mô tả sẽ chiếm hai dòng). Do `align-items: center`, văn bản sau đó được căn giữa dựa trên một hộp thấp hơn chính nó, và vẽ tràn ra ngoài hộp viền (border box) của hàng theo cả hai hướng lên và xuống — chồng lên tiêu đề phía trên, chồng lên hàng kế tiếp phía dưới. Đã đo thực tế trên client đã phát hành ở kích thước 900x440: văn bản tràn ra ngoài hộp hàng 6.5px, tăng lên 10px khi chiều cao viewport giảm xuống 380px, trong khi `scrollHeight` mà `.options` báo cáo bằng đúng `clientHeight`, do đó không bao giờ xuất hiện thanh cuộn.

Chỉ những hàng lựa chọn có văn bản cần xuống dòng mới tái hiện được lỗi này. Những hàng mà văn bản chỉ cần một dòng là đủ chứa thì vẫn còn khoảng dư giữa nội dung và chiều cao tối thiểu 42px, nên bị nén cũng không thấy rõ — đây chính là lý do fixture (dữ liệu thử nghiệm) e2e hiện có (các lựa chọn `Blue`/`Green`, không có mô tả) render bình thường ở mọi kích thước.

## Quyết định

`.option` và `.custom` khai báo `flex-shrink: 0`.

Trong một thẻ có giới hạn chiều cao, các hàng này là nội dung cuộn; phần tràn của thẻ do `.options` gánh chịu, vì nó vốn đã có `overflow-y: auto` và `min-height: 0`. Sau khi cố định các phần tử con, tình trạng thiếu chiều cao sẽ được truyền xuống container cuộn đó, thay vì bị các hàng tự hấp thụ, và đây chính là hành vi mà giới hạn chiều cao này được thiết kế để đạt được. Cách khác là cho phép hàng bị nén nhưng ràng buộc văn bản trong phạm vi hàng, khi đó buộc phải cắt (clip) hoặc thêm dấu chấm lửng (ellipsis) đúng vào những kích thước mà người dùng cần đọc mô tả lựa chọn nhất.

`.header` và `.footer` vì lý do tương tự đã có `flex-shrink: 0` ở cấp thẻ; các phần tử con của danh sách lựa chọn chính là nửa còn thiếu của quy tắc này.

## Các phương án thay thế đã cân nhắc

**Cắt hoặc thêm dấu chấm lửng cho văn bản trong hàng bị nén (đặt `overflow: hidden` cho `.option`).** Chỉ cần một khai báo là loại bỏ được hiện tượng chồng lấn, không cần xem xét lại layout. Sở dĩ bác bỏ: cách này biến một lỗi có thể nhìn thấy thành một lỗi âm thầm — hàng vẫn giữ 42px, còn dòng thứ hai của mô tả lựa chọn sẽ biến mất hoàn toàn đúng vào những kích thước mà thẻ đang chật vật nhất. Mô tả là nội dung ảnh hưởng đến quyết định, không phải trang trí.

**Đổi `align-items: center` thành `align-items: flex-start`.** Văn bản khi đó chỉ phát triển xuống dưới, nên không còn chồng lên tiêu đề phía trên nữa. Nhưng cách này không sửa được gì cả: hàng bị nén vẫn tràn xuống chồng lên hàng kế tiếp, hơn nữa thay đổi này sẽ âm thầm thay đổi căn chỉnh dọc của mọi hàng lựa chọn ở mọi kích thước (kể cả kích thước thông thường).

**Bỏ giới hạn `max-height` của thẻ, để nó không bao giờ bị nén.** Không thiếu chiều cao thì không có vấn đề phân bổ. Sở dĩ bác bỏ: chính giới hạn này đảm bảo header và các nút hành động ở cuối luôn nằm trong màn hình khi hỏi theo lô; bỏ nó sẽ tái tạo lại đúng lỗi mà giới hạn này vốn được tạo ra để ngăn chặn (container chứa composer là một cột phiên có chiều cao cố định, `overflow: hidden`, nên một thẻ không có giới hạn sẽ mất luôn cả nút submit của chính nó).

**Giới hạn văn bản xuống dòng chỉ còn một dòng (đặt `white-space: nowrap` cộng dấu chấm lửng cho `.description`).** Hàng sẽ không bao giờ xuống dòng, nên khi bị nén cũng không bao giờ tràn. Lý do bác bỏ giống như việc cắt văn bản, ngoài ra cách này còn hy sinh khả năng render ở viewport rộng, đủ không gian, chỉ để sửa một lỗi ở viewport hẹp.

## Hệ quả

- Composer bị nén sẽ cuộn danh sách lựa chọn của nó, thay vì để các hàng lựa chọn chồng lấn lên nhau: ở kích thước 900x380, danh sách này báo cáo `scrollHeight` là 200, `clientHeight` là 114, và hiển thị thanh cuộn; trước đây cả hai bằng nhau, không có thanh cuộn.
- Hàng lựa chọn giữ nguyên đầy đủ văn bản xuống dòng ở mọi kích thước viewport. Không cắt, không thêm dấu chấm lửng, việc render ở viewport rộng giữ nguyên không đổi (quy tắc này chỉ có hiệu lực khi hộp flex thiếu không gian).
- Vì tình trạng thiếu chiều cao không còn được các hàng hấp thụ một phần nữa, thẻ giờ chuyển sang trạng thái cuộn sớm hơn. Đây chính là hành vi mà giới hạn chiều cao này mong muốn, và cũng có nghĩa là những vùng khả dụng thấp hơn, trước đây chỉ âm thầm vẽ sai danh sách, giờ sẽ hiển thị thanh cuộn.
- Kịch bản được ghi lại (record) cho vấn đề này dài hơn so với lượt tương tác chính mà nó chủ yếu kiểm thử. Cái giá này được chấp nhận có chủ đích: không có văn bản xuống dòng thì bất biến (invariant) layout này không thể bị chứng minh sai, và thêm một fixture riêng chỉ để test một quy tắc CSS sẽ còn tệ hơn.

## Verification

Kịch bản e2e của Web composer khẳng định (assert) bất biến này trên composer đang chạy thật, ở ba chiều cao vùng khả dụng bị ép chặt (900x520/440/380): mọi phần tử con của mỗi hàng lựa chọn đều nằm trong hộp viền của hàng đó. Hai lớp bảo vệ ngăn khẳng định này thỏa mãn một cách rỗng — phải có ít nhất một hàng đang ở trạng thái xuống dòng (đây là hình thái duy nhất có thể tràn), và `.options` phải thực sự đang ở trạng thái cuộn (chứng minh vùng khả dụng thực sự bị giới hạn chiều cao chi phối). Kịch bản này giờ có mô tả lựa chọn dài hơn được ghi lại chính vì lý do đó; không có văn bản xuống dòng, khẳng định này không thể thất bại.

Đã xác nhận hai chiều trên client sản phẩm build thật: sau khi undo `flex-shrink: 0`, kịch bản này thất bại (`scrolls: false`, tràn 6.5px), khôi phục lại thì pass. Một lượt rà soát hình học độc lập bao phủ 340 kích thước viewport (420-1600 x 320-960), giảm từ 86 kích thước có văn bản tràn ra ngoài hộp hàng xuống còn 0.

Khẳng định này chỉ thực thi ở chế độ phát lại (replay): chế độ ghi (record) phải đi đến bước ghi fixture, chứ không dừng ở bước kiểm tra layout. Cũng cần lưu ý, composer được phát hành dưới dạng bundle module client, vì vậy chỉ chạy riêng `pnpm run build:web` sẽ không mang theo thay đổi đối với `QuestionComposer.module.css` — phải chạy build package thì kênh test trình duyệt mới thấy được thay đổi này.

Để tái hiện tình trạng thiếu không gian này, cần một viewport thấp, chứ không phải một container thấp. Giới hạn chiều cao là `min(60vh, 520px)`, vì vậy nén cột phiên xuống thấp hơn chính chiều cao của thẻ chỉ khiến thẻ bị cắt (clip), chứ không khiến nó thiếu không gian — các hàng vẫn giữ nguyên chiều cao đầy đủ, không có tràn nào cả. Bất kỳ cách nào khác ngoài kịch bản e2e dùng để minh họa hay đo lường lỗi này đều phải thay đổi viewport.

`lib/` cũ sẽ khiến kênh test trình duyệt khẳng định dựa trên một client cũ hơn cây làm việc (working tree), và `pnpm run build` chạy nửa chừng rồi thất bại chính là để lại trạng thái này: các package build xong trước khi thất bại thì mới, còn lại thì không. Ở trạng thái này, nếu làm mới expected output thì sẽ ghi lại giao diện của client cũ. Trước khi chụp (capture) hãy xác nhận build thoát với exit code 0; cũng cần lưu ý các thư mục chưa được theo dõi (untracked) dưới `packages/` cũng sẽ bị biên dịch — di sản còn sót lại từ một nhánh khác có thể khiến build thất bại vì lý do mà diff không giải thích được.
