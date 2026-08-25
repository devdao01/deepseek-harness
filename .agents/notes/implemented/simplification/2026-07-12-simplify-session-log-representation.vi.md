# Agent Note: Đơn giản hóa cách biểu diễn log phiên

Status: implemented

[English](2026-07-12-simplify-session-log-representation.md) | Tiếng Việt

## Vấn đề

Log phiên duy trì hai cách biểu diễn với độ phức tạp cơ chế vượt quá nhu cầu thực tế của bên tiêu thụ: một surface kiểu danh sách liên kết giả và các phần tăng dần (delta) tự chế cho request header.

`SurfaceManager` lưu cùng một thứ tự đồng thời trong mảng, map seq và các liên kết `prev`/`next` có thể thay đổi. Mã production không bao giờ đọc bất kỳ liên kết nào: phán định cân bằng cặp công cụ của compact dựa trên giá trị cân bằng tại từng điểm cắt được cache theo thứ tự surface. Việc thay thế vốn đã dùng `indexOf`, nên các liên kết không làm cho thao tác chủ đạo trở thành hằng số thời gian. Một mảng seq với tra cứu thay thế tuyến tính có cùng chi phí thay thế tiệm cận, nhưng chỉ còn một cách biểu diễn cần kiểm chứng.

Hệ thống con request header cài đặt cả một bộ codec delta system/tools tự chế cùng một lớp quyết định truyền tải, mặc dù giao ước của chính nó đã tuyên bố delta chỉ là tối ưu hóa mã hóa, chứ không phải yêu cầu để dựng lại được. Chỉ cần giữ snapshot đầy đủ khi khởi tạo/khôi phục tại mỗi ranh giới thực thể agent loop (vòng lặp tác tử), rồi ghi một `request/header` đầy đủ chuẩn tắc mỗi khi header đã lắp ráp của thực thể đó thay đổi, là bảo toàn được khả năng phát lại, đồng thời xóa bỏ `SystemDelta`, `ToolsDelta`, logic dự phòng khứ hồi và biến thể bền vững `request/header-delta`. Phần từ vựng chuyên dụng của codec biến mất cùng codec, chứ không phải vì bản thân các nhánh của nó không hợp lệ.

Bản cài đặt vẫn giữ `sourceEventSeqs` cho thao tác nối thêm và thay thế, seq `tool/call` mà kết quả sửa lỗi sập tham chiếu tới, và mọi biến thể `SessionStartSource`, vì các trường này gánh trách nhiệm kiểm toán/chặn bắt, và việc hiện chưa có bên đọc không phủ nhận được điều đó.

## Quyết định

`SurfaceManager.nodes` là một `readonly number[]` gồm các số thứ tự sự kiện; hình dạng công khai `SurfaceNode`, các liên kết node và map seq-to-node đều đã bị gỡ. Tín hiệu generation thay thế nội bộ được giữ lại. Lần đọc `foldSurface()` đầy đủ mà session-query sử dụng trả về đúng cách biểu diễn mảng số đó cùng metadata thay thế, mà không cần manager delta giữ lại lịch sử. Cân bằng cặp công cụ và nén (compaction) dùng số thứ tự sự kiện cùng vị trí trong surface; cache cân bằng tại từng điểm cắt do compact sở hữu không phụ thuộc vào liên kết node.

Request header chỉ dùng snapshot đầy đủ chuẩn tắc. Các mốc neo khởi tạo và khôi phục vẫn là snapshot đầy đủ ngay cả khi không có thay đổi; thay đổi bên trong một thực thể sẽ nối thêm một `request/header` đầy đủ khác với reason là `change`. Các sự kiện delta, kiểu codec, hàm hỗ trợ diff/apply, cùng reason `fallback` vốn chỉ dành cho codec đều đã bị gỡ. Việc dựng lại request sẽ chọn snapshot mới nhất.

`SESSION_FORMAT_VERSION` vẫn cố định ở `0`, nên seed, nối thêm và xác thực khi nạp bản lưu bền vững sẽ từ chối tường minh các sự kiện `request/header-delta` v0 cũ, cũng như các snapshot đầy đủ mang reason `fallback` đã bị xóa. Không có fold tương thích hay bước migration nào. Các bài kiểm thử JSONL và SQLite cố định ranh giới thất-bại-là-báo-lỗi này; còn harness snapshot ACP (Agent Client Protocol) biểu diễn thay đổi hợp lệ giữa chừng phiên thành request header đầy đủ cố định và prompt đầy đủ đọc được.

## Các phương án đã cân nhắc

**Giữ lại node danh sách liên kết và delta gọn nhẹ để dành cho mở rộng tương lai.** Các liên kết có thể có ích cho một API con trỏ (cursor) trong tương lai, và delta có thể thu nhỏ log khi schema công cụ lớn mà chỉ thay đổi chút ít. Nhưng không có con trỏ nào đã phát hành dùng tới các liên kết này, còn snapshot đầy đủ thì đánh đổi dung lượng đĩa để đơn giản hóa đáng kể việc đảm bảo tính đúng đắn. Nếu kích thước header thực sự trở thành vấn đề, có thể thiết kế phương án nén hoặc phương án delta chuẩn tắc có đo lường dựa trên các trace thực tế.

## Kiểm chứng

Unit test bao phủ và chốt lại hành vi nối thêm/thay thế của surface có thứ tự, cặp công cụ, nén, fold/ghi request header đầy đủ, dựng lại request và các bất biến trong quá trình phát triển. Việc xác thực seed cùng các bài kiểm thử nạp JSONL và SQLite sẽ từ chối sự kiện cũ trước khi phát lại. Bộ test ACP không cần khóa bao phủ việc ghi, xả, phát lại, cố định request header sau thay đổi, và fixture (dữ liệu chuẩn bị cho test) chuyển đổi chế độ sandbox theo cách biểu diễn mới.

## Hệ quả

Request header đầy đủ làm tăng dung lượng log, và tra cứu thay thế tuyến tính cũng có thể chậm trên các surface cực lớn. Vì bản cài đặt trước đó đã gọi `indexOf`, việc thay thế vốn dĩ đã là tuyến tính; benchmark được hoãn lại cho đến khi các trace thực tế cho thấy mảng đơn giản hơn trở thành nút thắt cổ chai. Phiên bản định dạng vẫn là `0`, nên việc từ chối tường minh các sự kiện cũ là một phần vĩnh viễn của ranh giới định dạng tiền phát hành. Đổi lại, thứ tự surface và trạng thái request header giờ mỗi thứ chỉ có một cách biểu diễn, xóa bỏ việc bảo trì liên kết, map, các nhánh codec, fallback khứ hồi và việc chuẩn hóa snapshot dành riêng cho delta.
