# @deepseek-ai/dsh-sandbox-local

[English](README.md) | 中文

Triển khai cục bộ cho seam [`dsh-sandbox`](../sandbox/). Nó chọn và cache một runner nền tảng: trên Linux ưu tiên chọn `bwrap` nếu hoạt động được, nếu không thì chọn Landlock; trên macOS dùng Seatbelt; trên Windows dùng runner token bị giới hạn bằng ACL. Khi có nhiều ứng viên, chúng sẽ được dò lần lượt theo thứ tự; khi chỉ có một ứng viên thì chọn thẳng.

Gốc gói export mặc định và có tên plugin `LocalSandboxProvider` cùng `Config`; profile builder theo nền tảng vẫn là chi tiết triển khai nội bộ.

Các nền tảng không được hỗ trợ và runner không khả dụng sẽ bị từ chối thực thi với `SANDBOX_UNAVAILABLE`; việc thực thi tuyệt đối không âm thầm rơi về trạng thái không giới hạn. Mỗi lần bọc (wrap) đều mang theo quy tắc lỗi runner có cấu trúc, giúp bên tiêu thụ phân biệt được sandbox hỏng với lệnh thất bại. [Agent Note về sandbox](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) chịu trách nhiệm giải thích căn cứ lựa chọn và khác biệt giữa các profile.

Chính sách được truyền theo từng lời gọi; provider chỉ lưu trữ cơ chế và kết luận runner đã cache. Mỗi lần bọc đều báo cáo mức độ hoàn chỉnh của việc enforcement, cùng chữ ký từ chối (denial signature) đặc thù của backend và quy tắc lỗi runner. Landlock chỉ coi là runner thất bại khi mã thoát là 125, và sau khi loại trừ các thông báo enforcement từng phần khớp hoàn toàn vẫn còn một dòng chẩn đoán chí mạng `landlock-run:`; tiến trình con mang theo thông báo đó dù thoát với mã 1, 2 hay 125 vẫn được xử lý như kết quả tiến trình con bình thường. Bubblewrap và Seatbelt vẫn chỉ dựa vào chữ ký, vì cả hai đều không có cam kết công khai giữ lại trạng thái thất bại của launcher. Bên tiêu thụ spawn trực tiếp argv được trả về, do đó runner bị thiếu hoặc không thể thực thi thuộc về lỗi spawn ngoài băng (out-of-band); tiến trình con khởi động thành công nhưng thoát với mã 126 hoặc 127 vẫn được xử lý như kết quả bình thường. `runnerCommand` sẽ bỏ qua bước dò, và yêu cầu cung cấp một hoặc nhiều mục `runnerFailureSignatures` không rỗng, một dòng, không phân biệt hoa thường cho phương ngữ chí mạng của riêng runner tùy chỉnh. Do cơ chế của nó không xác định, nó sẽ mang theo cả hai phương ngữ từ chối của Linux cùng lúc. `probeTimeoutMs` giới hạn thời lượng dò tính năng. [Agent Note về sandbox](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) chịu trách nhiệm giải thích ngữ nghĩa lựa chọn và thất bại.

Profile Seatbelt mặc định cho phép, nhưng có `(deny file-write*)` cùng allow-list ghi, do đó chỉ ràng buộc đúng các thao tác file mà mode tương ứng cam kết: `read-only` chỉ cấp đường dẫn literal `/dev/null`; `workspace-write` cấp thêm gốc workspace, `/tmp`, và thư mục tạm darwin theo từng user (`os.tmpdir()`, tức vùng tạm thực sự mà nền tảng cung cấp cho các công cụ họ mkstemp sử dụng). Mỗi gốc thư mục đều được chuẩn hóa (normalize), vì Seatbelt khớp theo đường dẫn đã được resolve (`/tmp` chính là `/private/tmp`). Apple đánh dấu CLI (giao diện dòng lệnh) `sandbox-exec` là deprecated, nhưng mọi hệ thống macOS vẫn cung cấp nó; nếu tình hình thay đổi, bước dò tính năng sẽ khiến việc thực thi bị từ chối.

