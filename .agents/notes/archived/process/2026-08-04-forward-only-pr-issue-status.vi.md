# Agent Note: Trạng thái từ PR sang Issue chỉ chiếu về phía trước

Status: implemented

Archived: 2026-08-10

[English](2026-08-04-forward-only-pr-issue-status.md) | 中文

## Vấn đề

Trạng thái Issue Project biểu thị giai đoạn công việc đang ở đâu, còn tham chiếu từ khóa giải quyết (resolving keyword) khớp chính xác trong cùng repo thiết lập quan hệ PR (Pull Request) tới Issue mang tính thẩm quyền. Nếu chỉ cho phép Issue đã ở trạng thái `Ready` mới được tiến vòng đời, thì ngay cả khi việc hiện thực đã rõ ràng bắt đầu, Issue đang ở `Inbox` hoặc `Backlog` vẫn sẽ dừng lại ở trạng thái cũ. Chỉ chiếu giai đoạn công việc khi metadata PR hợp lệ về mọi mặt khác cũng sẽ trộn lẫn việc tuân thủ chính sách với trạng thái công việc có thể quan sát được.

## Quyết định

Sự kiện PR và sự kiện review PR sẽ chiếu giai đoạn PR hiện tại lên mỗi Issue được tham chiếu chính xác bằng từ khóa giải quyết trong cùng repo. PR nháp (draft), hoặc PR không nháp mà chưa có yêu cầu review lẫn review đã submit, có trạng thái đích là `In progress`. PR không nháp có bất kỳ hoạt động review nào thuộc hai loại trên, có trạng thái đích là `In review`.

Các trạng thái hoạt động theo thứ tự lần lượt là `Inbox`, `Backlog`, `Ready`, `In progress` và `In review`. Việc chiếu chỉ ghi khi trạng thái đích đứng sau trạng thái hiện tại trong thứ tự này. Việc chiếu không đưa trạng thái Issue lùi lại, không sửa `Done` hay `No action`, và không thêm Issue chưa có trạng thái Project vào Project. Đường đi vòng đời độc lập với việc kiểm chứng metadata PR; kiểm tra chính sách PR bắt buộc được thực hiện riêng vẫn tiếp tục ép buộc tính nhất quán của label, tham chiếu và độ ưu tiên.

Việc chiếu này cố ý giữ một chiều. Nó không tra ngược từ Issue để tìm PR liên quan, cũng không thêm tác vụ đối soát định kỳ. Sự kiện PR là nguồn thúc đẩy vòng đời tiến lên. Test quản lý Issue kiểm chứng quyết định chuyển trạng thái được hiện thực dưới dạng hàm thuần túy, và test này chạy trong các gate `check-all`, `ci-primary` và `ci-static`.

## Kiểm chứng

`.github/issue-management/policy.test.mjs` bao phủ việc tiến lên từ mọi trạng thái hoạt động trước đó, phân biệt trạng thái nháp và trạng thái review, độc lập với chính sách metadata, và ngăn trạng thái lùi lại hoặc sửa trạng thái cuối. `scripts/run-gates.ts` chịu trách nhiệm thực thi test chính sách chuyên biệt này trong cả chế độ gate local cấp cao nhất lẫn chế độ gate CI.

## Các phương án thay thế đã cân nhắc

**Chỉ cho phép tiến lên từ trạng thái `Ready`.** Phương án này giữ được điều kiện tiên quyết thủ công, nhưng khi PR giải quyết đã chứng minh việc hiện thực đã bắt đầu, các mục ở `Inbox` và `Backlog` vẫn sẽ ở trạng thái cũ đã lỗi thời.

**Thêm đối soát hai chiều hoặc định kỳ.** Tra ngược PR từ sự kiện Issue, hoặc quét Project định kỳ, có thể sửa được nhiều trạng thái tồn đọng từ lịch sử hơn; nhưng điều này sẽ thêm một đường cập nhật trạng thái mang tính thẩm quyền theo chiều ngược lại, và tăng khối lượng công việc API định kỳ, vượt ra ngoài phạm vi vòng đời do PR thúc đẩy cần thiết.

**Lấy metadata PR đầy đủ làm điều kiện tiên quyết cho việc chiếu.** Label, tham chiếu và độ ưu tiên vẫn phải được ép buộc, nhưng lỗi metadata không phủ nhận được việc công việc thực tế đang ở giai đoạn hiện thực hoặc review.

**Đưa trạng thái lùi lại khi PR chuyển thành nháp hoặc mất reviewer.** Điều này sẽ khiến trạng thái PR tạm thời ghi đè lên giai đoạn công việc sau hơn đã được quan sát, và cũng làm phức tạp thêm quyền sở hữu trạng thái. Do đó, việc chiếu được giữ đơn điệu (monotonic).

## Hệ quả

- Sự kiện PR sẽ tự động sửa lại Issue được PR đó giải quyết nhưng vẫn còn ở `Inbox`, `Backlog` hoặc `Ready`.
- Nếu Issue được tạo sau sự kiện PR liên quan cuối cùng, phải chờ sự kiện PR tiếp theo hoặc cập nhật trạng thái thủ công, vì hệ thống không tra ngược hay quét định kỳ.
- Dù có hoạt động review trong lịch sử, PR nháp vẫn giữ `In progress`; chỉ PR không nháp mới có trạng thái đích là `In review`.
- Trạng thái cuối cùng cũng như trạng thái hoạt động đứng sau hơn trong thứ tự sẽ không bị lùi lại.
- Kiểm tra chính sách bắt buộc vẫn phát hiện lỗi metadata PR, mà không vì thế cản trở việc chiếu vòng đời.
