# Agent Note: Installer tiếp nhận checkout có sẵn vào layout được quản lý

Status: implemented

Archived: 2026-08-10

[English](2026-07-31-installer-adopts-existing-checkout.md) | 中文

## Problem

`scripts/install.sh` tạo ra hai layout cài đặt không tương thích với nhau. Cài đặt kiểu `curl … | sh` sẽ dựng layout được quản lý — bản clone master tại `~/.dsh/source/master`, staging worktree nằm trên nhánh `dsh-staging/<timestamp>`, và symlink `current` ổn định mà launcher trong PATH dựa vào để phân giải. Còn khi chạy cùng script đó từ bên trong một checkout, theo [quyết định bỏ qua clone khi trong checkout](../../archived/process/2026-07-22-installer-in-repo-skip-clone.md) trước đây, thì `dsh` được link trực tiếp tới `bin/dsh` của checkout đó.

Việc link trực tiếp này không thể nâng cấp được. Nâng cấp trỏ lại đúng `current`, nên bản cài đặt thiếu nó không thể nâng cấp qua [`dsh-upgrade`](../../../../skills/dsh-upgrade/SKILL.md); một khi checkout bị di chuyển, symlink trong PATH sẽ hỏng; và launcher sẽ phân giải tới bất kỳ nhánh nào mà contributor tình cờ đang checkout, đây chính là trường hợp mà quy ước nâng cấp cấm dùng làm đích cho launcher. Skill nâng cấp từ lâu đã mô tả layout này là bản cài đặt kiểu cũ cần một lần di chuyển (migration); do đó hai layout khác nhau ngay từ lúc cài đặt, chỉ nhất quán khi thực hiện migration sau đó, mà migration này cũng có thể không bao giờ được thực hiện.

## Decision

Chế độ trong checkout vẫn không bao giờ clone, không bao giờ sửa working tree, nhưng giờ nó sẽ vô điều kiện **tiếp nhận (adopt)** checkout đó vào layout được quản lý. Không có tùy chọn thoát: một layout duy nhất phục vụ mọi bản cài đặt.

Container sở hữu staging worktree và `current`; repo được *phát hiện*, không phải sở hữu. `git rev-parse --git-common-dir` sẽ phân giải ra thư mục git dùng chung đứng sau checkout đó — với linked worktree, đó là bản clone thật chứ không phải worktree — thư mục cha của nó chính là repo dùng làm cơ sở nâng cấp. Sau đó, lấy `HEAD` của checkout đó làm điểm bắt đầu, tạo staging worktree dưới `$DSH_SOURCE` và trỏ `current` vào đó. Do đó, bản clone ở bất kỳ đâu trên đĩa đều hội tụ về cùng layout với cài đặt kiểu `curl`, và cả hai đường đi đều dùng chung một quy trình worktree/exclude/lock/link: khác biệt duy nhất giữa chúng chỉ là repo được phát hiện bằng `git clone` hay bằng `git rev-parse`.

Installer không ghi lại repo đó nằm ở đâu. Khi repo nằm ngoài container, container không còn tự chứa (self-contained) — mỗi staging worktree giữ con trỏ gitdir tuyệt đối trỏ tới bản clone đó, xóa bản clone sẽ phá vỡ chúng — nhưng sự thật này vốn đã do chính git nắm giữ: file `.git` của worktree ghi rõ đường dẫn đó, và chạy `git worktree list` trong bản clone đó sẽ liệt kê mọi worktree phụ thuộc vào nó.

Việc tiếp nhận lấy `HEAD` làm điểm bắt đầu nhánh, nên những gì chạy là nội dung đã commit, thay đổi chưa commit vẫn ở lại trong checkout. Điều này không có bất kỳ gợi ý hay cảnh báo nào: installer dựng xong layout thì thôi không làm phiền nữa. Đặt `DSH_SOURCE` thành thư mục khác vẫn là cách duy nhất có tài liệu để quay lại clone một cây khác.

