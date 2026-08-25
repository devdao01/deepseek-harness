# Agent Note: Sinh tài liệu tham chiếu API lõi Cordis

Status: implemented

Archived: 2026-07-27

[English](2026-07-20-generated-cordis-core-api.md) | 中文

## Vấn đề

Tác giả plugin cần hiểu chi tiết API Cordis đằng sau `ctx`, dispatch event, Fiber, đăng ký plugin và Service. [Danh mục event và service của Harness](2026-06-20-generated-cordis-catalog.md) hiện có cố ý chỉ tóm tắt sơ lược các thành viên kế thừa từ Cordis, nên không thể thay thế cho tài liệu tham chiếu Cordis ở cấp độ phương thức. Nếu duy trì thêm một bản sao viết tay khác dưới website, nó sẽ trôi lệch khỏi mã nguồn vendor, đồng thời khiến bộ render trở thành một chủ sở hữu tài liệu bổ sung.

## Quyết định

`scripts/cordis-core-api.ts` dùng TypeScript Compiler API để đọc khai báo public và JSDoc gốc từ `vendor/cordis/src`. Một danh sách trang tường minh sinh ra năm file dưới [`docs/cordis-catalog/core/`](../../../../docs/cordis-catalog/core/context.md): Context, Events, Fiber, Registry và Service. `scripts/gen-cordis-catalog.ts` ghi các trang này cùng với danh mục event và service của Harness, và `verify-cordis-catalog` sẽ từ chối sản phẩm đã lỗi thời.

Bộ sinh kiểm chứng rằng các class và method được ghi lại vẫn giữ JSDoc mô tả, bao gồm hợp đồng tham số và giá trị trả về non-void. Nó sinh ra khối code fence `ts cordis-catalog` chỉ chứa khai báo cùng JSDoc gốc, rồi render cùng phần mô tả, tham số và hợp đồng giá trị trả về đó thành Markdown dễ đọc. Liên kết mã nguồn trỏ tới file vendor, năm trang liên kết chéo lẫn nhau. Danh mục Harness vẫn là danh sách đầy đủ các event và service `ctx.*` mà repo khai báo; các trang lõi chịu trách nhiệm giải thích API kế thừa từ Cordis hoạt động ra sao.

`website/docs.ts` phát hành năm file nguồn chuẩn tới các route `/reference/cordis-api/` và `/en/reference/cordis-api/` tương ứng về cấu trúc. Trước khi bộ sinh tạo ra trang đã dịch, cả hai locale đều dùng nguồn sinh bằng tiếng Anh, nên khi chuyển ngôn ngữ, cấu trúc điều hướng và định danh route vẫn không đổi.

## Các phương án thay thế đã cân nhắc

**Khôi phục file website cũ thành Markdown chuẩn.** Cách này khôi phục trang nhanh, nhưng chữ ký (signature) và mô tả có thể trôi lệch khỏi hiện thực vendor, và website sẽ lại trở thành nguồn tài liệu thứ hai.

**Mở rộng trực tiếp lớp kế thừa trong danh mục Harness.** Các danh mục này trả lời câu hỏi có những event và service nào của Harness. Trộn toàn bộ tài liệu tham chiếu lớp framework vào cùng một trang sẽ làm mờ định vị của danh sách này, và đảo ngược quyết định đã có là giữ lớp kế thừa tinh gọn.

**Phát hành trực tiếp khai báo mã nguồn vendor.** File nguồn có tính thẩm quyền, nhưng không thể cung cấp trang chủ đề ổn định, thứ tự public đã được chọn lọc, hoặc điều hướng website, và còn để lộ các thực thể hiện thực không thuộc hợp đồng tham chiếu.

## Ảnh hưởng

Năm trang API Cordis theo cùng một bộ sinh xác định, bám theo cập nhật vendor, và tái sử dụng kiểm tra độ mới tài liệu của repo. Website có được một chương API Cordis độc lập mà không cần sao chép nội dung, cấu trúc điều hướng giữa mục tiếng Trung và tiếng Anh vẫn nhất quán.

Danh sách trang cần được bảo trì thủ công, nên khi thêm kiểu lõi Cordis công khai mới phải thêm tường minh entry vào bộ sinh. Mô tả sinh hiện tại chỉ có tiếng Anh, và chất lượng JSDoc mã nguồn quyết định trực tiếp chất lượng tài liệu tham chiếu; sản phẩm tiếng Trung cần được hiện thực dịch ở tầng bộ sinh, không thể chỉnh sửa thủ công file đã sinh.
