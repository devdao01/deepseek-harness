# Agent Note: Ranh giới khôi phục có thể di chuyển được cho CI của pull request bắt buộc

Status: implemented

[English](2026-07-23-portable-required-pull-request-ci.md) | Tiếng Việt

## Vấn đề

Các job bắt buộc của pull request được gán vào label runner tự sở hữu của tổ chức sẽ xếp hàng liên tục khi GitHub không thể cấp runner cho các pool đó. Bản thân workflow vẫn hoạt động, các job hosted chuẩn của GitHub vẫn pass, nhưng `all checks passed` không bao giờ khởi động được, khiến những pull request vốn khỏe mạnh không thể thỏa mãn yêu cầu branch protection.

Trạng thái billing bình thường, runner definition ở trạng thái `Ready`, và giới hạn autoscale cao đều không chứng minh được rằng runner pool được chỉ định có thể nhận job. Kiểm tra đúng đắn bắt buộc cần một đường khôi phục có thể di chuyển được xác định trước, ngay cả khi đường độ trễ thấp hằng ngày phụ thuộc vào việc cấp phát runner bên ngoài repo.

## Quyết định

[CI](../../../../.github/workflows/ci.yml) chạy các job Node 24 chính bắt buộc, cùng với luồng aggregate `all checks passed` ổn định, trên pool runner enterprise 32 core chỉ dùng riêng cho repo này. Luồng aggregate đó không thực hiện checkout code hay chạy gate nào của repo; nhưng để nó dùng chung pool runner enterprise với các job thực chất mà nó phụ thuộc giúp tránh việc, sau khi các job đó đã thành công, kết quả xác định bắt buộc lại phải phụ thuộc thêm vào một dependency billing hosted chuẩn riêng biệt. Job Windows bắt buộc chạy Windows Node qua Wine trên `ubuntu-latest` chuẩn, bao phủ phạm vi kiểm tra chặn (blocking); một job `windows-2025` native độc lập được khởi động tự động, nhưng không tham gia luồng aggregate ([quyết định Windows kép](2026-08-08-native-windows-pull-request-ci.md)). Các job `ubuntu-latest` chuẩn giữ lại Node 22.19, Node 26, bộ test unit Python SDK và [xác thực runtime Python Linux x64 dạng phát hành](../testing/2026-08-12-required-python-runtime-pull-request-ci.md), luồng tham chiếu tuần tự vẫn là định nghĩa cross-platform đầy đủ và không bị chia mảnh (unsharded). Các job hosted chuẩn này giữ cho ranh giới thực thi có thể di chuyển được luôn quan sát được, mà không cần lặp lại danh sách chính trong mỗi pull request.

Ba job Linux chính, Node compatibility, bộ test unit Python SDK, xác thực runtime Python và `windows node 24 / wine blocking` tiếp tục là dependency của `all checks passed`; `windows node 24 / native complete` bị loại trừ có chủ đích. Branch protection tiếp tục yêu cầu `e2e` và `all checks passed`. Khi các label runner Linux enterprise còn lại không thể cấp được runner, không có cơ chế fallback tự động: các job chuẩn vẫn tiếp tục báo cáo quy ước riêng của mình, nhưng không thể tạo ra kết quả bắt buộc còn thiếu.

Topology chính hiện tại và kết quả đo lường của nó được ghi ở [quyết định runner lớn dựa trên bằng chứng](2026-07-22-evidence-based-larger-hosted-runners.md). [Luồng tham chiếu tuần tự cross-platform](2026-07-21-serial-cross-platform-ci-reference.md) tiếp tục là một kiểm tra tính toàn vẹn hosted chuẩn độc lập, còn bộ suite runner lớn thủ công vẫn giữ vai trò so sánh spec mà không mở rộng ma trận bắt buộc thông thường.

## Các phương án thay thế từng cân nhắc

**Giữ job Linux chính và luồng aggregate ở dung lượng chuẩn.** Phương án này loại bỏ dependency cấp phát runner enterprise còn lại, nhưng phản hồi job đầy đủ trên runner chuẩn rõ ràng chậm hơn, vẫn gặp tình trạng xếp hàng do dung lượng dùng chung. Cách chia hiện tại vừa giữ được khả năng tương thích và bằng chứng tuần tự có thể di chuyển được, vừa dùng dung lượng runner enterprise cho đường quan trọng (critical path) chính của Linux.

**Chọn spec enterprise theo số core danh nghĩa.** Benchmark cho thấy hiệu quả mở rộng không đơn điệu, thời gian setup cũng dao động, nên pool runner bắt buộc được chọn dựa trên kết quả đo lường chính xác của job đầy đủ.

**Bỏ qua hoặc hạ cấp kiểm tra khi dung lượng không khả dụng.** Cách này khiến trạng thái chuyển xanh bằng cách bỏ bằng chứng, thay vì thực thi các ràng buộc bắt buộc của repo.

**Dùng cùng một chiến lược worker thread trên mọi host.** Mức độ tranh chấp giữa concurrency của gate ngoài và worker thread công cụ bên trong khác nhau giữa Linux, Windows và runner chuẩn. Giới hạn đo thực tế theo từng host giúp tránh việc thêm core lại làm chậm quá trình thực thi.

## Hệ quả

Pull request thông thường sẽ dùng dung lượng runner enterprise cho đường quan trọng Linux, còn job Wine giúp kết quả Windows bắt buộc tiếp tục dùng dung lượng runner Linux chuẩn. Job native độc lập dùng dung lượng runner Windows chuẩn, không làm trễ hay thay đổi luồng aggregate. Một lần chạy thực tế đúng tại head của branch sẽ phân biệt được lệnh mà branch protection sử dụng với quy ước chẩn đoán riêng biệt; độ trễ xếp hàng và khoảng thời gian thực thi từ `startedAt` đến `completedAt` của mỗi job được báo cáo tách riêng.

Khi khả năng cấp phát runner enterprise suy giảm, các job tương thích chuẩn, job Wine bắt buộc và job Windows native chẩn đoán vẫn cung cấp bằng chứng hữu ích, nhưng không thể khiến job Linux bắt buộc bị chặn hoặc luồng aggregate chuyển xanh. Khi Linux khả dụng trở lại, có thể cần khôi phục toàn bộ topology hosted chuẩn; chỉ thay đổi trạng thái định nghĩa runner pool không đủ để chứng minh nó có thể nhận job.
