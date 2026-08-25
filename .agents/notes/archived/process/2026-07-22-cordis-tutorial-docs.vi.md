# Agent Note: Tài liệu hướng dẫn thực hành Cordis dưới `docs/cordis-tutorial`

Status: implemented

Archived: 2026-07-27

[English](2026-07-22-cordis-tutorial-docs.md) | 中文

## Vấn đề

Repo này giới thiệu Cordis ở hai tầng: [cordis-primer](../../../../docs/cordis-primer.md) tinh gọn trình bày khái niệm, còn các trang dưới `docs/user/develop/` giải thích cách viết plugin harness dựa trên các service của harness. Nhưng cả hai đều không phù hợp với developer lần đầu tiếp xúc Cordis: primer giả định người đọc đã biết viết plugin, còn trang phát triển đi thẳng vào `defineTool` mà không cho thấy hành vi thực tế của context, fiber, service và dispatch. Trước đây không có lộ trình học nào cho phép người đọc chạy Cordis thuần, quan sát fiber chuyển sang trạng thái PENDING, hay thấy việc phủ quyết waterfall (event kiểu thác nước) diễn ra trong thực tế.

## Quyết định

`docs/cordis-tutorial/` gồm một bộ giáo trình thực hành bảy chương (plugin đầu tiên → vòng đời và effect → service → event → cấu hình → hợp thành và HMR (hot module replacement) → tool của harness). Dưới đây là các đặc điểm của giáo trình, xếp theo mức độ quan trọng giảm dần:

- **Mỗi transcript (bản ghi văn bản) đều thực và có thể tái tạo được.** File của mỗi chương đều chạy qua `node --import tsx ../../vendor/cordis/bin.js` trong thư mục tạm `tmp/cordis-tutorial/` bị git bỏ qua, và output hiển thị chính là những gì các lệnh đó thực sự in ra. Các chương dùng package harness (`@deepseek-ai/dsh-tools` và `@deepseek-ai/dsh-llm`) chạy được mà không cần key.
- **Theo phong cách dsh, không phải Cordis thuần**: các chương sau dùng service và event harness thật (`ctx.tools`, `tools/result`), đưa người đọc dần tới mô hình hợp thành mà repo này thực sự dùng, theo đúng lựa chọn của người dùng đã đưa ra yêu cầu.
- **Chỉ có bản tiếng Anh, nhưng phát hành ở cả hai locale trên website**: thông qua `mirroredPages()` trong [website/docs.ts](../../../../website/docs.ts), phát hành vào mục `Cordis 教程` / `Cordis tutorial` trong sidebar phần phát triển. Cách này giống mẫu mà các trang tham chiếu dùng, nên sau này có thể dần bổ sung bản tiếng Trung song song mà không cần đổi route.
- Ngoại trừ hai code block có fence, các code block còn lại đều được `doc-typecheck` biên dịch; hai ngoại lệ đó lần lượt import file đường dẫn tương đối trong thư mục tạm (`./stats.ts`) hoặc cố ý ném exception, nên được đánh dấu `ignore-check`.

## Các phương án thay thế đã cân nhắc

**Đặt thành tài liệu sản phẩm song ngữ dưới `docs/user/develop/`.** Tầng này yêu cầu cung cấp đồng thời bản tiếng Anh, tiếng Trung và bản ghi i18n trong cùng một PR (Pull Request), khiến khối lượng thay đổi gần như tăng gấp đôi, và yêu cầu mỗi lần sửa giáo trình sau này đều phải đồng bộ dịch. Lần triển khai đầu tiên không dùng phương án này; phép chiếu mirror vẫn giữ được mức độ hiển thị công khai tương đương.

**Giáo trình Cordis thuần không dùng bất kỳ package harness nào.** Là tài liệu khung sẽ gọn hơn, nhưng đối tượng độc giả mục tiêu là developer agent (tác nhân) mở rộng harness này; kết thúc bằng `ctx.tools.execute` và `tools/result` giúp giải thích rõ cách hợp thành mà họ thực sự dùng. Người dùng đã chọn rõ ràng phương án này.

**Mở rộng primer thay vì tạo thư mục mới.** Primer là tài liệu tham chiếu khái niệm tinh gọn với ngân sách tối đa 600 từ; thêm nhiều chương thực hành vào đó sẽ phá vỡ vai trò và ngân sách dung lượng của tầng tài liệu này, thay vì bổ sung cho nó.

## Kết quả

- Hiện đã có một giáo trình nhập môn Cordis có thể chạy được, bao phủ loader, trạng thái fiber, effect, tiêm service, hợp đồng của cả năm chế độ dispatch, kiểm chứng Schemastery và HMR. Giáo trình thực sự cho thấy dependency ở trạng thái PENDING và kiểm chứng cấu hình thất bại; đối với trường hợp phân giải mục cấu hình mà loader ghi log thất bại, giáo trình chỉ nêu giải thích, vì log ở giai đoạn khởi động có thể không tới được bộ xuất ra console.
- Transcript trong giáo trình ghim hành vi theo cách không chính thức, nhưng không có gate snapshot; nếu hành vi của loader hoặc HMR thay đổi, transcript sẽ dần lệch khỏi kết quả thực tế cho tới khi có người chạy lại từng chương. Gate biên dịch chỉ bao phủ các code block có fence.
- Từng chương ghi rõ API harness cụ thể (`ctx.tools.execute`, `CallId`, `tools/result`); khi các API này đổi tên, phải đồng bộ sửa giáo trình như với các tham chiếu tài liệu khác (`verify-md-links` có thể phát hiện file bị di chuyển, nhưng không phát hiện được thay đổi trong văn bản tham chiếu API).
