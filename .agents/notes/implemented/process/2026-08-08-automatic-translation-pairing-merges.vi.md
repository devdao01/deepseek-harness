# Agent Note: Tự động gộp bản ghi cặp đôi bản dịch

Status: implemented

[English](2026-08-08-automatic-translation-pairing-merges.md) | Tiếng Việt

## Vấn đề

Một bản ghi nhất quán song ngữ chứa hash blob chính xác của file Markdown ở cả hai phía. Do đó, khi hai branch cập nhật các phần khác nhau của cùng một cặp đã xác nhận, ngay cả khi Git có thể merge sạch cả hai file Markdown, hai dòng hash trong bản ghi vẫn sẽ xung đột. Chọn bất kỳ phía nào cũng sẽ để lại hash cũ; sinh lại bản ghi thủ công lại lặp lại một thao tác xác định, và cản trở việc merge vốn có thể tự động hoàn tất.

## Quyết định

`*.i18n.yaml` dùng driver merge `dsh-translation-pairing` do repo bảo trì. Script cài đặt Git cục bộ theo worktree đăng ký lệnh driver này cùng lúc thiết lập Lefthook; cấu hình Git vẫn giới hạn ở worktree hiện tại, vì attribute được track có thể chỉ định driver, nhưng không thể mang theo lệnh thực thi của nó.

Script cài đặt sẽ tải đúng điểm vào Node/tsx trước khi tích hợp worktree phát hành. Git sẽ gọi launcher shell đã commit trong repo, không phụ thuộc Node; launcher này lặp lại việc dò tìm này mỗi lần thực thi driver. Khi runtime hoặc điểm vào không khả dụng, ngay cả khi merge text hoàn tất sạch sẽ, launcher vẫn sẽ ghi kết quả merge text ba phía thông thường của Git vào file đồng hành và trả về trạng thái xung đột, khiến Git giữ nguyên giai đoạn index chưa merge, không bao giờ chấp nhận metadata chưa được xác thực.

Driver sẽ phân giải bản ghi tổ tiên, hiện tại và phía kia, và tải sáu blob Markdown mà hash trong đó trỏ tới. Nó chạy merge text ba phía mặc định của Git riêng cho ba blob của tài liệu tiếng Anh và ba blob của tài liệu tiếng Trung, yêu cầu cả hai lần merge đều hoàn tất sạch, xác thực dòng chuyển ngôn ngữ và chữ ký cấu trúc cặp đôi, lưu hai blob đã merge, rồi ghi hash của chúng vào bản ghi chuẩn. Quá trình này gộp lại các xác nhận đã tồn tại sẵn trong hai commit cha; nó không bao giờ ghi bản ghi cho các lần sửa tài liệu một phía thông thường.

Khi bản ghi sai định dạng, thiếu object, tài liệu cặp đôi dùng chiến lược merge khác (kể cả đường dẫn vốn không chỉ định riêng chiến lược nào và kế thừa `merge.default` phi text), tồn tại xung đột nội dung ở bất kỳ tài liệu cặp đôi nào, hoặc cặp đôi sau khi merge vi phạm kiểm tra cấu trúc, driver sẽ để file đồng hành giữ nguyên trạng thái xung đột chưa giải quyết thông thường. Trường hợp thêm mới, xóa và đổi tên vẫn cần xử lý thủ công, vì quan hệ đường dẫn của chúng không thể xử lý bằng thao tác dựa trên ba bản ghi nêu trên.

`pnpm run resolve-translation-pairing-conflicts` áp dụng cùng thuật toán sau khi merge đã dừng lại. Trước khi ghi bất kỳ file đồng hành nào, nó xác minh file đồng hành vẫn giữ kết quả xung đột do Git sinh ra chưa bị sửa đổi, và xác minh blob ID của tài liệu cặp đôi trong staging area cùng byte của file trong cây thư mục làm việc đều khớp với kết quả merge mà công cụ tự thực hiện độc lập. Ngay cả khi các cặp đôi khác vẫn cần xử lý thủ công, nó vẫn ghi và stage tất cả bản ghi có thể sinh an toàn thành một lô; sau đó báo cáo các xung đột cặp đôi còn lại và thoát với trạng thái khác không, đảm bảo bên gọi không nhầm lẫn việc chỉ giải quyết một phần với việc merge đã hoàn tất.

`pre-merge-commit` và `pre-commit` sẽ xác thực file `.i18n.yaml` đã stage đối chiếu với byte chính xác của tài liệu cả hai phía trong index. Các hook này xác thực output của driver, nhưng không sinh lại bản ghi, nên việc bỏ qua hook cũng không thể âm thầm xác nhận bản dịch bị trôi dạt; `doc-sync` (gate đồng bộ tài liệu) toàn ngữ liệu trên CI vẫn là kiểm tra thẩm quyền.

## Quy ước thất bại

