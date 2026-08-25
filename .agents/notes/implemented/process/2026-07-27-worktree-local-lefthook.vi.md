# Agent Note: Giới hạn cài đặt Lefthook theo từng worktree

Status: implemented

[English](2026-07-27-worktree-local-lefthook.md) | Tiếng Việt

## Vấn đề

Mỗi lần chạy `pnpm install` đều thực thi [`postinstall`](../../../../package.json) ở gốc, trong đó [`install-lefthook.mjs`](../../../../scripts/install-lefthook.mjs) gọi `lefthook install --force`. Nếu không có cấu hình bổ sung, các Git worktree liên kết dùng chung thư mục hook mặc định của cùng một repo, nên cài đặt trong một worktree có thể ghi đè lên hook đang được các worktree khác sử dụng.

Hook được Lefthook sinh ra sẽ ưu tiên dùng đường dẫn tuyệt đối của file nhị phân được ghi lại tại thời điểm cài đặt từ worktree tương ứng, sau đó mới thử đường dẫn fallback của worktree hiện tại. Do đó, hook dùng chung sẽ luôn chạy phiên bản binary cố định của một worktree khác, cho tới khi worktree đó biến mất; việc cài đặt đồng thời còn có thể ghi vào cùng một tập file.

## Quyết định

Việc cài đặt hook được giới hạn theo phạm vi worktree. Khi `CI=true` hoặc `GITHUB_ACTIONS=true`, chương trình cài đặt sẽ return trước khi thăm dò Git hoặc thực hiện bất kỳ thay đổi nào, vì automation không dùng hook của contributor. Nếu không, chương trình cài đặt yêu cầu Git 2.26 trở lên, để `git config --show-scope` có thể báo cáo giá trị cấu hình đến từ phạm vi nào; nó sẽ nâng cấp repo có format version 0 lên format version 1, bật `extensions.worktreeConfig`, và đặt `core.hooksPath` của worktree hiện tại trỏ tới đường dẫn tuyệt đối `$GIT_DIR/dsh-hooks`.

Trước khi nâng cấp format 0, chương trình cài đặt sẽ từ chối các `extensions.*` được đặt trực tiếp trong cấu hình dùng chung; nó cũng từ chối `core.worktree` hoặc `core.bare=true` được đặt trực tiếp, cũng như cấu hình worktree đang ngủ (dormant) không rỗng sẽ được kích hoạt sau khi bật extension. Việc migrate sẽ loại bỏ `core.bare=false` được đặt trực tiếp, vì false là giá trị mặc định của Git. Cấu hình repo dùng chung và mỗi `config.worktree` đã có đều phải là file thông thường. Các kiểm tra này tắt việc mở rộng include, vì bộ phân giải format repo của Git cũng bỏ qua đích của include. Một lock cấp repo sẽ tuần tự hóa việc migrate và ghi hook; khi giải phóng, process ID của lock, token ngẫu nhiên, danh tính file và toàn bộ nội dung đều phải vẫn khớp. Lock mà process sở hữu đã kết thúc hoặc nội dung không hợp lệ phải được con người can thiệp khôi phục, chứ không được tự động ép giải phóng.

Mỗi thư mục hook đều có một nhãn sở hữu (ownership marker) dạng JSON, chứa đường dẫn tuyệt đối của lần ghi cấu hình worktree gần nhất. Sau khi thư mục checkout di chuyển, nhãn đó chỉ cho phép thay thế đúng giá trị cũ sở hữu chính xác. Git sẽ khởi tạo `config.worktree` cho worktree liên kết mới bằng cấu hình của worktree chính; khi cấu hình khởi tạo đó chứa một đường dẫn hook được giữ lại của một worktree đã đăng ký, có bằng chứng từ nhãn sở hữu, chương trình cài đặt chỉ thay thế nó bằng đường dẫn riêng của worktree mới trong cấu hình của worktree mới. Trước khi Lefthook chạy, nhãn sở hữu và mỗi hook đã sinh trước đó đều phải là file thông thường không có alias. Chương trình cài đặt sẽ resolve phạm vi hiệu lực, nguồn và giá trị của `core.hooksPath`, bao gồm cả giá trị được tải qua include của `config.worktree` đang có hiệu lực hiện tại; nó sẽ từ chối đường dẫn ở phạm vi command, đường dẫn phạm vi worktree không thuộc sở hữu, và thư mục được giữ lại không thuộc sở hữu. Đường dẫn kế thừa từ cấu hình system, global hoặc repo dùng chung phải đặt `DSH_LEFTHOOK_ALLOW_HOOKS_PATH_OVERRIDE=1`, từ đó chỉ cho phép worktree hiện tại bật Lefthook một cách tường minh. Đích `includeIf` chưa có hiệu lực sẽ không được kiểm tra đệ quy, vì chúng không ảnh hưởng tới cấu hình hiện tại. Sau khi xác thực xong, môi trường của subprocess Lefthook sẽ loại bỏ cấu hình Git ở phạm vi command.