Profile Windows giữ một SID ghi xác định (deterministic) và một ACE thường trú cho mỗi workspace, nhưng cấp một thư mục tạm riêng tư ngẫu nhiên cho mỗi cặp session/workspace đang hoạt động, cùng với SID và ACE có thể thu hồi khác nhau. Do đó, các session dùng chung workspace sẽ chia sẻ quyền ghi như mong đợi, nhưng không kế thừa quyền thư mục tạm của nhau. Provider mới luôn chọn đường dẫn tạm và SID mới, nên tàn dư từ crash vừa không thể chặn session được khôi phục, vừa không thể cấp quyền cho nó; runner cung cấp cùng mức cô lập theo từng lời gọi cho các lời gọi không có agent (tác nhân). Nếu workspace bằng hoặc chứa gốc thư mục tạm của nền tảng, lời gọi sẽ thất bại trước khi bất kỳ thay đổi ACL nào diễn ra, vì nếu không thì ACE workspace có thể kế thừa của nó sẽ lan sang mọi thư mục con tạm riêng tư.

[`@deepseek-ai/node-addon-landlock-run`](https://www.npmjs.com/package/@deepseek-ai/node-addon-landlock-run) cung cấp launcher theo nền tảng, việc dò tính năng và từ vựng tham số CLI. Provider này chỉ chịu trách nhiệm ánh xạ mode sang quyền hạn và lựa chọn runner. Giữ việc phân giải đường dẫn và phân giải bước dò trong binary có versioning giúp ngăn ngừa sự trôi dạt (drift) của quy ước.

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'
```

Bên tiêu thụ: [`@deepseek-ai/dsh-bash-sandbox`](../../shell/bash-sandbox/); xem tổ hợp mặc định có thể chạy được tại [ví dụ acp-agent](../../../examples/acp-agent/).

## Trải nghiệm mô hình

Ảnh hưởng gián tiếp thông qua [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.md) và [`dsh-tool-bash`](../../shell/tool-bash/README.md); chúng render các sự kiện enforcement và từ chối của provider này, trong khi seam [`dsh-sandbox`](../sandbox/README.md) chịu trách nhiệm định nghĩa văn bản `SANDBOX_UNAVAILABLE`, còn việc lựa chọn runner và profile thì không đi vào context.

#### Ảnh hưởng KV Cache

Không trực tiếp làm mất hiệu lực KV Cache; thay đổi tiền tố request thuộc trách nhiệm của các bên tiêu thụ nêu trên.

## Hạn chế đã biết và việc còn hoãn lại

- **ACL Windows chỉ đạt enforcement một phần**: token bị giới hạn phải giữ lại Everyone để hoàn tất khởi tạo tiến trình, do đó các đối tượng bên ngoài cấp quyền ghi cho Everyone vẫn có thể ghi được; hard link NTFS cũng khiến đường dẫn workspace và đường dẫn bên ngoài trỏ tới cùng một đối tượng file. Provider báo cáo `enforcement: 'partial'`, chứ không thổi phồng ranh giới này thành enforcement đầy đủ.
- **Landlock có thể chỉ đạt enforcement một phần**: ABI kernel cũ hơn nhưng vẫn được hỗ trợ chỉ có thể giới hạn các loại truy cập mà nó tự công bố, do đó báo cáo `enforcement: 'partial'`, không thổi phồng thành enforcement đầy đủ.
- **Seatbelt phụ thuộc vào `sandbox-exec` đã deprecated**: macOS vẫn cung cấp nó, nhưng nếu Apple gỡ bỏ engine chính sách riêng tư này, provider sẽ không có cách thay thế hoặc dò tìm.
- **Việc lựa chọn runner được cache trong suốt vòng đời provider**: sau khi cài đặt, gỡ bỏ hoặc sửa runner, phải reload plugin thì lựa chọn mới thay đổi.
- **`runnerCommand` là khẳng định của bên vận hành**: runner tùy chỉnh được cấu hình sẽ bỏ qua bước dò tính năng, và giả định nó trung thực triển khai một profile tương thích với bwrap; nếu bản thân nó là một script Bash, việc khởi động interpreter của nó diễn ra trước khi script áp đặt các ràng buộc.
