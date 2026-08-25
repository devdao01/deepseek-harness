# Agent Note: Đi theo file chỉ dẫn được trỏ bởi symbolic link

Status: implemented

[English](2026-07-21-follow-instruction-symlinks.md) | Tiếng Việt

## Vấn đề

[Plugin agent-instructions](2026-06-24-workspace-context.md) dùng `ctx.fs.lstat` để dò từng ứng viên chỉ dẫn trước khi phân giải, từ chối mọi symbolic link ở đoạn cuối, khiến các link do chính repo sở hữu không thể trỏ việc nạp chỉ dẫn tới nội dung nằm ngoài workspace. Bất biến «không đi theo» này chặn mất một cấu hình cố ý và được hỗ trợ: nếu người dùng tạo symbolic link từ `$DSH_HOME/AGENTS.md` (hoặc `AGENTS.md` của một dự án) tới một file chỉ dẫn chuẩn tắc lưu ở nơi khác, để dùng chung cùng một file chuẩn tắc giữa nhiều công cụ và nhiều home, thì họ sẽ thấy link đó bị bỏ qua một cách âm thầm. Nó cũng buộc việc khử trùng lặp theo nội dung phải coi bản sao gương `CLAUDE.md → AGENTS.md` phổ biến khắp nơi là một trường hợp đặc biệt bị bỏ qua, thay vì là một file trùng lặp bình thường. Chủ sở hữu repo yêu cầu đi theo file chỉ dẫn được trỏ bởi symbolic link một cách vô điều kiện ở mọi scope, và chấp nhận rủi ro ranh giới tin cậy còn lại được ghi lại dưới đây.

## Quyết định

Việc tìm chỉ dẫn không còn dùng `lstat` để kiểm tra đoạn cuối. Mọi ứng viên (`$DSH_HOME/AGENTS.md` toàn cục của người dùng, từng ứng viên cơ sở, và từng ứng viên lớp phủ cục bộ) đều được phân giải rồi stat trên đích đã phân giải, đối xử như nhau khi tổ hợp baseline và khi hoà giải ở mỗi vòng `tools/post-execute`. Một symbolic link có đích là file thông thường sẽ nạp nội dung của đích đó; một đích đã phân giải mà không phải file (bao gồm link trỏ tới thư mục) là trường hợp thiếu đã được xác nhận, và sẽ gỡ scope đó đi giống như file thiếu; một ngoại lệ `resolve` hoặc `stat` được xếp vào loại tạm thời không khả dụng, và không bao giờ gỡ một scope đã nạp. `nodeStatFile` gọi `stat` (đường dẫn host), `fsStatFile` thì `resolve` trước rồi mới `stat` (đường dẫn provider); cả hai đều không gọi `lstat`.

Một symbolic link được đi theo là một file thông thường đối với mọi bước phía sau. Nó tham gia khử trùng lặp theo nội dung ở phạm vi từng thư mục ([ghi chú nạp toàn bộ và khử trùng lặp](2026-07-21-instruction-load-all-dedup.md)), nên một `CLAUDE.md` là symbolic link trỏ tới `AGENTS.md` cùng cấp giờ sẽ phân giải ra cùng nội dung và được gộp lại như bất kỳ bản sao thật nào giống hệt từng byte, chứ không còn bị bỏ qua như một trường hợp đặc biệt.

### Ranh giới tin cậy và rủi ro còn lại

Đi theo các link do chính repo sở hữu là vượt qua ranh giới tin cậy của plugin: một repo được clone về và không đáng tin có thể mang theo một `AGENTS.md` mà đích symbolic link của nó là file bất kỳ mà tiến trình này đọc được, qua đó phơi bày nội dung ngoài cây thư mục thành hướng dẫn cho workspace. Nội dung đó chỉ đi vào dưới dạng một tiền tố vai trò user có thẩm quyền thấp, được đóng khung theo kiểu system-reminder; nó không bao giờ ghi đè chỉ dẫn system, developer hay chỉ dẫn trực tiếp của người dùng, và được xem là dữ liệu chứ không phải căn cứ có thẩm quyền. Ranh giới có tác dụng giảm thiểu nằm ở tầng file system, không phải ở plugin này: khi triển khai có nạp các repo không đáng tin, hãy ràng buộc `ctx.fs` bằng cơ chế bảo vệ `dsh-fs-observation-policy` hoặc bằng một sandbox của hệ điều hành ([fs sandbox xuyên họ nền tảng](2026-07-14-cross-family-fs-sandbox.md)). Đây là một đánh đổi rõ ràng, được chủ sở hữu chấp nhận, chứ không phải sơ suất.

## Phương án thay thế

**Giữ bất biến «không đi theo» của `lstat`.** Bị chủ sở hữu repo bác bỏ: nó chặn mất cấu hình «symbolic link tới file chuẩn tắc» vốn được hỗ trợ, và buộc tình huống bản sao gương bằng symbolic link trở thành một trường hợp đặc biệt bị bỏ qua thay vì một bản trùng lặp bình thường. Ranh giới quyền đọc mà nó xấp xỉ thuộc về tầng chính sách file system và sandbox, nơi có thể kiềm chế cùng rủi ro đó một cách chính xác hơn.

**Chỉ đi theo ứng viên `$DSH_HOME` toàn cục của người dùng, còn file dự án vẫn không đi theo.** Bác bỏ: chủ sở hữu yêu cầu hành vi nhất quán ở mọi scope, và một quy tắc bị chia đôi thì khó suy luận hơn một chính sách áp dụng nhất quán kèm một ranh giới có tài liệu. Dự án mà người dùng chủ động mở không hề đáng tin hơn home của chính người dùng.

**Đi theo symbolic link, nhưng từ chối các đích phân giải ra ngoài gốc dự án.** Bác bỏ: điều này tái lập một ranh giới tin cậy cục bộ ở sai tầng (hình học đường dẫn thay vì quyền đọc), phá vỡ tình huống hợp lý «`$DSH_HOME` trỏ đi nơi khác», và lặp lại phần kiềm chế mà cổng chính sách file system đã có.

## Hệ quả

Một file chỉ dẫn được trỏ bởi symbolic link giờ được nạp và kết xuất hệt như đích của nó, qua đó hỗ trợ việc dùng chung file chỉ dẫn chuẩn tắc giữa nhiều công cụ và nhiều home, còn bản sao gương `CLAUDE.md → AGENTS.md` sẽ đi qua khử trùng lặp theo nội dung thay vì bị bỏ qua. Việc nạp chỉ dẫn không còn phụ thuộc vào `ctx.fs.lstat`; một đích đã phân giải mà không phải file là trường hợp thiếu đã được xác nhận, chỉ có ngoại lệ từ provider mới là tạm thời không khả dụng. Ranh giới tin cậy chuyển ra khỏi plugin này, sang tầng chính sách file system và sandbox. Khi các bản triển khai nạp repo không đáng tin, chúng bắt buộc phải ràng buộc `ctx.fs`. [agent-instructions note](2026-06-24-workspace-context.md) và README của package cùng mang tuyên bố về hành vi đi theo và rủi ro còn lại này.