Nếu Lefthook thất bại sau khi đã thay đổi `core.hooksPath`, chương trình cài đặt sẽ khôi phục giá trị worktree trước đó; nếu rollback thất bại, lỗi này sẽ được báo cáo cùng lỗi cài đặt. File hiện có trong `$GIT_COMMON_DIR/hooks` không bao giờ bị xóa hay ghi đè. Test có mục tiêu cụ thể cho chương trình cài đặt khóa chặt các hành vi sau: cô lập, xử lý cấu hình worktree mới được sao chép sang, từ chối migrate, sở hữu và việc di chuyển thư mục checkout, cài đặt đồng thời, đường dẫn tùy chỉnh và rollback.

## Các phương án thay thế đã cân nhắc

**Giữ hook được sinh dùng chung, và dựa vào đường dẫn fallback của worktree hiện tại.** Chừng nào worktree tương ứng còn tồn tại, đường dẫn tuyệt đối được ghi lại vẫn được ưu tiên, nên đường dẫn fallback không thể cung cấp sự cô lập phiên bản hay vòng đời.

**Cho mỗi worktree trỏ tới cùng một thư mục `.githooks` được đưa vào version control.** Dùng thư mục tương đối được version control có thể loại bỏ đường dẫn tuyệt đối được sinh ra, nhưng thay đổi `core.hooksPath` dùng chung có thể vô hiệu hóa hook trong worktree cũ, vì branch của nó không chứa thư mục đó; đồng thời, mỗi worktree vẫn bị gắn chặt với cùng một giá trị cấu hình dùng chung.

**Xây dựng một lớp chuỗi (chain) quản lý hook tổng quát.** Thứ tự thực thi, chuyển tiếp tham số, ngữ nghĩa lỗi và nâng cấp đều sẽ trở thành hành vi mà repo tự chịu trách nhiệm, nhưng lại không liên quan gì tới việc cô lập Lefthook. Do đó, chương trình cài đặt từ chối đường dẫn tùy chỉnh riêng cho worktree, chỉ đặt việc override đường dẫn kế thừa phạm vi rộng hơn thành một thao tác tường minh.

**Đưa đường dẫn include credential của một CI provider cụ thể vào whitelist.** CI không dùng hook của contributor, nên việc miễn trừ đường dẫn sẽ gắn chặt bảo mật của chương trình cài đặt với chi tiết implementation nội bộ của quy trình checkout CI provider đó, đồng thời làm suy yếu việc xác thực nghiêm ngặt khi contributor cài đặt. Bỏ qua thao tác trực tiếp trong CI, không cần bất kỳ miễn trừ nào, đã đủ tránh thay đổi repo.

**Ngừng tự động cài đặt hook.** Cài đặt thủ công có thể tránh việc ghi dùng chung, nhưng sẽ khiến các kiểm tra commit và push chi phí thấp trong repo vô tình trở thành tùy chọn, đặc biệt dễ ảnh hưởng tới worktree tồn tại ngắn hạn do agent (intelligent agent) sử dụng.

## Hệ quả

Cài đặt hoặc gỡ bất kỳ worktree nào không còn làm thay đổi hook có hiệu lực, đường dẫn binary, hoặc byte hook được sinh ra của các worktree khác. Cài đặt đồng thời sẽ chạy tuần tự, cài đặt lặp lại vẫn giữ tính idempotent; ranh giới task và độ trễ được quy định bởi [Git hook cục bộ nhanh](2026-07-22-fast-local-git-hooks.md) vẫn giữ nguyên.

Sau lần cài đặt đầu tiên, repo sẽ dùng Git format version 1. Chương trình cài đặt cần Git 2.26 để dùng `--show-scope`; extension cấu hình worktree tự nó xuất hiện sớm hơn lệnh này. Bộ quản lý hook worktree tùy chỉnh cần chọn cách tích hợp một cách rõ ràng; đường dẫn hook kế thừa vẫn có thể dùng cho worktree khác, nhưng sau khi worktree hiện tại bật Lefthook một cách tường minh, các hook kế thừa đó sẽ không chạy, trừ khi contributor nối chuỗi (chain) chúng lại qua `lefthook.yml`.

Hook dùng chung cũ sẽ vẫn còn trên đĩa cho các worktree chưa nâng cấp. Chúng có thể dần trở nên lỗi thời, nhưng việc tự động xóa các hook này sẽ phá vỡ các worktree đã đăng ký nhưng branch của chúng vẫn chưa áp dụng chương trình cài đặt này.
