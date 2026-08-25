# Bảo trì skill dsh-code-review

[English](maintaining-dsh-code-review.md) | Tiếng Việt

Skill [`dsh-code-review`](../../.agents/skills/dsh-code-review/SKILL.md) được một người vận hành được chỉ định cập nhật liên tục thông qua một công cụ bảo trì định kỳ riêng tư. Cẩm nang thực hành này vừa là điểm khởi đầu cho người vận hành đó và người kế nhiệm, vừa giúp người đóng góp cho repo hiểu vì sao các bản cập nhật skill lại xuất hiện dưới dạng những PR (Pull Request) định kỳ nhỏ thay vì một đợt audit một lần. Bản thân workflow được quy định trong [Agent Note về bảo trì skill đánh giá thủ công](../../.agents/notes/proposed/process/2026-07-13-human-review-skill-maintenance.md).

## Người bảo trì nhận được gì

Người vận hành gọi script bao bọc thủ công mỗi ngày, dùng cửa sổ chồng lấn 2 ngày UTC; lần chạy khôi phục thủ công hằng tuần dùng cửa sổ 7 ngày. Workflow sẽ:

1. Chọn các PR đã merge trong cửa sổ chỉ định và có merge commit tiếp cận được từ `origin/master` (lần chạy hằng ngày mặc định chọn 2 ngày UTC, lần chạy hằng tuần chọn 7 ngày). Những PR có merge commit không tiếp cận được (ví dụ nhánh xếp chồng có nhánh cha đã bị squash), hoặc vượt giới hạn lấy về 250 commit, sẽ được ghi vào `skipped-pulls.json` và bị bỏ qua chứ không làm gián đoạn lần chạy.
2. Thu thập phản hồi đánh giá thủ công trước khi merge kèm neo commit (bình luận nội dòng và các lượt gửi đánh giá), rồi so sánh patch của PR tại thời điểm phản hồi với patch cuối cùng được đưa vào. Nó không lấy các bình luận hội thoại của PR, vì trạng thái hiện tại của GitHub không thể cung cấp cho những bình luận đó một mốc so sánh tại thời điểm phản hồi có khả năng chống force-push; nó cũng không coi những thay đổi chỉ tồn tại trên nhánh đích là bằng chứng đã tiếp thu.
3. Hai adapter đánh giá được cấu hình độc lập trước tiên phân loại tác giả của từng mục và liệu thay đổi có tiếp thu mục đó hay không, sau đó phân loại các mục mà cả hai bên đều nhất trí là đã tiếp thu, dựa trên skill hiện hành.
4. Adapter chính soạn thảo bản `SKILL.md` sửa đổi hoàn chỉnh; hai adapter cùng đánh giá một diff; chừng nào vẫn còn vấn đề mang tính chặn thì vòng lặp còn tiếp tục, cho tới khi cả hai bên phê duyệt.
5. Trước khi công cụ tuyên bố thành công, nó chạy `pnpm run doc-sync` và `pnpm run lint` trên phiên bản ứng viên.

Mỗi lần chạy đều lưu sản phẩm trên máy của người vận hành. Các diff đã lưu, bản `SKILL.md` ứng viên và manifest (bản kê metadata) nâng cấp được đặt tên theo dấu thời gian và nằm trong `~/dsh-code-review-outputs/`. Manifest ghi lại master commit nguồn cùng blob của skill, ID và URL của phản hồi nguồn, phạm vi bằng chứng đã được đưa vào, phán quyết của các adapter và kết quả các cổng kiểm tra; I/O thô của từng adapter nằm lại trong một thư mục tạm riêng tư, đường dẫn thư mục đó được ghi vào thông báo và vào nhật ký hằng ngày trong `~/Library/Logs/dsh-code-review-maintainer/`. Worktree bảo trì được khôi phục về trạng thái sạch sau mỗi lần chạy, tránh việc người vận hành chỉnh sửa trực tiếp trong bản sao bảo trì.

## Người vận hành xử lý diff ứng viên như thế nào

Khi một lần chạy tạo ra phiên bản ứng viên, macOS sẽ phát một thông báo kèm gợi ý `dsh-code-review-promote <timestamp>`.

1. **Hãy phán đoán dựa trên chính bản diff.** Đừng chấp nhận chỉ vì «người đánh giá đã phê duyệt»; thỏa thuận bảo trì quy định người vận hành là bên ra quyết định cuối cùng. Kiểm tra xem danh sách kiểm tra có phình ra không, có kể lể lịch sử không, có ngoại suy thiếu căn cứ từ một sự việc đơn lẻ không, và có trùng lặp với skill hiện có hay tài liệu có thẩm quyền không.

   ```sh
   ls ~/dsh-code-review-outputs/                         # every candidate ever produced
   less ~/dsh-code-review-outputs/2026-07-16T02-00-00Z.diff
   less ~/dsh-code-review-outputs/2026-07-16T02-00-00Z.SKILL.md
   less ~/dsh-code-review-outputs/2026-07-16T02-00-00Z.manifest.json
   ```

2. **Đối chiếu chéo với sản phẩm của lần chạy.** Manifest nâng cấp ánh xạ từng quy tắc được đề xuất tới phản hồi nguồn và bằng chứng đã được đưa vào; I/O chi tiết của từng adapter, sự đồng thuận và bằng chứng tiếp thu nằm trong thư mục tạm riêng tư của lần chạy đó (đường dẫn xem trong nhật ký). Hãy kiểm tra ngẫu nhiên ít nhất một mục ứng viên: bình luận thủ công được liên kết có thực sự ủng hộ quy tắc mới không? PR được liên kết có thực sự tiếp thu nó không?

