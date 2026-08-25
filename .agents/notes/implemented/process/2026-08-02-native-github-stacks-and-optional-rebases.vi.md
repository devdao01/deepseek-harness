# Agent Note: Stack gốc của GitHub và rebase PR tùy chọn

Status: implemented

[English](2026-08-02-native-github-stacks-and-optional-rebases.md) | Tiếng Việt

## Vấn đề

Chuỗi PR (Pull Request) phụ thuộc nhau chỉ được biểu diễn bằng branch base thì không có định danh stack chính thức. Để đưa nó vào production, phải merge từng PR thủ công, giữ lại các branch trung gian, điều chỉnh base cho từng PR con, và xác minh lại xem chuỗi này có còn nguyên vẹn hay không. Tính năng PR stack gốc của GitHub thì mang theo thứ tự, áp dụng quy tắc trunk và CI cho từng lớp, và đảm nhiệm việc merge cùng điều chỉnh base từ dưới lên trên.

Việc cấm đổi lịch sử của branch đã review hoàn toàn cũng loại trừ luôn luồng công việc đồng bộ `gh stack` gốc: luồng này cập nhật từng lớp đang hoạt động bằng rebase theo tầng bậc (cascading rebase), và publish dưới sự bảo vệ của lease. Nếu chỉ áp dụng lệnh cấm này ngoài phạm vi stack, PR độc lập và PR trong stack sẽ phải theo các lựa chọn lịch sử không nhất quán.

## Quyết định

Mọi chuỗi từ hai PR phụ thuộc nhau trở lên trong cùng một repo, trước khi đưa vào production đều phải dùng đối tượng stack chính thức của GitHub. Trường `PullRequest.stack` và `stackEntry.position` thời gian thực là nguồn thẩm quyền. Với chuỗi chưa hình thành stack chính thức mà tất cả tác giả PR giống nhau, hệ thống dùng `gh stack link` để tự động liên kết theo thứ tự từ dưới lên trên; khi tác giả khác nhau hoặc thông tin tác giả không có sẵn, phải xin xác nhận của người dùng. Chuỗi thiếu hỗ trợ gốc hoặc bắc qua nhiều fork sẽ dừng cứng luồng công việc. Nếu thành viên hiện có thuộc về các stack xung đột nhau, hoặc thứ tự chính thức không khớp với topology branch, thì trước khi giải tán hay tái tạo bất kỳ stack nào đều phải xin chỉ thị của người dùng.

"Đưa stack vào production" thực hiện qua `gh stack merge <stack-number> --yes --merge` để merge toàn bộ stack chính thức. Đưa vào production một phần cần chỉ định rõ PR biên, và merge từ dưới lên đến PR đó. Luồng công việc không bao giờ quay lại việc chạy `gh pr merge` từng cái và điều chỉnh base thủ công. Merge trực tiếp gốc là tất cả-hoặc-không-gì; merge queue có thể gộp nhóm các PR đã chọn để xử lý, nên chỉ khi mỗi PR đã chọn riêng lẻ đạt trạng thái `MERGED` thì việc đưa vào production mới hoàn tất.

Cả merge-forward và rebase đều có thể dùng để làm mới lịch sử của PR độc lập lẫn PR trong stack chính thức, kể cả sau khi đã review. Khi đổi lịch sử ở remote, phải dùng lease chính xác hoặc đường dẫn push `gh stack` được lease bảo vệ; nếu remote đã thay đổi, thao tác phải dừng lại. Cấm dùng `--force` trực tiếp. [Quyết định cập nhật base gia tăng](2026-07-26-incremental-pr-base-retargeting.md) vẫn đảm nhiệm tùy chọn merge-forward.

Các kiểm tra liên quan thường chạy trước khi publish. `gh stack sync` là ngoại lệ rõ ràng, vì nó hoàn tất fetch, rebase theo tầng bậc và push trong một thao tác duy nhất: ngay sau đó phải xác minh từng lớp đã bị đổi; không được merge bất kỳ PR bị ảnh hưởng nào cho đến khi các xác minh này pass. Sau mỗi lần push đổi lịch sử, phải rà soát lại head hiện tại, các thread review chưa giải quyết, trạng thái approve, khả năng merge và kết quả kiểm tra, vì OID commit trước đó và anchor nội tuyến có thể đã lỗi thời.

## Xác minh

[Skill (kỹ năng) đưa stack vào production](../../../skills/dsh-merging-stacked-prs/SKILL.md) xác minh hỗ trợ gốc, branch cùng repo, thông tin tác giả thời gian thực, quan hệ thành viên và thứ tự chính thức, phạm vi merge, và trạng thái merge cuối cùng. [Hướng dẫn review stack](../../../../docs/cookbook/responding-to-pr-review-on-a-stack.md) giữ việc sửa lỗi ở đúng lớp đã gây ra vấn đề, và bao phủ hai chiến lược lịch sử để lan truyền bản sửa. [Luồng công việc trước khi push](../../../skills/dsh-pre-push-checks/SKILL.md) đảm nhiệm bảo vệ bằng lease và xác minh ngay sau khi đồng bộ để thu được bằng chứng.

## Các phương án đã cân nhắc

**Chỉ biểu diễn stack bằng chuỗi branch.** Cách này giữ quy trình thủ công, nhưng GitHub không có đối tượng stack nào để hiển thị thứ tự, áp dụng quy tắc trunk cho từng lớp, hoặc merge toàn bộ phạm vi bằng một thao tác nguyên tử.

**Dùng stack gốc, nhưng cấm dùng lệnh rebase của nó sau khi review.** Cách này giữ OID commit ổn định, nhưng cũng vô hiệu hóa đường dẫn đồng bộ chính thức khi stack đang được review, và khiến PR độc lập theo chính sách khác biệt.

**Yêu cầu mọi lần làm mới PR đều dùng rebase.** Lịch sử tuyến tính có giá trị, nhưng khi việc giữ lại điểm khôi phục và cách giải quyết xung đột đã hoàn tất quan trọng hơn lịch sử gọn gàng, checkpoint merge vẫn là lựa chọn hợp lệ.

**Tự động giải tán các stack xung đột nhau.** Cách này khiến suy luận branch cục bộ lấn át metadata GitHub dùng chung, và có thể can thiệp vào PR hoặc tác giả ngoài chuỗi được yêu cầu; các mục đã merge hoặc đang vào queue không chắc đều có thể gỡ bỏ.

## Hệ quả

- Người review và tự động hóa sẽ có được đồ thị stack, quy tắc bao phủ toàn stack, CI và trạng thái merge gốc của GitHub.
- Chuỗi cũ cùng một tác giả trở thành stack chính thức mà không cần hỏi thêm; chuỗi do nhiều tác giả sở hữu chung hoặc metadata xung đột vẫn giữ ranh giới quyết định thủ công.
- Sau khi review, rebase có thể khiến commit hash, trạng thái approve hoặc anchor bình luận không còn hiệu lực, nên sau mỗi lần push đổi lịch sử phải rà soát trạng thái review và kết quả kiểm tra thời gian thực.
- `gh stack sync` có thể tạm thời publish mã mà việc xác minh cục bộ vẫn đang chờ hoàn tất; PR bị ảnh hưởng vẫn bị cấm merge cho đến khi xác minh ngay sau đồng bộ pass.
- merge-forward vẫn khả dụng, và giữ lại checkpoint đã hoàn tất bằng cái giá là thêm merge commit.
