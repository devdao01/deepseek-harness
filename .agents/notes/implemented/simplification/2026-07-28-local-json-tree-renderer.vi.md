# Agent Note: Bộ render cây JSON cục bộ

Status: implemented

[English](2026-07-28-local-json-tree-renderer.md) | Tiếng Việt

## Vấn đề

Trình kiểm tra JSON chỉ đọc được dùng bởi [sổ ghi kiểm tra quỹ đạo](../feature/2026-07-27-trajectory-inspection-ledger.md) cần cung cấp bản xem trước gọn cho object và array, đường dẫn array rõ ràng phục vụ thao tác sao chép, hai chế độ nút gốc là cố định mở rộng và có thể thu gọn, cùng khả năng điều hướng bằng bàn phím. `react-json-view-lite` không cung cấp cả khả năng render nút tùy biến lẫn định danh dòng; muốn đáp ứng các yêu cầu này qua dependency đó thì phải dùng package manager để vá tệp phát hành đã biên dịch, rồi duyệt DOM để khôi phục đường dẫn dữ liệu từ các nhãn hiển thị. Bản vá đó trên thực tế tương đương một fork không chịu ràng buộc kiểu, trong khi source map lẫn mã nguồn thượng nguồn của nó đều không được sửa đồng bộ.

## Quyết định

`JsonTree` trong `dsh-client-ui-primitives` tự chịu trách nhiệm hiển thị đệ quy.

- Mỗi dòng render nhận trực tiếp giá trị và đường dẫn thuộc tính của chính nó. Khi đệ quy, khóa của object và chỉ số của array được nối vào cuối đường dẫn, nên thao tác sao chép không còn phải suy ngược dữ liệu ứng dụng từ văn bản render trong DOM.
- Dòng có thể mở rộng sẽ render bản xem trước gọn ngay tại chỗ, và chỉ gắn các dòng con khi được mở rộng. `expandTopLevel` cho phép chọn khung ngoặc cố định mở rộng hoặc nút gốc có thể thu gọn, mà không thay đổi giao ước công khai của component.
- Trong toàn bộ cây, mọi nút hiển thị chỉ giữ lại một điều khiển mở rộng có thể lấy focus bằng phím Tab. Sau khi kích hoạt điều khiển bằng con trỏ, điều khiển đó trở thành vị trí focus của phím Tab; phím mũi tên lên, xuống di chuyển focus theo vòng, phím mũi tên trái, phải thu gọn hoặc mở rộng nút đang có focus.
- `react-json-view-lite` không nằm trong dependency của `dsh-client-ui-primitives`, và cũng không có bản vá pnpm nào. Các bài test component có mục tiêu cố định bản xem trước, việc mở rộng, focus bàn phím và đường dẫn sao chép của array.

## Các phương án đã cân nhắc

**Giữ bản vá tệp phát hành.** Không chấp nhận: logic render riêng của ứng dụng và quy ước định danh array vẫn bị giấu trong tệp bên thứ ba được sinh ra; mỗi lần cập nhật dependency đều phải rà soát một fork không có source map đi kèm.

**Dùng trực tiếp bộ render thượng nguồn không có bản xem trước.** Không chấp nhận: `{…}` và `[…]` sẽ làm mất ngữ cảnh payload gọn mà trình kiểm tra quỹ đạo cần khi đọc lướt.

**Chèn bản xem trước và metadata dòng sau khi render.** Không chấp nhận: Effect hoặc MutationObserver vẫn phụ thuộc vào chính cấu trúc DOM riêng tư đó, đồng thời khiến React và cơ chế thay đổi mệnh lệnh cùng phụ trách những phần khác nhau của cùng một dòng.

**Dùng một trình xem JSON đồ sộ hơn.** Không chấp nhận: hệ thống chỉnh sửa, tìm kiếm và theme nằm ngoài phạm vi giao ước chỉ đọc hiện tại; mở rộng phạm vi dependency cũng không loại bỏ được phần mã sao chép và bố cục riêng của trình kiểm tra.

## Hệ quả

Trình kiểm tra JSON được một hiện thực duy nhất phụ trách ở tầng mã nguồn, có luồng dữ liệu tường minh và đường dẫn array chính xác, đồng thời không có dependency bị vá. `dsh-client-ui-primitives` phụ trách render đệ quy, trạng thái mở rộng, cấu trúc cây ARIA và hành vi di chuyển focus theo vòng, nên khi sửa các ngữ nghĩa này thì phải bổ sung bài test component có mục tiêu. Hiện thực cố ý giữ ở mức chỉ đọc, chỉ bao gồm các hành vi xem trước, điều hướng và sao chép mà bên tiêu thụ hiện tại đang dùng.
