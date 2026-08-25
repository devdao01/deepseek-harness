# Agent Note: Cổng CI bắt buộc cho đầu ra kỳ vọng của Web browser

Status: implemented

[English](2026-07-30-web-browser-snapshot-ci-gate.md) | 中文

## Vấn đề

[Làn e2e Web browser không cần khóa](2026-07-24-web-gui-browser-e2e-lane.md) chỉ được chạy cục bộ qua `pnpm run test:web`, PR CI không so sánh `apps/web/tests/snapshots/**/*.expected.md`. Do đó, một PR làm thay đổi đầu ra Web hiển thị với người dùng có thể vẫn xanh dù quên cập nhật (refresh) đầu ra kỳ vọng; sau đó, khi một nhánh bất kỳ chạy tường minh `DSH_SNAPSHOT=refresh`, nó sẽ gánh nợ thay cho các thay đổi trước đó và sinh ra diff không liên quan đến chính nhánh đó. Các lần chạy cục bộ thông thường vốn đã mặc định dùng chế độ replay chỉ đọc; lỗ hổng nằm ở việc thực thi bắt buộc cấp PR, chứ không phải ở việc cấm ghi refresh.

## Quyết định

Job `node 24 / snapshots and artifacts` trên PR Linux phải chạy đầy đủ replay/compare của Web browser. `scripts/run-gates.ts` đưa `test:web:built` thành một gate của `ci-consumers`, và tường minh tiêm `DSH_SNAPSHOT=replay`; CI không bao giờ chạy ở chế độ `record` hoặc `refresh`, nên khi golden đã commit không khớp với ứng dụng đã lắp ráp hiện tại, test sẽ fail trực tiếp, không âm thầm ghi đè rồi pass ngay trong runner.

Job consumer chịu trách nhiệm cho lần build Linux duy nhất trong [build độc lập cho consumer](../process/2026-07-30-independent-ci-consumer-build.md), do đó `apps/web/dist` và thư mục `lib/` của các gói sẽ được giữ lại trong workspace của job đó để bộ test browser sử dụng. Trên runner được quản lý, CI cài Chromium và các phụ thuộc hệ thống của nó theo phiên bản Playwright ghi trong lockfile. Trên VM dự phòng bền vững (failover), image chịu trách nhiệm cài sẵn gói hệ thống Linux, CI chỉ cài Chromium, tránh việc mỗi lần chạy đều sửa hệ thống qua `apt`. Job Linux tuần tự trên nhánh mặc định được quản lý chạy bộ test này và sinh ra cache browser theo khóa là hệ điều hành và lockfile; PR khôi phục cache đó, giúp đường dẫn bắt buộc không phải chịu chi phí nén và upload, và có thể fallback theo tiền tố hệ điều hành khi lockfile thay đổi. Bản chạy tự quản lý dự phòng thực hiện cùng phép so sánh nhưng không thao tác cache được quản lý.

`pnpm run test:web` cục bộ vẫn build trước rồi chạy đầy đủ bộ test browser; `test:web:built` là điểm vào thực thi cho sản phẩm build đã có sẵn. Nhà phát triển chỉ chạy tường minh `DSH_SNAPSHOT=refresh pnpm run test:web` sau khi đã xác nhận đầu ra hiển thị với người dùng thay đổi có chủ đích, rà soát từng diff đầu ra kỳ vọng, rồi xác minh lại ở chế độ replay để đảm bảo không còn ghi file.

Đối với PR, cổng này chỉ chạy trong job consumer Linux: các kịch bản này hướng tới POSIX, các job PR khác không cài Chromium. Job tuần tự Linux nhánh mặc định được quản lý và tự quản lý cũng bao gồm phép so sánh này, còn job tuần tự macOS và Windows vẫn không dùng browser. `all checks passed` của PR vốn đã phụ thuộc vào job consumer, nên khi so sánh browser thất bại sẽ chặn merge mà không cần thêm tên check branch-protection mới.

Trong một lần chạy consumer tự quản lý, `web-snapshot` đo được 112.15 giây, toàn bộ tổng hợp consumer đo được 114.97 giây. Bộ điều phối gate khởi động nó ngay khi `built-package-invariants` thành công, và chạy song song các gate độc lập với nhau, nên không cần timeout job chuyên dụng cũng không cần quy tắc thứ tự YAML thủ công.

## Các phương án thay thế đã cân nhắc

**Tiếp tục chỉ yêu cầu chạy cục bộ.** Đã bác bỏ: việc thực thi phụ thuộc vào trí nhớ của nhà phát triển, chính là nguyên nhân golden bị lỗi thời trôi dạt qua nhiều PR, và không đảm bảo PR gây ra thay đổi hành vi tự mang theo diff đầu ra kỳ vọng.

**Cho CI chạy ở chế độ `refresh` rồi kiểm tra working tree.** Đã bác bỏ: so sánh sau khi ghi sẽ biến cơ chế assertion thành generator; nếu việc kiểm tra working tree cắm sai, nó có thể biến một regression thành một bản cập nhật đầu ra kỳ vọng có thể pass; so sánh trực tiếp ở chế độ replay với golden có sẵn có diện thất bại nhỏ hơn.

**Tạo job browser độc lập mới và build lại toàn repo.** Đã bác bỏ: sẽ lặp lại việc cài phụ thuộc và build bản phát hành. Job consumer Linux hiện có đã chịu trách nhiệm cho việc build đó, và đã được gộp vào verdict bắt buộc thống nhất.

**Dùng snapshot jsdom thay cho Chromium thật.** Đã bác bỏ: jsdom không bao phủ browser, tầng vận chuyển HTTP/SSE, và tổ hợp gói plugin client thật; nó vẫn có thể dùng để lấy phản hồi nhanh ở tầng dưới, nhưng không thể thay thế đường dẫn browser đã lắp ráp hoàn chỉnh.

## Hệ quả

Mỗi PR đều chứng minh được rằng bản lắp ráp Web hiện tại khớp với mọi đầu ra kỳ vọng của browser đã commit, trước khi merge; quên cập nhật giờ trở thành lỗi của chính PR đưa vào thay đổi, chứ không còn là "thay đổi không liên quan của PR sau". Cái giá phải trả là job consumer cần cài Chromium, và chạy tuần tự một lượt các kịch bản browser; build độc lập cho consumer và cache browser tránh việc build và tải lại lặp lại giữa các lần chạy. Cổng này vẫn không tuyên bố tính nhất quán browser xuyên nền tảng; nếu nâng cấp Playwright/Chromium làm thay đổi định dạng ARIA, PR nâng cấp phải tường minh refresh và rà soát churn.
