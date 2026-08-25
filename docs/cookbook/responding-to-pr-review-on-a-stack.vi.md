# Phản hồi ý kiến đánh giá trong một chuỗi PR xếp chồng

[English](responding-to-pr-review-on-a-stack.md) | Tiếng Việt

Ý kiến đánh giá có thể đồng thời nhắm tới nhiều PR (Pull Request) trong cùng một chuỗi phụ thuộc (`A ← B ← C …`). Hãy giữ chuỗi này được liên kết thông qua tính năng PR xếp chồng chính thức của GitHub. Hướng dẫn này phụ trách việc quy thuộc và lan truyền các bản sửa theo đánh giá; skill [dsh-merging-stacked-prs](../../.agents/skills/dsh-merging-stacked-prs/SKILL.md) phụ trách việc kiểm tra quan hệ liên kết và đưa thay đổi vào.

## Quy tắc cơ bản

1. **Mỗi nhánh PR một worktree.** Bản sửa của mỗi PR được thực hiện trong worktree của chính PR đó; các bản sửa song song tuyệt đối không dùng chung một checkout.
2. **Đối tượng stack của GitHub là căn cứ có thẩm quyền.** Nhánh base xác định thứ tự phụ thuộc kỳ vọng, còn `PullRequest.stack` và `stackEntry.position` chứng minh GitHub đã nhận diện chuỗi xếp chồng đó. Khi chưa kiểm tra những trường này, không được chỉ vì chuỗi nhánh khớp nhau mà coi đó là một stack chính thức.
3. **Bản sửa thuộc về PR đã tạo ra vấn đề, rồi lan lên trên theo chuỗi.** Khi bình luận trên PR `B` chỉ vào đoạn mã do `B` đưa vào, hãy sửa ở `B` rồi lan truyền thay đổi của `B` sang `C`, ngay cả khi `C` cũng chứa tệp đó. Khởi phát bản sửa ở phía hạ nguồn sẽ khiến `B` được giao kèm đoạn mã chưa sửa và che giấu bản sửa khỏi người đánh giá `B`.
4. **Mỗi bản sửa theo đánh giá đều giữ thành một commit riêng.** Các lần rebase sau đó có thể đổi OID của nó, nhưng không được dùng amend để xóa khỏi lịch sử nhánh một bản sửa đã được đánh giá. Chỉ phần việc của chính bạn mà chưa push và chưa được đánh giá mới được amend.
5. **Chọn merge-forward hay rebase một cách rõ ràng.** Sau khi đánh giá, cả hai cách cập nhật lịch sử này đều được phép. Việc push có viết lại lịch sử phải được bảo vệ bằng lease; nếu head trên remote đã tiến lên trong lúc đó, thao tác phải hủy bỏ chứ không được ghi đè. Cấm dùng trực tiếp `--force`.

## Giải quyết ý kiến đánh giá dọc theo chuỗi

1. Trước khi hành động, hãy xem xét từng bình luận theo đúng nội dung của nó: đối chiếu với mã nguồn để xác minh luận điểm — người đánh giá chỉ ra đúng triệu chứng nhưng vẫn có thể chẩn đoán sai nguyên nhân.
2. Ánh xạ mỗi phát hiện được chấp nhận tới PR đã tạo ra vấn đề đó và sửa tại đó.
3. Lan truyền lớp đã sửa lần lượt tới từng PR con bị ảnh hưởng:
   - **Merge-forward:** merge nhánh cha đã sửa vào nhánh con của nó, xác minh nhánh con, rồi tiếp tục lan lên theo chuỗi. Theo [quyết định về cập nhật base tăng dần](../../.agents/notes/implemented/process/2026-07-26-incremental-pr-base-retargeting.md), hãy giữ lại từng điểm kiểm tra đang được xử lý.
   - **Rebase phân tầng nguyên bản:** dùng `gh stack rebase`, xác minh tất cả các lớp đã viết lại, rồi phát hành bằng `gh stack push`; cũng có thể dùng `gh stack sync`, nhưng lệnh này có thể phát hành trước, nên phải xác minh ngay sau khi đồng bộ theo [dsh-pre-push-checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md).
4. Các bản sửa được ủy quyền cần tin nhưng phải kiểm chứng: báo cáo của subagent mô tả ý định, không nhất thiết là thứ thực sự được đưa vào. Hãy tự mình chạy lại các cổng kiểm tra trên cây mã thực tế; với các chốt chặn hồi quy, phải chứng minh nó **thất bại** trên mã chưa sửa (đưa hồi quy vào, quan sát nó đỏ, rồi hoàn tác) — một chốt chặn qua được cả hai trường hợp thì chẳng chặn được gì cả. Khi subagent định nghĩa lại vấn đề thành «đã xử lý», đó là tín hiệu cần tự mình đào sâu.
5. Trả lời trong luồng đánh giá (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`) thay vì đăng bình luận cấp cao nhất; nêu rõ nội dung bản sửa và commit hoặc head hiện đang mang bản sửa đó.
6. Sau mỗi lần push có viết lại lịch sử, hãy đọc lại các luồng chưa giải quyết, trạng thái phê duyệt, khả năng merge và kết quả kiểm tra. OID commit đã bị force-push viết lại hay neo nội dòng đã lỗi thời đều không đủ để chứng minh phát hiện đó hiện vẫn ở trạng thái đã giải quyết.
7. Chỉ được đưa thay đổi vào qua quy trình xếp chồng chính thức. Nếu các PR này chưa được liên kết, skill đưa thay đổi vào sẽ tự động liên kết chuỗi có cùng tác giả; nếu khác tác giả thì hỏi người dùng trước; nếu không có hỗ trợ xếp chồng nguyên bản thì dừng hẳn quy trình.

## Xác minh

- Diff hiện tại của mỗi PR đã sửa đều chứa phần chỉnh sửa kỳ vọng ở đúng lớp đã tạo ra vấn đề.
- GraphQL báo cáo chỉ có một stack chính thức và thứ tự đúng như kỳ vọng; diff của mỗi PR con so với PR cha chỉ hiển thị thay đổi của riêng PR con đó.
- Sau mỗi lần push có viết lại lịch sử, các luồng chưa giải quyết, trạng thái phê duyệt, khả năng merge và kết quả kiểm tra đều đã được rà soát lại.
- Các cổng kiểm tra liên quan đều qua trên mọi PR bị ảnh hưởng trong chuỗi, chứ không chỉ ở PR trên cùng.
