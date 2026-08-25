# Agent Note: Lệnh trạng thái review PR do sự kiện chỉ định trực tiếp

Status: implemented

[English](2026-08-10-event-directed-pr-review-status.md) | Tiếng Việt

## Vấn đề

Trạng thái trong Project chứa Issue ghi lại bước tiếp theo của công việc giải quyết đang thuộc trách nhiệm của ai. Trạng thái review tổng hợp của PR (Pull Request) có thể trả lời việc GitHub có cho rằng PR đó có thể merge được hay không, nhưng không thể biểu đạt sự bàn giao này: sau khi tác giả sửa code và request lại review, review `CHANGES_REQUESTED` trước đó vẫn có thể tiếp tục có hiệu lực.

Phép chiếu đơn điệu (monotonic projection) cũng không thể đưa Issue đang được tự động quản lý từ `In review` lùi về `In progress` khi reviewer yêu cầu chỉnh sửa. Việc dựng lại vòng review hoặc các mục chặn của reviewer sẽ đưa vào những trạng thái mà quy ước hai sự kiện hiện có không cần đến.

## Quyết định

Quy trình vòng đời Issue coi webhook review là lệnh. `pull_request.review_requested` (kể cả request lặp lại) chỉ định trạng thái mục tiêu là `In review`. `pull_request_review.submitted` chỉ định trạng thái mục tiêu là `In progress`, nhưng chỉ có hiệu lực khi `review.state` là `changes_requested`; sự kiện submitted vẫn không thể bỏ qua, vì reviewer có thể trực tiếp yêu cầu chỉnh sửa mà không cần trước đó kích hoạt sự kiện review-request. Đối với các lượt submit approved và commented, quy trình sẽ bỏ qua job đó trước khi job vòng đời tạo Project token; review dismissed thì không nằm trong phạm vi đăng ký (subscribe).

Các sự kiện PR thông thường mà quy trình đăng ký vẫn là tín hiệu triển khai chỉ tiến về phía trước: chúng có thể đẩy `Inbox`, `Backlog` hoặc `Ready` tiến lên `In progress`, nhưng không thể khiến `In review` lùi lại. Lệnh request review có thể đẩy bất kỳ trạng thái hoạt động (active) nào trước đó tiến lên `In review`. Lệnh request changes có thể đẩy trạng thái hoạt động trước đó tiến lên `In progress`; nó cũng có thể khiến trạng thái `In review` lùi lại, nhưng chỉ khi sự kiện trạng thái mới nhất của Project mục tiêu được ghi bởi thực thể thực thi (execution principal) vòng đời đã cấu hình. Nếu thực thể thực thi của sự kiện trạng thái mới nhất là người dùng thủ công hoặc không xác định, thì giữ nguyên trạng thái hiện tại.

Bộ xử lý chỉ phân giải các tham chiếu `Fixes`, `Closes` hoặc `Resolves` khớp chính xác trong cùng một repo. Nó không thay đổi trạng thái cuối (terminal state), không thêm Issue chưa có trạng thái Project vào Project, không phụ thuộc vào việc metadata PR có hợp lệ hay không, không truy vấn `reviewDecision`, không dựng lại vòng review, không tra ngược từ Issue sang PR, và không chạy bộ điều phối theo lịch (scheduled coordinator).

[Vòng đời Issue](../../../../.github/workflows/issue-lifecycle.yml) vẫn không đăng ký `pull_request.ready_for_review`; cả hai lệnh sự kiện đều không phụ thuộc vào hành động đó. [Chính sách Issue](../../../../.github/workflows/issue-policy.yml) vẫn giữ `ready_for_review`, vì khi PR do người nộp thủ công bước vào review, quy trình này chịu trách nhiệm thực thi các cổng kiểm tra bắt buộc.

## Xác minh

[Test quản lý Issue](../../../../.github/issue-management/policy.test.mjs) cố định ánh xạ sự kiện sang lệnh, chuyển trạng thái được kích hoạt khi request review lặp lại sau lệnh request changes, việc lùi trạng thái sau khi request changes, bảo vệ trạng thái cuối, và việc giữ lại trạng thái override thủ công. [Test workflow](../../../../scripts/ci-workflow.spec.ts) cố định các sự kiện đăng ký, điều kiện của job request changes, và trigger chính sách `ready_for_review` độc lập.

## Các phương án thay thế đã cân nhắc

**Suy ra trạng thái từ `reviewDecision` hoặc vòng review được dựng lại.** Trạng thái tổng hợp của GitHub vẫn có thể giữ nguyên `CHANGES_REQUESTED` sau khi request lại review, còn bộ reducer theo vòng sẽ đưa vào ngữ nghĩa reviewer và ngữ nghĩa thứ tự vượt quá phạm vi cần thiết của hai hành động bàn giao rõ ràng.

**Giữ lại phép chiếu chỉ tiến về phía trước.** Việc chỉ tiến đơn điệu bảo vệ được các trạng thái sau không bị lùi lại, nhưng khi tác giả đang sửa code theo yêu cầu, Issue sẽ mãi ở lại `In review`.

**Áp dụng vô điều kiện mọi lệnh review.** Đây là bộ xử lý sự kiện tinh gọn nhất, nhưng sẽ để tự động hóa ghi đè trạng thái Project do con người quản lý. Vì vậy, bộ xử lý bảo vệ chuyển đổi lùi duy nhất được cho phép thông qua thực thể thực thi của sự kiện trạng thái mới nhất trong Project mục tiêu.

**Khôi phục `ready_for_review` hoặc thêm hàng đợi chống dội (debounce).** Trạng thái Ready không biểu thị cho bất kỳ hình thức bàn giao nào trong hai kiểu review; thêm hàng đợi mới chỉ làm tăng độ trễ và trạng thái control-plane, không thay đổi bất kỳ lệnh nào.

## Hệ quả

Ngay cả khi GitHub vẫn báo cáo một review chặn từ trước đó, việc request lại review cũng sẽ đẩy Issue đang được giải quyết bởi PR hiện tại và đang được tự động quản lý tiến lên `In review`. Review yêu cầu chỉnh sửa tiếp theo sẽ đưa nó về lại `In progress`; approve, comment, hủy review, push và gỡ reviewer đều không thay đổi trạng thái do lệnh gần nhất thiết lập.

Phép chiếu vẫn được điều khiển bởi sự kiện; nếu một sự kiện chưa từng kích hoạt quy trình chạy, phép chiếu sẽ không tự sửa. Việc replay lại các lần chạy workflow cũ có thể thực thi lại lệnh cũ trong đó một lần nữa; ProjectV2 vẫn chưa cung cấp khả năng so sánh và hoán đổi nguyên tử (compare-and-swap) giữa việc đọc trạng thái mới nhất và thực hiện thay đổi. Kiểm soát đồng thời (concurrency control) của workflow ở mức từng PR và cơ chế bảo vệ quyền sở hữu trạng thái thủ công có thể giảm các race condition này, mà không cần đưa vào trạng thái vòng đời bền vững (persistent lifecycle state).
