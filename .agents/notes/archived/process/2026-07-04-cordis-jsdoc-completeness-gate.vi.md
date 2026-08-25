# Agent Note: Gate kiểm tra tính đầy đủ JSDoc cho giao diện service hướng ra bên ngoài của Cordis

Status: implemented

Archived: 2026-07-27

[English](2026-07-04-cordis-jsdoc-completeness-gate.md) | 中文

## Vấn đề

Mục lục Cordis được sinh tự động trước đây đã ép buộc mô hình phân phối sự kiện, nhưng chưa ép buộc yêu cầu hợp đồng service và sự kiện đầy đủ. Phương thức có thể thiếu mô tả, tham số hoặc giá trị trả về có thể không có tài liệu trên các API interface xuyên plugin — mà đây chính là nơi việc dẫn dắt bằng IDE quan trọng nhất.

Quy tắc trong AGENTS.md ("mỗi export đều có JSDoc giải thích ngữ nghĩa") chỉ có thể kiểm tra bằng review dưới dạng văn bản. Sở thích đã định sẵn của repo này là mã hóa các bất biến (invariant) thành gate máy móc. Phạm vi "hàm service và sự kiện Cordis" có một định nghĩa máy chính xác, chỉ có generator mục lục mới biết: sự kiện là thành viên của `interface Events` bên trong `declare module 'cordis'`, giao diện service là các phương thức public của lớp mà mỗi key `interface Context` trỏ tới. Quy tắc ESLint không nhìn thấy ánh xạ này; generator tính toán nó ở mỗi lần chạy.

## Quyết định

Mở rộng `scripts/gen-cordis-catalog.ts` — tái sử dụng cùng một lượt duyệt và cùng bộ tiền lệ `@mode` — để ép buộc yêu cầu tính đầy đủ JSDoc cho mọi thứ nó lập mục lục. `verify-cordis-catalog` chạy bên trong `doc-sync`, do đó thay đổi tài liệu liên quan và CI sẽ thực thi cùng một gate mà không cần kết nối thêm.

Hợp đồng như sau:

- **Sự kiện** cần văn bản mô tả, và một `@param` không rỗng cho mỗi **tham số payload**. Tham số payload là tham số trong chữ ký hàm mang dữ liệu sự kiện; chú thích receiver `this` và `next` là tham số waterfall cuối cùng được miễn kiểm tra — `next` là cơ chế phân phối, ngữ nghĩa của nó đã thuộc về nhãn `@mode waterfall` (và việc kiểm tra chéo cấu trúc của nó); viết tài liệu lặp lại cho mỗi sự kiện chỉ là boilerplate. Viết tài liệu cho tham số được miễn kiểm tra là được phép; chỉ khi thiếu mới bị kiểm tra.
- **Lớp service** cần JSDoc ở cấp lớp, mỗi phương thức public cần văn bản mô tả, một `@param` không rỗng cho mỗi tham số, và một `@returns` không rỗng — trừ khi kiểu trả về được chú thích là `void`/`Promise<void>` (lúc đó `@returns` là tùy chọn — thời điểm resolve đôi khi đáng để ghi lại — nhưng không bao giờ bắt buộc).
- **Báo lỗi thẻ lỗi thời**: `@param` đặt tên một tham số không tồn tại là vi phạm, đối xứng với việc kiểm tra mâu thuẫn giữa `@mode` và chữ ký. Mô tả thẻ phải không rỗng; chất lượng ngữ nghĩa ngoài phạm vi này thuộc trách nhiệm của review.
- **Tính tường minh có thể kiểm tra bằng duyệt cây**: gate là một lượt duyệt AST thuần túy (không dùng type checker), do đó phương thức service phải chú thích tường minh kiểu trả về (kiểu trả về được suy luận không thể phân loại), tham số interface phải là identifier đơn giản (mẫu destructuring không có tên để khớp với `@param`).
- **Gộp vi phạm** thành một thông báo lỗi duy nhất, liệt kê tất cả vi phạm — khi sửa sẽ thấy đầy đủ danh sách trong một lần. Kiểm tra `@mode` fail-fast trước đây cũng được gộp vào cùng báo cáo này, nội dung thông báo không đổi.