3. **Chọn một trong ba cách xử lý:**
   - **Bỏ đi.** Xóa phiên bản ứng viên đã lưu. Lần chạy kế tiếp sẽ xem xét lại chính phản hồi đó dựa trên skill hiện hành tại thời điểm ấy.

     ```sh
     rm ~/dsh-code-review-outputs/2026-07-16T02-00-00Z.{diff,SKILL.md,manifest.json}
     ```
   - **Giữ lại để xử lý theo lô.** Nếu bản cập nhật nhỏ, có thể giữ phiên bản ứng viên để gộp với các phiên bản sau. Việc kiểm tra skill nguồn vẫn áp dụng; nếu `master` thay đổi trước, hãy chạy lại phần phân tích, hoặc rebase thủ công rồi đánh giá lại diff.
   - **Nâng cấp.** Chạy công cụ hỗ trợ nâng cấp trong một checkout `master` sạch của repo. Nó sẽ làm mới `master`, xác minh skill hiện hành khớp với blob nguồn đã ghi lại, áp dụng diff đã lưu, và tạo một PR nháp mà phần nội dung liệt kê URL hoặc ID của phản hồi gốc, phạm vi commit đã được đưa vào, lần chạy đã khởi phát thay đổi này, các bước kiểm tra và những chỉnh sửa của người vận hành. Nếu skill đã trôi lệch, nó sẽ dừng lại thay vì ghi đè lên hướng dẫn đã được cập nhật; người vận hành vẫn phải đánh giá PR trên GitHub và chọn merge hay đóng.

     ```sh
     cd ~/path/to/deepseek-harness   # clean master
     dsh-code-review-promote 2026-07-16T02-00-00Z
     ```

4. **Đừng commit nguyên văn đầu ra của adapter.** Trong quá trình nâng cấp có thể chỉnh sửa nhỏ, chẳng hạn siết chặt cách diễn đạt, loại bỏ ví dụ chỉ có ý nghĩa khi kèm ngữ cảnh PR nguồn, gộp một quy tắc vào quy tắc hiện có. Những chỉnh sửa này là hành vi được kỳ vọng, và cũng giữ lại «phán đoán của người đánh giá» mà workflow dựa vào. Nên sửa đổi những thay đổi này trên nhánh đó trước khi merge.

## Khi một lần chạy không tạo ra phiên bản ứng viên

Miễn là mỗi giai đoạn phân loại không rỗng đều tạo ra ít nhất một kết quả adapter hợp lệ, thì đây là tình huống thường gặp. Công cụ ghi «không có phiên bản ứng viên» vào nhật ký hằng ngày, không gửi thông báo (để tránh mệt mỏi vì nhắc nhở), rồi tiếp tục. Một ngày không có bản cập nhật skill nghĩa là workflow đang chạy bình thường, chứ không phải đình trệ.

## Gián đoạn và bàn giao

Cơ chế này chạy trên một máy duy nhất. Người vận hành nên sẵn sàng xử lý các gián đoạn sau:

- **Bỏ lỡ lần chạy hằng ngày.** Cửa sổ chồng lấn 2 ngày tự động bù cho một lần chạy bị bỏ sót; khoảng cách dài hơn có thể khôi phục bằng cách chạy script bao bọc thủ công với `DSH_CODE_REVIEW_SINCE=<Nd>`. Cửa sổ chồng lấn có tính lũy đẳng: hướng dẫn mà skill hiện hành đã bao gồm sẽ được xếp loại `covered` và không trở thành ứng viên lần nữa.
- **Nhà cung cấp adapter gián đoạn.** Khi hai lệnh đánh giá phân giải về cùng một tệp thực thi giống nhau từng byte, công cụ sẽ từ chối chạy. Khi phản hồi adapter của một lô không qua được kiểm tra schema hoặc ID, cả lô đó fail-closed (mỗi mục trong lô được đánh dấu là không rõ ràng) và lần chạy vẫn tiếp tục; đầu ra thô được giữ lại để gỡ lỗi. Nếu bất kỳ adapter nào không tạo ra kết quả hợp lệ trong tất cả các lô không rỗng của một thao tác, lần chạy sẽ thất bại, ghi lại bản ghi thất bại và thông báo cho người vận hành; nó tuyệt đối không gộp việc nhà cung cấp gián đoạn hoàn toàn thành «không có phiên bản ứng viên».
- **Bàn giao cho người bảo trì khác.** Hãy tạo một Agent Note kế nhiệm thay thế bản ghi hiện hành: hoặc đưa cơ chế vào trong repo, hoặc ghi lại thiết lập riêng tư của người vận hành mới. Đừng lặng lẽ chuyển giao công cụ; phần rủi ro của Agent Note đã nêu «rủi ro phụ thuộc một người bảo trì duy nhất» là lý do việc bàn giao bắt buộc phải ghi lại quyết định.

## Thiết lập riêng tư của người vận hành nằm ở đâu

Mã nguồn công cụ, các adapter đánh giá, thông tin xác thực của nhà cung cấp và bộ lập lịch thuộc hạ tầng riêng tư của người vận hành, và theo thiết kế nằm ngoài repo này (xem phần «cơ chế nằm ở đâu» của Agent Note). Cẩm nang thực hành này và Agent Note mô tả **workflow bảo đảm điều gì**; những bảo đảm đó được hiện thực hóa **như thế nào** là vấn đề của hạ tầng riêng tư. Nếu bạn là người vận hành mới, hãy lấy các mục `## Proposal` của Agent Note làm căn cứ triển khai.
