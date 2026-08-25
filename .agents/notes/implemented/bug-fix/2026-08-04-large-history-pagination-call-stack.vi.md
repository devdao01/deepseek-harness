# Agent Note: Thông tin truy vết nguồn của lịch sử quy mô lớn được xử lý bằng cách quét, không trải tham số

Status: implemented

[English](2026-08-04-large-history-pagination-call-stack.md) | Tiếng Việt

## Vấn đề

Một message assistant đã chốt có thể tham chiếu tới hàng trăm nghìn phân mảnh streaming thông qua `sourceEventSeqs`. Logic phân trang lịch sử dùng `Math.min(event.seq, ...sourceEventSeqs)` để tìm event đầu tiên của nhóm message, vì vậy một session hợp lệ vẫn có thể vượt quá giới hạn số lượng tham số hàm của JavaScript engine, khiến `session.history` thất bại với HTTP 500.

## Quyết định

Logic phân trang quét `sourceEventSeqs` theo từng phần tử, mỗi lần dùng một phần tử để cập nhật số thứ tự sớm nhất. Độ phức tạp của thuật toán vẫn tuyến tính theo quy mô thông tin truy vết nguồn, và giữ nguyên ranh giới trang hiện có: điểm bắt đầu của trang nằm trước mọi nguồn đã ghi nhận của message sớm nhất mà trang đó chứa.

Regression test bác bỏ cách gọi hàm lấy giá trị nhỏ nhất với nhiều tham số, và xác minh rằng mỗi event nguồn đều nằm cùng trang với message đã chốt của nó. Điều này vừa bao phủ cơ chế gây lỗi, vừa tránh việc bộ test mặc định phải cấp phát luồng phân mảnh ở quy mô production.

## Các phương án đã cân nhắc

- **Nâng giới hạn stack hoặc số tham số của JavaScript**: không chọn, vì giới hạn này phụ thuộc vào engine và môi trường triển khai, hơn nữa việc trải mảng vẫn khiến lịch sử hợp lệ bị ràng buộc bởi những giới hạn runtime không liên quan.
- **Cắt bớt `sourceEventSeqs` khi phân trang**: không chọn, vì cách này có thể cắt trang ngay giữa một message, phá vỡ cách gom nhóm khi phát lại.
- **Giới hạn số phân mảnh streaming tại ranh giới của provider**: không chọn, vì provider hoàn toàn có thể sinh ra luồng dài một cách hợp lý, còn phân trang thì phải xử lý được mọi biểu diễn session hợp lệ.

## Hệ quả

- Các mảng truy vết nguồn kích thước lớn không còn khiến phân trang lịch sử ném exception chỉ vì độ dài của chúng.
- Ngữ nghĩa phân trang và response của protocol giữ nguyên.
- Quyết định này không giới hạn kích thước byte của một trang lịch sử, cũng không giới hạn chi phí trình duyệt bỏ ra để phát lại trang đó; hai vấn đề hiệu năng này vẫn được xử lý tách biệt khỏi lỗi call stack phía server.