Generator giữ lại hai góc nhìn của cùng một comment source: `parseJsDoc` kết thúc phần thân của mục ngay tại block tag đầu tiên, trong khi khối chữ ký ` ts cordis-catalog ` chứa JSDoc gốc và giữ nguyên đầy đủ `@param`, `@returns` và `@mode`. Do đó, người đọc có thể thấy toàn bộ hợp đồng nguồn, mà văn bản block tag không bị rò rỉ vào phần thân xung quanh.

Test negative-path trong `packages/core/agent/tests/gen-cordis-catalog.spec.ts` chạy `collectEvents`/`collectServices` trên fixture tổng hợp, kiểm chứng mỗi guard đều kích hoạt và các quy tắc miễn kiểm tra đều đúng. Quy tắc viết tài liệu được ghi trong mục quy ước của [AGENTS.md](../../../../AGENTS.md) gốc, cạnh quy tắc `@mode`.

## Các phương án đã cân nhắc

- **Quy tắc ESLint**: không thể nhìn thấy định nghĩa máy của phạm vi này (thành viên `interface Events` nào, `ctx.<key>` nào tạo thành giao diện service hướng ra bên ngoài của Cordis); generator mục lục vừa hay đã tính toán ánh xạ này ở mỗi lần chạy, do đó gate được đặt ở đó.
- **Tách mỗi phương thức thành một tiểu mục thân bài riêng**: từ chối. Mục lục giữ một chương service và một khối chữ ký để duy trì khả năng lướt đọc; JSDoc gắn với mỗi khai báo giữ nguyên hợp đồng phương thức đầy đủ tại chỗ.
- **Thẻ thoát (escape tag)**: không thiết lập. Bề mặt interface này nhỏ và đã được sàng lọc (12 service, 57 phương thức, 27 sự kiện tại thời điểm áp dụng), điểm mấu chốt là việc kiểm tra không thể được miễn trừ.

## Hậu quả

- Sự kiện hoặc phương thức service mới không thể lên production với tham số hoặc kết quả chưa được viết tài liệu: generator sẽ từ chối sinh lại, `verify-cordis-catalog` cũng sẽ làm `doc-sync` và CI thất bại. Khoảng 139 khoảng trống được phát hiện tại thời điểm áp dụng đã được lấp đầy trong cùng thay đổi, do đó gate được đưa vào ở trạng thái xanh.
- Giao diện service phải chú thích tường minh kiểu trả về và dùng tham số dạng identifier. Cả hai ràng buộc đều không gây hạn chế tại thời điểm áp dụng (mọi phương thức đã có chú thích; không tồn tại tham số seam dạng destructuring); nhưng giờ đây chúng là yêu cầu chịu tải, vi phạm sẽ bị phát hiện bằng máy.
- Quy tắc JSDoc chung trong AGENTS.md ("nếu một dòng nói rõ được thì dùng một dòng") nhận được một trường hợp đặc biệt nghiêm ngặt hơn trên interface này: chỉ khi phương thức không có tham số và trả về void thì một dòng tóm tắt mới đủ.
- Viết `@param` cho `next` hoặc `this` là hợp lệ nhưng không bị kiểm tra — đây là sự bất đối xứng có chủ ý: gate ép buộc hợp đồng payload, từ chối yêu cầu boilerplate.
- Mỗi đoạn sự kiện hoặc phương thức được sinh ra đều mang JSDoc gốc của nó, còn phần tóm tắt thân bài không chứa thẻ. Do đó, chỉnh sửa source code sẽ đồng thời làm mới chỉ mục có thể đọc được và hợp đồng chính xác được trình bày cạnh chữ ký.
