# @deepseek-ai/dsh-client-hmr

[English](README.md) | Tiếng Việt

Cung cấp hot reload cho các plugin phía client được nạp qua script. Gói tổ hợp web gắn hàng này vô điều kiện; khi không có watcher build lại (`pnpm run dev:web`) ghi đè bundle client, việc polling không quan sát thấy thay đổi nào và toàn tuyến giữ trạng thái nhàn rỗi.

Phía trình duyệt đăng ký kênh SSE (Server-Sent Events) của hệ thống (`GET /plugins/events`), mỗi khung `rebuilt` nạp lại một plugin và được thực thi tuần tự qua hàng đợi. Thứ tự của mỗi khung là: `invalidate`, `prefetch` (nạp và đăng ký gói tổ hợp mới trong lúc fiber cũ vẫn đang phục vụ), `registry.delete` (chạy trước khi dispose (giải phóng tài nguyên) fiber: chỉ dispose fiber mới kích hoạt nhánh self-dispose của vendored Loader, đánh dấu mục cấu hình là bị vô hiệu hóa), rút cạn fiber cũ, xóa `entry.fiber`, gỡ các thẻ `<style data-plugin>` do chính nó sở hữu, import lại và gắn lại qua `entry.refresh()`, ném lại trực tiếp lỗi khởi động qua `fiber.await()`. Bên phụ thuộc được chính Cordis nạp lại: epoch kích hoạt của fiber sẽ nối chuỗi uid của các bên cung cấp dịch vụ cho nó, nên thay thế fiber của bên cung cấp sẽ lan truyền tới toàn bộ bên phụ thuộc mà không cần phân tích đồ thị phía client. Phía node dùng một interval để phát hiện việc build lại: stat-poll từng gói tổ hợp trong đồ thị, bắt đầu từ mốc cơ sở đồng bộ; ngay khi có thêm một hàng mới thì hash được tính lại tức thì; hàng bị thiếu vẫn giữ trạng thái dirty; chỉ phát đi những thay đổi rev thực sự. Vì vậy, bất kỳ tiến trình tsdown watch nào sinh ra gói tổ hợp đều có thể kích hoạt HMR (thay thế module nóng) mà không cần kênh builder→host.

## Trải nghiệm mô hình

Không có. Bộ điều khiển nạp lại thuộc cơ chế phía trình duyệt; không có nội dung nào ở đây đi vào yêu cầu gửi tới mô hình.

#### Ảnh hưởng tới KV Cache

Không có; gói (package) này không lắp ráp cũng không gửi yêu cầu tới nhà cung cấp.

## Giới hạn đã biết và phần tạm hoãn

- **Việc nạp lại được giữ ở mức thô một cách có chủ đích**: hệ thống tạo fiber và component hoàn toàn mới; state React trong plugin được nạp lại sẽ mất, còn tầng dữ liệu (fiber kết nối, fiber runtime và đối tượng Session) không bị ảnh hưởng. Việc giữ state ở mức react-refresh xung đột với nguyên tắc «thực thi lại gói tổ hợp sẽ chạy lại factory», nên nó bị loại trừ một cách có chủ đích.
- **Không rollback khi thất bại**: một lần nạp lại thất bại sẽ đưa mục cấu hình về trạng thái FAILED và hiển thị trong phép chiếu trạng thái của loader; hệ thống không tự khôi phục gói tổ hợp trước đó.
- **Khung build lại không làm mới rev của đồ thị**: rev cũ là vô hại, vì endpoint gói tổ hợp phục vụ nội dung ở chế độ no-cache; chỉ khi kết nối lại thì rev mới được làm mới.