| Thất bại trong `git merge` thông thường | Trạng thái quan sát được | Khôi phục |
|---|---|---|
| Cài đặt hoàn toàn mới không dò được driver hoặc không cài được Lefthook | Không phát hành driver mới hay cấu hình đường dẫn hook mới; mọi tích hợp mới thêm đều rollback về cách tra cứu hook cũ. | Khôi phục dependency và chạy lại `node scripts/install-lefthook.mjs`. |
| Sau khi cài đặt, Node, tsx hoặc điểm vào driver trở nên không khả dụng | Merge dừng lại, file đồng hành ở trạng thái `UU`; giai đoạn index 1/2/3 được giữ lại, file đồng hành trong worktree chứa kết quả text của Git, `MERGE_HEAD` tồn tại, không tạo commit. | Khôi phục dependency và chạy `pnpm run resolve-translation-pairing-conflicts`, hoặc chạy `git merge --abort`. |
| Driver hiểu rõ trạng thái repo từ chối bản ghi | Merge dừng lại, file đồng hành giữ nguyên trạng thái chưa giải quyết và không tạo commit; driver in ra đường dẫn để sửa tài liệu cặp đôi và chạy lệnh giải quyết xung đột tường minh. | Sửa xung đột hoặc bản ghi tài liệu cặp đôi, rồi chạy luồng công việc giải quyết xung đột được in ra, hoặc hủy merge. |
| Tiến trình driver crash với mã trạng thái lớn hơn 128 | Git hủy chiến lược merge, không ghi `MERGE_HEAD`, cũng không sinh giai đoạn index chưa merge. | Sửa runtime và thực hiện lại merge. |
| `pre-merge-commit` từ chối một lần merge file vốn có thể hoàn tất sạch | Không còn mục chưa merge, kết quả đầy đủ đã được stage và `MERGE_HEAD` tồn tại, nhưng không tạo commit merge. | Sửa lỗi hook và chạy `git commit`, hoặc chạy `git merge --abort`. |

Khi script cài đặt rollback thất bại, nó sẽ báo cáo đồng thời cả lỗi cài đặt ban đầu lẫn từng lỗi rollback. Lúc này cấu hình worktree có thể chỉ hoàn tất một phần, nên người đóng góp nên sửa hoặc kiểm tra cấu hình trước khi thực hiện merge, thay vì dựa vào việc fallback âm thầm.

## Xác minh

Test script bao phủ tổ hợp không xung đột bằng launcher đã cài đặt, và bao phủ fallback text khi runtime thiếu hoặc điểm vào hỏng, rollback dò tìm của script cài đặt, hook `pre-merge-commit` từ chối merge, khôi phục tường minh từ index chứa mục chưa giải quyết, cặp đôi được giải quyết an toàn cùng tồn tại với cặp đôi có xung đột tài liệu, file đồng hành bị chỉnh sửa, cấu hình merge mặc định phi text, phân giải bản ghi và cài đặt cục bộ theo worktree. Bộ xác thực toàn ngữ liệu sẵn có tiếp tục chứng minh bản ghi đã commit khớp với tài liệu cặp đôi ở cả hai phía.

## Các phương án đã cân nhắc

**Chọn ours hoặc dùng driver union của Git.** Bản ghi ở bất kỳ commit cha nào đều trỏ tới nội dung trước khi merge, còn union sẽ tạo ra khóa hash trùng lặp hoặc sai thứ tự. Cả hai đều không thể biểu diễn tài liệu cặp đôi sau khi merge.

**Sinh lại trong `post-merge` hoặc chỉ qua commit hook.** Merge xảy ra xung đột sẽ không chạy `post-merge`, và hook đó không thể thay đổi kết quả merge. Commit hook chỉ kích hoạt khi staging area không còn mục chưa giải quyết, nên chỉ dùng hook không thể xóa xung đột file sinh ra.

**Bọc mỗi lần merge bằng lệnh repo.** Lệnh bọc có thể giải quyết xung đột dựa trên index đã được merge điền vào, lệnh giải quyết xung đột tường minh vẫn giữ đường dẫn khôi phục này, nhưng khi chạy trực tiếp Git, công cụ stack, rebase và cherry-pick vẫn sẽ dừng lại trước đó. Driver merge mới là điểm mở rộng cấp file dùng chung cho các thao tác này.

**Giải quyết qua GitHub Actions hoặc ứng dụng.** Tự động hóa được host có thể cập nhật branch PR (Pull Request), nhưng sẽ đưa vào credential, kiểm soát đồng thời và sửa đổi branch. Luồng công việc merge-forward chạy cục bộ hoặc do agent (tác nhân) điều khiển đã có sẵn thư mục checkout và quyền push, nên repo không đưa tự động hóa từ xa vào cơ chế này.

## Hệ quả

Worktree đã hoàn tất cài đặt sẽ tự động loại bỏ xung đột chỉ do bản ghi cặp đôi gây ra, đồng thời xung đột tài liệu cặp đôi và đánh giá chất lượng bản dịch vẫn do con người xử lý. Việc tính toán khả năng merge do GitHub host thực hiện không chạy lệnh thực thi cục bộ theo worktree, nên vẫn cần người đóng góp hoặc agent merge branch base vào branch hiện tại và push commit kết quả, thì đánh dấu xung đột từ xa mới biến mất.

Script cài đặt sẽ dành sẵn `merge.dsh-translation-pairing.*` trong cấu hình worktree, và từ chối giá trị tùy chỉnh xung đột với nó. Giống như hook cho người đóng góp repo khác, việc tự động gộp phụ thuộc vào dependency Node đã cài đặt; khi runtime không khả dụng sẽ tạo ra kết quả text chưa giải quyết có thể quan sát được, chứ không chọn metadata cũ.
