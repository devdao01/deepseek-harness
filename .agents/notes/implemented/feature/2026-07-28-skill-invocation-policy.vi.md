# Agent Note: Chính sách gọi skill (kỹ năng) độc lập giữa model và người dùng

Status: implemented

[English](2026-07-28-skill-invocation-policy.md) | Tiếng Việt

## Vấn đề

Ban đầu registry skill coi thao tác khám phá như một danh mục dành cho model: `ctx.skills.list()` loại bỏ những skill bị cấm model gọi, còn `ctx.skills.get()` vẫn là một loader tin cậy không lọc nội dung. Thiết kế đó đủ để hỗ trợ việc nạp do model khởi xướng, nhưng không biểu diễn được bốn loại skill tương thích với Claude: chỉ công khai cho người dùng, chỉ công khai cho model, công khai cho cả hai, hoặc không công khai cho bên nào. TUI sinh phần tự động hoàn thành cho người dùng từ chính danh sách đã lọc theo model, đồng thời cho phép nạp bất kỳ tên chính xác nào qua `get()`, càng làm trầm trọng thêm sự lệch pha giữa hai loại chính sách gọi.

Bộ phân giải cục bộ còn phơi bày một lối viết camelCase nội bộ ra ngoài dưới dạng frontmatter. Muốn hỗ trợ đồng thời trường phủ định sẵn có `disable-model-invocation` và trường khẳng định `user-invocable`, cần dựng một biểu diễn nghiệp vụ bền vững và đối xứng, đồng thời tránh biến mọi khóa YAML có thể xuất hiện thành một quy ước không kiểu xuyên package.

## Quyết định

`SkillSummary` chứa một đối tượng `invocation: SkillInvocationPolicy` bắt buộc và có kiểu rõ ràng, với hai trường `modelInvocable: boolean` và `userInvocable: boolean` mang nghĩa khẳng định và đối xứng. Chỉ những biên đầu vào tường minh mới được phép bỏ qua nó: `SkillRegistration` ở runtime không cung cấp chính sách, và frontmatter cục bộ không cung cấp cả hai khóa gọi, đều được phân giải thành `{ modelInvocable: true, userInvocable: true }` trước khi sinh ứng viên hoặc định nghĩa. Các khóa frontmatter trong tương lai chỉ được đưa vào mô hình nghiệp vụ khi đã có bên tiêu thụ và quy ước thi hành; nhà cung cấp cục bộ vẫn phân tích frontmatter thành một `Record<string, unknown>` mở, rồi chỉ chiếu những trường đã nhận diện được cùng giá trị mặc định của chúng vào chính sách đã chuẩn hóa và có kiểu.

`ctx.skills.list()` trả về mọi bản tóm tắt thắng cuộc, không còn thay bất kỳ interface gọi nào để chọn chính sách. `isModelInvocable(skill)` và `isUserInvocable(skill)` lần lượt đọc thẳng trường khẳng định tương ứng. `ctx.skills.get()` giữ nguyên tính trung lập với chính sách, vì bên gọi nội bộ đáng tin có thể cần đến định nghĩa bất kỳ; còn bên tiêu thụ đối ngoại thì buộc phải chạy hàm phán định tương ứng của chính mình trước khi hiển thị hay nạp một skill. Tool của model và TUI sẽ kiểm tra bản tóm tắt độc lập với chính sách gọi trước khi gọi `get()`, rồi kiểm tra lại một lần nữa trên định nghĩa đã nạp: tên bị từ chối tuyệt đối không lọt vào luồng nạp định nghĩa, và một thay đổi chính sách xảy ra giữa lúc khám phá và lúc nạp cũng không thể để lộ phần thân của skill đó.

Nhà cung cấp cục bộ chỉ chấp nhận đúng hai khóa frontmatter kebab-case viết chính xác từng ký tự là `disable-model-invocation` và `user-invocable`. Nó chấp nhận giá trị boolean của YAML, cùng với `true`/`false`, `yes`/`no`, `on`/`off` và `1`/`0` không phân biệt hoa thường, khớp với các lối viết boolean mà Claude skills thực sự hỗ trợ. Nó ánh xạ `disable-model-invocation` thành trường khẳng định đảo ngược, và kể cả khi cả hai khóa đều vắng mặt thì vẫn điền cả hai trường khẳng định theo giá trị mặc định. Nếu dùng lối viết camelCase đối ngoại hoặc cung cấp giá trị gọi không phải boolean, luồng khám phá sẽ loại bỏ toàn bộ skill đó và đưa ra cảnh báo có trọng điểm; repo này còn đang ở giai đoạn trước phát hành, nên không giữ lại bí danh tương thích cho định dạng trên đĩa. Việc kiểm tra dữ liệu gọi tuân theo nguyên tắc mặc định từ chối khi thất bại, vì bỏ qua loại dữ liệu này đồng nghĩa với mặc định cấp quyền, có thể khiến skill lộ ra trên một interface đã bị vô hiệu hóa; ngược lại, các giá trị tùy chọn `whenToUse` và `metadata` sai kiểu sẽ bị bỏ qua, vì chúng không tham gia vào việc phán định chuyện gọi.

