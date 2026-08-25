# Agent Note: Trigger vòng đời Issue do review thúc đẩy

Status: implemented

Archived: 2026-08-10

[English](2026-08-08-review-driven-issue-lifecycle-triggers.md) | 中文

## Vấn đề

Workflow vòng đời Issue đọc PR (Pull Request) hiện tại sau mỗi sự kiện repo đã đăng ký, và tiến trạng thái của Issue giải quyết (resolving) lên `In progress` hoặc `In review`. PR nháp (draft) giải quyết Issue đã vào `In progress` thông qua sự kiện `opened` của nó. Chuyển draft đó thành trạng thái có thể review, trước khi có yêu cầu reviewer hoặc reviewer submit review, sẽ không tạo ra kết quả vòng đời mới; nhưng nếu đăng ký `ready_for_review` thì vẫn sẽ khởi động thêm một job được quản lý khác, và tạo thêm một GitHub App token khác.

Tự động hóa chuyển draft thành trạng thái có thể review thường sẽ submit review chỉ sau đó một chút. Trong chuỗi sự kiện này, job chuyển sang trạng thái có thể review không thể tiến Issue lên, mà để quan sát được giai đoạn `In review`, vẫn phải chạy job review.

## Quyết định

[Vòng đời Issue](../../../../.github/workflows/issue-lifecycle.yml) không đăng ký `pull_request.ready_for_review`. Nó giữ `pull_request.review_requested` và `pull_request_review.submitted`, do đó dù là yêu cầu reviewer hay submit review, đều có thể tiến Issue giải quyết lên `In review`. Handler vẫn lấy PR theo thời gian thực, chứ không suy ra giai đoạn từ payload của sự kiện kích hoạt.

[Chính sách Issue](../../../../.github/workflows/issue-policy.yml) vẫn đăng ký `ready_for_review`. Workflow này chịu trách nhiệm thực thi kiểm tra bắt buộc khi PR do con người khởi tạo bước vào giai đoạn review; loại bỏ trigger vòng đời không làm suy yếu việc thực thi chính sách.

Test workflow parse cả hai file này, và cố định sự phân chia này. Test chính sách vòng đời cố định riêng các hành vi sau: PR giải quyết ở trạng thái nháp và trạng thái mở sẽ vào `In progress`, yêu cầu review hoặc review đã submit sẽ khiến nó vào `In review`.

## Các phương án thay thế đã cân nhắc

- **Giữ cả hai sự kiện và hủy các lần chạy workflow đang tiến hành**: không được chấp nhận, vì kiểm soát đồng thời có thể loại bỏ lần chạy workflow đang chờ, nhưng không thể gộp hai payload webhook thành một lần thực thi. Việc hủy thao tác chuyển trạng thái sớm hơn cũng khiến tính đúng đắn phụ thuộc vào thứ tự sự kiện đến; còn job chuyển sang trạng thái có thể review đã hoàn tất vẫn phải chịu toàn bộ overhead khởi tạo runner.
- **Loại bỏ sự kiện review đã submit**: không được chấp nhận, vì review có thể được submit trực tiếp mà không có yêu cầu review rõ ràng. Trên đường đi đó, `pull_request_review.submitted` là sự kiện repo duy nhất giúp hệ thống quan sát được việc chuyển trạng thái sang `In review`.
- **Để mỗi sự kiện PR đi qua bộ điều phối chống dội (debounce dispatcher) trước khi xử lý**: không được chấp nhận, vì thêm một hàng đợi hoặc một workflow định kỳ sẽ đưa vào độ trễ và trạng thái control plane, chỉ để loại bỏ một trigger không mang thông tin vòng đời.

## Hệ quả

Sau khi draft chuyển sang trạng thái có thể review, công việc vòng đời Issue không còn được khởi động nữa. Issue giải quyết sẽ giữ nguyên `In progress` do sự kiện PR sớm hơn thiết lập, cho tới khi có yêu cầu hoặc submit review; lúc đó, một lần chạy workflow do review thúc đẩy là đủ để tiến nó lên `In review`. Kiểm tra chính sách Issue bắt buộc vẫn chạy tại ranh giới chuyển sang trạng thái có thể review.

Nếu trong tương lai một giai đoạn vòng đời nào đó phụ thuộc vào chính trạng thái có thể review, thay đổi liên quan phải khôi phục lại trigger này, đồng thời cập nhật test workflow và quyết định này. Trước khi điều đó xảy ra, việc bỏ qua `ready_for_review` giúp chuỗi sự kiện phổ biến "chuyển sang trạng thái có thể review rồi submit review" tiết kiệm được một lần khởi động workflow được quản lý, mà không bỏ sót bất kỳ chuyển trạng thái nào.