Mọi so sánh đường dẫn đều thực hiện trên đường dẫn vật lý thông qua hàm hỗ trợ `resolve_dir`, và mỗi giá trị tham gia so sánh đều được phân giải tại thời điểm gán, chứ không phải tại thời điểm so sánh. Git luôn báo cáo đường dẫn đã phân giải, nên chỉ cần có symlink ở bất kỳ tầng nào phía trên checkout, việc so sánh nó với đường dẫn chưa phân giải sẽ cho kết quả không bằng nhau — chỉ cần thư mục home là symlink đã đủ, và trên macOS việc `/var` -> `private/var` khiến mọi đường dẫn `mktemp` đều như vậy. Sự không khớp này sẽ khiến một bản cài đặt được quản lý có sẵn bị nhận nhầm thành clone bên ngoài, và dựng thêm một container nữa cạnh container thật. Lỗi tương tự sẽ tái diễn chừng nào một bên so sánh chưa được phân giải — `REPO_ROOT` của cài đặt curl và đường dẫn container được so sánh với nó đều từng gặp trường hợp này. Do đó `resolve_dir` sẽ trả về nguyên văn đường dẫn khi đường dẫn đó không tồn tại thay vì thất bại, để container chưa được tạo không cần xử lý dự phòng riêng ở từng điểm gọi, và cũng không có điểm gọi nào bị so sánh với đường dẫn rỗng do thiếu xử lý dự phòng; bên gọi cần biết "không tồn tại" sẽ tự kiểm tra thư mục đó một cách tường minh. `git rev-parse --path-format=absolute` có thể làm việc tương tự, nhưng yêu cầu git 2.31 trở lên.

Trước khi trỏ lại `current`, installer sẽ từ chối đường dẫn staging có kết quả phân giải bằng chính repo, để thực thi quy ước nâng cấp "launcher không bao giờ phân giải tới bản clone master".

## Alternatives considered

**Biến `~/.dsh/source/master` thành symlink trỏ tới bản clone tùy ý đó.** Đã bác bỏ. Git sẽ phân giải symlink đó và ghi lại đường dẫn *thật*: worktree tạo qua nó sẽ lưu `gitdir: …/<clone>/.git/worktrees/<name>`, và `git worktree list` báo cáo chính bản clone đó. Vì vậy symlink này thuần túy mang tính trang trí — không có đoạn mã nào đọc nó — nhưng lại ngụ ý container sở hữu repo đó. Nó còn âm thầm hỏng: sau khi di chuyển clone, `master` trông vẫn còn nhưng đã treo (dangling), và mỗi staging worktree sẽ thất bại với `fatal: not a git repository`. Tệ nhất, nó gán bí danh hai tên vào cùng một cây, khiến kiểm tra "current không bao giờ được là bản clone master" pass khi so sánh chuỗi nhưng thực chất là sai. `~/.dsh/source/master` là một vị trí chứ không phải một tên, và chỉ có vị trí mới mang tính thẩm quyền.

**Nâng chính checkout đó thành đích của `current`.** Đã bác bỏ: quy ước nâng cấp yêu cầu `current` phải trỏ tới một staging worktree sạch trên nhánh staging, không bao giờ được trỏ tới checkout feature, review, hay detached. Điều này còn khiến mỗi lần nâng cấp ghi đè lên chính cây mà contributor đang chỉnh sửa.

**Giữ việc link tại chỗ đằng sau một prompt hoặc cờ `DSH_ADOPT`.** Đã bác bỏ; một bản sửa đổi sớm của thay đổi này từng hiện thực đúng như vậy, sau đó bị loại bỏ. Bản thân layout thứ hai chính là lỗi, nên giữ nó như một tùy chọn đồng nghĩa với giữ lại vấn đề, và làm tăng gấp đôi trạng thái mà mỗi thay đổi sau này phải xử lý — prompt, cờ, cảnh báo working tree không sạch, và một đường link thứ hai — tất cả chỉ để duy trì một layout lẽ ra không nên tồn tại. Động cơ ban đầu của việc link tại chỗ — để script có thể test được với mã nguồn local — vẫn còn đúng dưới phương án tiếp nhận: staging worktree được tạo từ `HEAD` của checkout đó chạy đúng cùng đoạn mã. `DSH_SOURCE` vẫn dùng được để cài đặt một cây khác.