Danh mục và loader hướng tới model của `dsh-tool-skill` thi hành `isModelInvocable`. Phần tự động hoàn thành `/skill:` và loader theo tên chính xác của TUI thi hành trường người dùng ngay tại chỗ, nhờ đó skill chỉ cho phép người dùng gọi vẫn hiển thị và nạp được ở đây dù không xuất hiện trong kết quả khám phá của model, đồng thời không biến peer dependency (phụ thuộc ngang hàng) tùy chọn của skill thành import lúc chạy. Skill khởi tạo do launcher cài sẵn, dùng cho các session `dsh migrate` và `dsh upgrade` có hướng dẫn, cũng đi theo đúng đường TUI này, nên bắt buộc phải giữ trạng thái cho phép người dùng gọi. RPC `skill.list` của trình duyệt cung cấp các tham chiếu do người dùng chọn nhưng vẫn cần model nạp, nên chỉ công khai những skill cho phép cả model lẫn người dùng gọi; thay đổi lần này không thêm RPC nào để trình duyệt nạp skill trực tiếp.

Những quy tắc trên cho phép bốn tổ hợp sau:

| Chính sách | Model gọi | Người dùng gọi |
|---|---|---|
| `{ modelInvocable: true, userInvocable: true }` | Bao gồm | Bao gồm |
| `{ modelInvocable: true, userInvocable: false }` | Bao gồm | Loại trừ |
| `{ modelInvocable: false, userInvocable: true }` | Loại trừ | Bao gồm |
| `{ modelInvocable: false, userInvocable: false }` | Loại trừ | Loại trừ |

Quyết định này mở rộng [hệ thống skill](2026-07-05-skill-system.md), và thay thế giới hạn về chính sách gọi được ghi trong [lệnh slash skill của TUI đã lưu trữ](../../archived/feature/2026-07-21-tui-skill-slash-command.md).

## Các phương án từng cân nhắc

**Lưu toàn bộ frontmatter vào một `Map` tổng quát, rồi đọc khóa chuỗi trong `isModelInvocable` / `isUserInvocable`.** Không áp dụng, vì khóa viết sai chính tả, giá trị không phải boolean, cùng những phép ép kiểu mà mỗi bên tiêu thụ tự nghĩ ra đều sẽ vượt qua biên package mà không được kiểm tra kiểu. Biên của bộ phân giải vẫn giữ trạng thái mở; còn mô hình nghiệp vụ thì cố ý dùng một interface hẹp, có kiểu rõ ràng.

**Giữ `ctx.skills.list()` chỉ trả về skill cho phép model gọi, rồi thêm một danh sách riêng cho người dùng.** Không áp dụng, vì khám phá, phân giải trùng lặp, cache và sắp xếp đều là công việc không liên quan đến interface gọi. Dùng một danh mục đầy đủ cùng các hàm phán định tường minh sẽ tránh được chuyện các cơ chế này dần dần phân hóa, và phơi bày rõ chính sách ngay tại biên của từng bên tiêu thụ.

**Thi hành chính sách gọi ngay bên trong `ctx.skills.get()`.** Không áp dụng, vì `get()` không thể biết bên gọi là tool của model, lệnh của con người, hay logic điều phối đáng tin cậy. Lọc ở đây còn khiến tổ hợp cấm gọi trên cả hai interface trở nên không thể kiểm tra hay quản lý.

**Xử lý frontmatter camelCase như một bí danh.** Không áp dụng, vì định dạng đối ngoại tuân theo quy ước kebab-case của Claude skills, mà repo này chưa phát hành nên không phải gánh nghĩa vụ tương thích. Thất bại tường minh giúp tránh việc âm thầm giữ lại những lối viết không đúng chuẩn.

**Thêm RPC để phía trình duyệt gọi skill trực tiếp.** Không áp dụng trong thay đổi lần này, vì luồng trình duyệt hiện tại chèn vào một tham chiếu cho model, chứ không phải phần thân chỉ dẫn đã được nạp. Do đó luồng này nên lấy giao của chính sách gọi giữa model và người dùng; còn một interface để người dùng nạp trực tiếp thì cần thiết kế riêng cả giao thức lẫn cách ghi log.

## Hệ quả

Nhà cung cấp và phần đăng ký ở runtime cung cấp ra ngoài một quy ước gọi nhỏ gọn, có kiểu rõ ràng, trong khi YAML cục bộ vẫn mở rộng được. Mỗi bên tiêu thụ khám phá mới đều buộc phải chọn dứt khoát: hàm phán định cho model, hàm phán định cho người dùng, giao của cả hai, hay lối truy cập tin cậy không lọc; nếu bỏ sót lựa chọn này thì lúc review sẽ thấy vấn đề ngay, chứ không còn bị hành vi của registry che khuất nữa.

Snapshot ACP (Agent Client Protocol) không cần khóa cố định thay đổi ở danh mục của model: nó bao gồm skill chỉ cho phép model gọi và loại trừ skill chỉ cho phép người dùng gọi. Snapshot TUI đã lắp ráp, không cần khóa, khám phá và nạp theo tên chính xác một skill chỉ cho phép người dùng gọi, rồi từ chối một skill chỉ cho phép model gọi trước khi nạp phần thân; bài smoke test Loader/PTY thật chứng minh đúng đường đi chỉ-cho-phép-người-dùng ấy thông qua tiến trình terminal đi kèm sản phẩm. Snapshot Chromium trên host thật cố định hành vi lấy giao của trình duyệt trên cả bốn tổ hợp chính sách. Unit test của TUI phủ các tổ hợp này cùng tình huống tranh chấp khi dispose (giải phóng tài nguyên); còn các bài test registry, bộ phân giải cục bộ, tool của model và proxy API thì phủ giá trị mặc định, các lối viết boolean được hỗ trợ, giá trị sai định dạng, việc từ chối khóa cũ, việc thi hành chính sách khi nạp theo tên chính xác, và phép giao chính sách ở phía trình duyệt.
