# Nhập môn Cordis

[English](cordis-primer.md) | Tiếng Việt

Cordis là framework plugin được đưa vào theo cách vendor ở tầng nền của DeepSeek Harness. Bài này giới thiệu những khái niệm cốt lõi của Cordis mà tác giả plugin harness cần nắm trước khi đọc phần tham chiếu service/event được sinh ra trên [trang subsystem](subsystems/core.md); còn [hướng dẫn Cordis](cordis-tutorial/index.md) sẽ giảng giải từng khái niệm này qua thực hành. Mã nguồn vendor và quy trình đồng bộ xem tại [vendor/README.md](../vendor/README.md).

## Năm khái niệm cốt lõi

- **Plugin là đối tượng hiện thực hóa Service.** Nó có thể là một hàm với các trường tùy chọn `inject` và `apply(ctx)`, cũng có thể là một lớp con của `Service` mà vòng đời của nó được Cordis gắn vào ngữ cảnh hiện tại.
- **Ngữ cảnh là vật chứa của service.** Một service chiếm một `ctx.<key>` ổn định (như `ctx.tools`, `ctx.llm`, `ctx.sessions`); các plugin khác tra cứu service theo key chứ không import phần hiện thực cụ thể.
- **Khai báo phụ thuộc service bằng `inject`.** Sau khi plugin khai báo các service nó cần, nó sẽ chờ những service đó sẵn sàng rồi mới khởi động; thứ tự nạp được biểu đạt qua phụ thuộc service chứ không phải qua việc sắp xếp trình tự khởi động thủ công.
- **Sự kiện có kiểu dùng để giao tiếp.** Service đăng ký tên sự kiện qua declaration merging của TypeScript, rồi phân phát theo kiểu `emit`, `waterfall` (sự kiện kiểu thác nước), `parallel` hoặc `serial`, tương ứng với việc listener quan sát, bao bọc, tỏa nhánh song song hoặc thực thi tuần tự.
- **Đăng ký là hiệu ứng phụ có thể đảo ngược.** Các đoạn prompt, tool schema, adapter, provider và listener được cài đặt qua `ctx.effect()` hoặc `ctx.on()`, và sẽ được gỡ bỏ đúng như kỳ vọng khi reload và teardown.

<a id="dispatch-modes"></a>

## Chế độ phân phát

Mỗi sự kiện có một trong các chế độ phân phát sau, và chỉ có thể được phân phát qua phương thức tương ứng.

| Chế độ | Có await không? | Thứ tự phân phát | Có giá trị trả về không? |
|---|---|---|---|
| `emit` | Không | Listener quan sát theo thứ tự đăng ký | Không |
| `waterfall` | Không | Listener quan sát theo thứ tự đăng ký | Có |
| `parallel` | Có | Mọi listener quan sát sự kiện song song | Không |
| `serial` | Có | Listener quan sát theo thứ tự đăng ký | Có |

Chế độ phân phát là một phần trong giao ước công khai của sự kiện. Sự kiện harness mới ghi lại chế độ bằng thẻ `@mode`, để danh mục được sinh ra có thể đối chiếu chéo khai báo với điểm gọi phân phát.

<a id="cordis-waterfall-semantics"></a>

## Ngữ nghĩa Waterfall của Cordis

`ctx.waterfall` là middleware bao quanh. Listener nhận `(...args, next)`. Gọi `next()` sẽ thực thi các listener hạ nguồn; giá trị trả về của hạ nguồn quay về lớp bao bọc hiện tại qua `next()`, và lớp đó có thể bao bọc thêm rồi tiếp tục trả ra ngoài. Trả về mà không gọi `next()` thì mạch bị ngắt.

Listener hợp tác thường sửa đổi một đối tượng yêu cầu hoặc quyết định dùng chung, rồi ủy thác tiếp. Listener cũng có thể chọn thay thế hoàn toàn kết quả, khi đó các listener hạ nguồn chỉ thấy kết quả đã thay thế. Chỉ dùng `prepend: true` khi listener bắt buộc phải chạy trước các đăng ký thông thường.

Với sự kiện một-quyết-định, ngắt mạch chính là chủ ý thiết kế. Listener chính sách khi nắm quyền quyết định có thể trả về mà không gọi `next()`, còn listener chỉ chú thích hoặc quan sát thì bắt buộc phải ủy thác tiếp.

<a id="loader-configuration"></a>

## Cấu hình Loader

`@deepseek-ai/cordis-plugin-include` phân giải `!!js` thành nút biểu thức. Sau khi các inject đã khai báo được kích hoạt, Loader nội suy trường `config` của mục dựa trên ngữ cảnh plugin đó (`ctx.serviceName`), và nội suy trường `disabled` của nó dựa trên ngữ cảnh loader ở mỗi lần ra quyết định gắn kết; Include giữ nguyên các biểu thức dòng lồng nhau cho tới khi dòng đích được kích hoạt. Phần metadata còn lại của mục vẫn giữ giá trị nguyên văn. Khi chọn plugin theo môi trường, hãy dùng overlay.

## Quy tắc thực hành

Hãy đóng gói hành vi thành plugin: sự kiện pipeline của tool thuộc về `ctx.tools`, luồng đầu ra của model thuộc về `ctx.llm`, việc điều phối agent (tác tử) thời gian thực thuộc về `ctx.agents`. Với việc chặn và chính sách thì ưu tiên dùng sự kiện; với lời gọi năng lực trực tiếp thì ưu tiên dùng phương thức của service.

Mỗi lần đăng ký đều phải có disposer (hàm giải phóng tài nguyên) tương ứng: hoặc trả về một cái từ `ctx.effect()`, hoặc dùng phương thức trợ giúp mà Cordis cung cấp để xử lý tự động. Nếu thứ tự teardown có yêu cầu, hãy đặt các phần việc liên quan vào cùng một effect để bảo đảm tài nguyên được giải phóng đúng thứ tự mong muốn.