**Phát cảnh báo hoặc prompt khi working tree không sạch.** Đã bác bỏ: `worktree add` bắt đầu từ `HEAD` vốn dĩ không thể mang theo nội dung chưa commit, nên hành vi này đã xác định, prompt chỉ thêm một điểm quyết định mà người dùng không thể chọn khác. Thay vào đó, quy ước này được ghi trong tài liệu.

**Đặt staging worktree của bản clone được tiếp nhận cạnh chính bản clone đó** (`~/src/staging-*`), thay vì đặt trong `~/.dsh/source`. Đã bác bỏ: `current` và launcher trong PATH đều là duy nhất theo từng người dùng, nên rải worktree ra các thư mục cha của từng bản clone sẽ tái tạo lại đúng vấn đề lan tràn bản clone anh em mà source container vốn được thiết kế để ngăn chặn.

## Consequences

Giờ đây một layout duy nhất phục vụ mọi bản cài đặt, nên bản clone được tiếp nhận không cần migration một lần như skill mô tả trước đây vẫn có thể được `dsh-upgrade` nâng cấp, và installer không còn nhánh nào tạo ra layout không thể nâng cấp. Chạy trong checkout vẫn không bao giờ sửa working tree.

Cái giá: contributor không còn có thể trỏ PATH vào một checkout và để `dsh` tự động theo dõi working tree đó khi đổi nhánh; launcher giờ phân giải tới một staging worktree cố định tại `HEAD` đã được tiếp nhận lúc cài đặt. Chạy lại installer sẽ tiếp nhận lại `HEAD` hiện tại.

Ngoài ra, container tiếp nhận bản clone bên ngoài không còn tự chứa: xóa bản clone đó sẽ phá vỡ staging worktree của nó. Đây là thuộc tính vốn có của việc tái sử dụng bản clone sẵn có, không phải do thiết kế này gây ra — phương án symlink bị bác bỏ chỉ che giấu nó, không sửa nó — cách chẩn đoán dựa vào chính bản ghi worktree của git.

## Testing

`scripts/install.sh` hiện có một bộ regression test PTY shell thật tại `apps/cli/tests/install-script.spec.ts`, dùng dependency stub để bao phủ cả đường tiếp nhận lẫn đường kiểu curl. Cài đặt kiểu curl mặc định dùng nguồn công khai `deepseek-ai/deepseek-harness-sdk`, còn việc thay thế installer bằng pnpm/npx vẫn là công việc khác.

Việc kiểm chứng được thực hiện thủ công, thông qua một bộ thiết bị test dùng một lần, dùng `pnpm` đã stub để điều khiển script thật: tiếp nhận bản clone độc lập; tiếp nhận từ linked worktree vào container có sẵn của nó; `DSH_SOURCE` tường minh vẫn quay lại đường dẫn clone; khi working tree không sạch thì tiếp nhận âm thầm, không prompt cũng không cảnh báo, và file chưa commit vẫn ở nguyên vị trí; checkout không phải git thì thất bại kèm hướng dẫn; và cài đặt clone kiểu `curl` được assert đúng layout đã dựng — kiểm tra này bắt được `REPO_ROOT` chưa phân giải. Đường tương tác được chạy trong tmux từ một checkout không sạch, xác nhận toàn bộ quá trình không xuất hiện prompt tiếp nhận nào mà vẫn tới được launcher, cuối cùng `dsh` chạy từ staging worktree mới, còn checkout gốc vẫn giữ nguyên nhánh của nó, file chưa commit vẫn còn đó.
