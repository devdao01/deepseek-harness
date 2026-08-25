# Agent Note: Gỡ bỏ trình di trú nhánh fixture phiên đã đóng gói

Status: proposed

[English](2026-07-26-remove-packed-session-fixture-migrator.md) | Tiếng Việt

## Vấn đề

Trình ghi mặc định của repo và kiểm tra snapshot khiến các fixture phiên (dữ liệu tiền đề cho test) luôn giữ bố cục dòng đóng gói (packed) theo chuẩn. Lệnh `pnpm run migrate:packed-session-fixtures` vẫn được giữ lại bên ngoài cơ chế bắt buộc vĩnh viễn, với lý do duy nhất là để các nhánh đang dang dở mang theo thay đổi fixture kiểu cũ có thể merge vào `master` hiện tại và hội tụ thông qua chuyển đổi cơ học mà không cần ghi lại output của model.

Một khi mỗi nhánh như vậy đã được merge, đóng lại, hoặc đã tuân thủ chuẩn, thì lệnh ghi và hướng dẫn hội tụ nhánh đi kèm sẽ không còn ai duy trì. Nếu tiếp tục giữ lại lệnh có khả năng thay đổi nội dung repo sau khi giai đoạn chuyển tiếp đã kết thúc, sẽ tạo thêm một đường bảo trì thứ hai trông có vẻ hợp lệ bên cạnh kiểm tra snapshot chỉ-đọc vĩnh viễn.

## Đề xuất

Sau khi danh sách theo dõi trực tiếp xác nhận không còn PR (Pull Request) mở nào cần chuyển đổi định dạng phiên JSONL, hãy gỡ bỏ CLI tạm thời `scripts/migrate-packed-session-fixtures.ts`, cùng lệnh `migrate:packed-session-fixtures` do package gốc cung cấp. Trong cùng thay đổi này, gỡ bỏ các liên kết trỏ đến lệnh chuyển tiếp đó trong chính sách test, README của ACP snapshot, và Agent Note đã triển khai về dòng đóng gói; đồng thời thay hướng dẫn khắc phục trong `scripts/session-fixture-layout.snapshot.ts` — vốn chỉ áp dụng cho lệnh này — bằng hướng dẫn bố cục chuẩn không gắn với lệnh cụ thể.

Giữ lại `scripts/session-fixture-layout.ts`, unit test của nó, và `scripts/session-fixture-layout.snapshot.ts`. Chúng định nghĩa và bắt buộc thực thi bố cục chuẩn vĩnh viễn; chỉ trình ghi hướng-tới-nhánh mới là cơ chế tạm thời.

Trước khi gỡ bỏ lệnh, mỗi nhánh bị ảnh hưởng cần merge `master` hiện tại, chạy trình di trú một lần, tách riêng thay đổi kết quả (chỉ gồm việc viết lại fixture) thành một commit riêng, và xác minh kiểm tra bố cục snapshot ở cấp repo đã pass. Các nhánh đã đóng hoặc đã bị thay thế thì không cần di trú.

## Phương án thay thế đã cân nhắc

**Giữ lại lệnh này vô thời hạn.** Việc này giúp chuyển đổi fixture kiểu cũ thuận tiện hơn, nhưng cũng để lại một công cụ ghi ở cấp repo sau khi cửa sổ di trú duy nhất đã biết đã đóng lại. Cổng chỉ-đọc đã cung cấp sẵn hành vi và chẩn đoán có thể giữ lâu dài.

**Gỡ bỏ luôn module chuyển đổi bố cục chuẩn cùng với CLI.** Module này không phải là tàn dư của giai đoạn chuyển tiếp: snapshot CI dùng nó để phát hiện fixture trong tương lai, giải mã các bản ghi vật lý hỗn hợp, và so sánh với biểu diễn đóng gói chuẩn. Gỡ bỏ module này cũng sẽ gỡ luôn cơ chế bắt buộc thực thi.

**Xóa lệnh ngay khi dòng đóng gói vào `master`.** Các nhánh mở cũ hơn, sau khi đổi nhánh đích, sẽ chỉ còn cách dùng script tạm thời hoặc tái tạo snapshot thủ công, làm tăng nguy cơ xung đột và khiến việc rà soát độ trung thực của sự kiện giải mã khó hơn.

## Tiêu chí nghiệm thu

- Danh sách PR mở trực tiếp không phát hiện nhánh nào còn phụ thuộc vào lệnh di trú tạm thời để xử lý thay đổi định dạng phiên JSONL.
- CLI tạm thời, lệnh của package gốc, mọi liên kết hội tụ nhánh, và chẩn đoán cổng chỉ áp dụng riêng cho lệnh này đều không còn tồn tại; trình chuyển đổi bố cục chuẩn vĩnh viễn, unit test và kiểm tra snapshot vẫn được giữ lại.
- `pnpm run test:snapshot`, `pnpm run doc-sync`, lint và kiểm tra khoảng trắng đều pass khi không còn lệnh tạm thời.
- Tài liệu hiện hành chỉ mô tả giá trị mặc định đóng gói và cơ chế bắt buộc bố cục chuẩn vĩnh viễn.

## Rủi ro

Nếu danh sách nhánh mở không đầy đủ, sau khi lệnh biến mất, người đóng góp có thể rơi vào tình trạng xung đột fixture chưa đóng gói trên diện rộng. Vì vậy, việc gỡ bỏ phụ thuộc vào bằng chứng PR trực tiếp, chứ không phải thời gian đã trôi qua. Giữ lệnh quá lâu có chi phí vận hành thấp, nhưng sẽ làm mờ ranh giới đâu mới là cơ chế vĩnh viễn.
