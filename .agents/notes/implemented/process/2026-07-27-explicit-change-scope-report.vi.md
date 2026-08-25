# Agent Note: Báo cáo tường minh phạm vi thay đổi trong repo

Status: implemented

[English](2026-07-27-explicit-change-scope-report.md) | Tiếng Việt

## Vấn đề

[Workflow pre-push](../../../skills/dsh-pre-push-checks/SKILL.md) cần lấy diff so với baseline thực tế, nhưng việc dựng tham chiếu theo dạng `origin/<current-branch>` tồn tại hai vấn đề: với branch worktree mới đang theo dõi `origin/master` trước lần push đầu tiên, chưa có branch remote cùng tên, tham chiếu đó không thể resolve; với branch xếp chồng (stacked branch) mà PR (Pull Request) lấy một feature branch khác làm baseline, tham chiếu đó sẽ mô tả sai baseline. Workflow [code review](../../../skills/dsh-code-review/SKILL.md) và [audit tài liệu](../../../skills/dsh-doc-standards/SKILL.md) cũng cần xác định baseline hiện tại tương tự.

Phạm vi sai có thể bỏ sót đường dẫn bị ảnh hưởng, từ đó làm suy yếu việc chọn bằng chứng. Diff đã commit sinh ra từ phạm vi ba chấm cũng hoàn toàn không thể mô tả các lớp đã staged, chưa staged và chưa tracked vốn độc lập với nhau trong Git.

## Quyết định

Lệnh `change-scope` ở thư mục gốc yêu cầu truyền `--base <ref>`, chấp nhận `--head <ref>` tùy chọn (mặc định là `HEAD`), và ghi ra một báo cáo JSON có version. Lệnh sẽ phát hiện sự mơ hồ, resolve hai input thành commit, và yêu cầu chúng có đúng một merge base trước khi hiển thị báo cáo. Báo cáo ghi lại thư mục gốc của repo (không chuẩn hóa khoảng trắng hợp lệ trong đường dẫn), các tham chiếu input, baseline đã resolve, ID commit của head và merge base, cùng tập hợp đường dẫn đã sắp xếp của các file đã commit, đã staged, chưa staged và chưa tracked. Đường dẫn được tách trước theo byte NUL gốc; thư mục gốc của repo và mỗi đường dẫn đều được decode UTF-8 nghiêm ngặt. Khi gặp giá trị không hợp lệ, báo cáo sẽ dừng lại, không dùng ký tự thay thế cho byte không hợp lệ, cũng không gộp các giá trị khác nhau thành một mục.

Đường dẫn đã commit được suy ra từ so sánh giữa merge base và head đã resolve. Ngay cả khi `--head` chỉ định một commit khác, các tập hợp đường dẫn chưa commit theo từng loại vẫn luôn mô tả worktree và index hiện tại. Mỗi lần thăm dò Git đều tắt file system watcher đã cấu hình và tùy chọn khóa; cấu hình diff không được ẩn submodule, cũng không được gọi diff driver hoặc text conversion driver bên ngoài; hệ thống tắt phát hiện đổi tên (rename detection), nên đường dẫn trước và sau khi đổi tên đều được giữ lại trong kết quả.

Lệnh này không bao giờ đoán hoặc fetch baseline, không truy vấn provider hosting code, cũng không chọn test. Mỗi workflow gọi lệnh này đều tự xác thực trạng thái remote hoặc stack hiện tại, cung cấp baseline tường minh, và dùng báo cáo sự thật này làm input cho review ngữ nghĩa hoặc lựa chọn bằng chứng.

Test tập trung trên repo tạm bao phủ tham chiếu tường minh và tham chiếu xếp chồng, mọi lớp thay đổi chưa commit, đường dẫn hợp lệ có khoảng trắng, decode đường dẫn nghiêm ngặt, thăm dò không có side effect, tham chiếu không hợp lệ, schema xác định, và tính bất biến của tham chiếu, index, cấu hình và trạng thái trước sau khi báo cáo.

## Các phương án thay thế đã cân nhắc

**Tiếp tục dùng lệnh diff dựng tạm thời, kèm giải thích fallback bằng văn bản.** Cách này không cần thêm script vào repo, nhưng các workflow khác nhau vẫn xử lý không nhất quán với topology baseline worktree mới và stacked branch thường gặp, và không thể bao phủ các lớp thay đổi chưa commit.

**Suy ra baseline dựa trên upstream đã cấu hình.** Trước lần push đầu tiên, upstream có thể là `origin/master`; sau khi push, nó có thể là cùng một feature branch; cũng có thể là một head branch, mà PR của nó lấy một feature branch khác làm baseline. Không có cách suy luận nào áp dụng được cho mọi topology.

**Truy vấn GitHub trong lệnh để xác định baseline.** Cách này sẽ gắn báo cáo chỉ đọc cục bộ vào một nền tảng hosting code duy nhất và credential mạng, nhưng vẫn không thể resolve branch chưa có PR.

**Sinh test bắt buộc dựa trên đường dẫn thay đổi.** Đường dẫn thay đổi không thể tiết lộ hành vi được chạm tới qua cấu hình, tải động, subprocess, worker, artifact build hoặc provider. Workflow pre-push vẫn phải dùng phán đoán để chọn bằng chứng.

**Báo cáo branch hiện tại và upstream, đồng thời duy trì một renderer song song dễ đọc cho con người.** Bên gọi đã xác thực trạng thái branch và baseline trước khi gọi, không có bên tiêu thụ nào dùng các trường này, và văn bản định dạng chỉ lặp lại schema JSON, không cải thiện độ đầy đủ đường dẫn.

## Hệ quả

Input tường minh vẫn có thể chỉ định sai baseline, nhưng lỗi đó có thể nhìn thấy được: báo cáo sẽ hiển thị tham chiếu input và ba ID commit đã resolve. Bên gọi cần trả một chi phí nhỏ để xác thực baseline thời gian thực và fetch nó từ remote trước khi chạy lệnh này.

Schema string cố ý không biểu diễn được đường dẫn byte không phải UTF-8. Repo chứa loại đường dẫn này phải đổi tên các đường dẫn đó trước khi có thể sinh báo cáo, nhằm giữ phạm vi chính xác, thay vì trả về kết quả bị mất dữ liệu.

Repo cần duy trì một công cụ hỗ trợ về topology Git cùng test tập trung tương ứng. Nhờ đó, việc chọn bằng chứng pre-push, code review và audit tài liệu có thể dùng chung một mô tả chỉ đọc, xác định về thay đổi đã commit và thay đổi cục bộ, mà không phải trộn lẫn trách nhiệm của nền tảng hosting code hay chính sách.
