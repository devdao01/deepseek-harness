# Agent Note: Cô lập thiết lập pnpm theo từng runner GitHub Actions

Status: implemented

[English](2026-07-29-pnpm-setup-runner-isolation.md) | Tiếng Việt

## Vấn đề

Thư mục đích cài đặt của `pnpm/action-setup@v4` mặc định là `~/setup-pnpm`, và sẽ thay thế thư mục đó trong lúc thiết lập. Cơ chế chuyển dự phòng của CI tự vận hành chạy sáu dịch vụ runner GitHub Actions dưới cùng một người dùng VM, nên các job chạy song song dùng chung một thư mục đích. Trong lần chạy tái hiện, ba job cùng bước vào giai đoạn thiết lập pnpm trong vòng 73 mili giây; một trong các tiến trình thiết lập đó đã xóa thư mục làm việc hiện tại của tiến trình khác, khiến hai job thất bại ngay ở giai đoạn khởi tạo `uv_cwd` của Node. Thử lại trên một runner khác thì thành công, cho thấy sự cố phụ thuộc vào thời điểm chứ không phải hồi quy test của repository.

## Quyết định

Mỗi bước `pnpm/action-setup` trong [workflow CI chính](../../../../.github/workflows/ci.yml) đều đặt `dest: ${{ runner.temp }}/setup-pnpm`. Mỗi dịch vụ runner độc chiếm thư mục tạm của riêng nó, nên một tiến trình thiết lập không thể thay thế thư mục cài đặt của runner khác. Việc tái sử dụng store bền vững vẫn do `PNPM_CONFIG_STORE_DIR` xử lý độc lập, theo [quyết định cấu hình pnpm](../process/2026-07-26-pnpm-action-setup-for-symmetric-ci-caching.md).

[Test hồi quy workflow](../../../../scripts/ci-workflow.spec.ts) sẽ tìm ra mọi bước `pnpm/action-setup` trong `ci.yml` và từ chối những bước thiếu thư mục đích riêng cho runner. Điều này đảm bảo các job được thêm về sau cũng nằm trong cùng ranh giới cô lập.

## Các phương án từng cân nhắc

**Chạy tuần tự các job chuyển dự phòng.** Bác bỏ: cách này hy sinh khả năng song song kỳ vọng của một pool gồm sáu runner, và biến xung đột thư mục bên trong action thành cảnh xếp hàng chờ giữa những job vốn độc lập với nhau.

**Cấp cho mỗi dịch vụ runner một người dùng Unix riêng.** Cách này cũng cô lập được `HOME`, nhưng lại đẩy bất biến đó sang cấu hình VM bên ngoài, và làm phức tạp quyền sở hữu của store pnpm bền vững vốn được chia sẻ có chủ đích. Workflow thì đã sẵn có thư mục tạm riêng cho từng runner.

**Thử lại bước thiết lập bị lỗi.** Bác bỏ: thử lại chỉ hạ thấp tần suất xung đột quan sát được; một tiến trình thiết lập chạy song song khác vẫn có thể xóa lại chính thư mục dùng chung đó.

## Hệ quả

Tệp thực thi pnpm được cài tạm thời và cô lập theo runner; việc tải gói vẫn dùng store bền vững hoặc store cache đã cấu hình. Job chạy trên hạ tầng được lưu trữ dùng cùng thư mục đích tường minh đó, không làm thay đổi chính sách cache. Vì vậy mỗi bước thiết lập trong workflow có thêm ba dòng cấu hình; chỉ khi cấu hình pnpm cố ý chuyển sang một cơ chế cô lập khác thì mới cần cập nhật test hồi quy.
