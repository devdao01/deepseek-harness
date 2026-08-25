# Agent Note: Capability seam hệ thống tệp — ctx.fs, backend cục bộ và các công cụ hệ thống tệp hướng mô hình

Status: implemented

[English](2026-06-17-filesystem-capability-seam.md) | Tiếng Việt

## Vấn đề

harness đã có một capability seam `bash` cụ thể (`dsh-shell` / `dsh-bash-local` / `dsh-tool-bash`), nhưng các thao tác hệ thống tệp khi đó sắp được triển khai dưới dạng công cụ hướng mô hình lại không có seam tương đương. Nếu `read`, `write` và `edit` dùng trực tiếp `node:fs`, gói công cụ hướng mô hình sẽ đồng thời gánh chính sách thực thi hệ thống tệp, phân giải đường dẫn cục bộ, hành vi ghi nguyên tử, giải mã văn bản, hành vi symlink và ngữ nghĩa chỉnh sửa.

Điều này ghép chặt ba mối quan tâm biến đổi độc lập với nhau:

1. Quy ước hệ thống tệp: plugin có thể yêu cầu những thao tác nào.
2. Backend: hiện tại là đĩa cục bộ, tương lai có thể là hệ thống tệp sandbox/từ xa/theo phạm vi dự án.
3. API phía Consumer: schema `read` / `write` / `edit` hướng mô hình và cách định dạng kết quả.

Nếu không có giao diện `ctx.fs`, khi thay truy cập hệ thống tệp cục bộ bằng backend sandbox hay từ xa, schema công cụ, bản demo và phần dẫn dắt trong prompt sẽ buộc phải thay đổi, dù quy ước hướng mô hình lẽ ra phải giữ ổn định. Điều này cũng khiến ranh giới quyền/sandbox khó suy luận hơn: một tùy chọn `cwd` trông giống sandbox, nhưng trừ khi có backend tường minh hoặc chính sách `tools/execute` cưỡng chế ràng buộc bao hàm đường dẫn, nó chỉ là một đường dẫn cơ sở.

Các công cụ hệ thống tệp phải được triển khai theo đúng hình thái capability seam như bash trước khi trở thành giao diện package công khai.

## Quyết định

Truy cập hệ thống tệp là một capability seam hạng nhất, tuân theo [Agent Note về capability seam](2026-06-13-capability-seams.md):

1. `@deepseek-ai/dsh-fs` (`packages/fs/fs`) sở hữu service `ctx.fs` trừu tượng, các kiểu từ vựng hệ thống tệp, cùng từ vựng sự kiện chính sách `fs/*`.
2. `@deepseek-ai/dsh-fs-local` (`packages/fs/fs-local`) cung cấp hiện thực đầu tiên, lấy hệ thống tệp cục bộ làm backend.
3. `@deepseek-ai/dsh-tool-fs` (`packages/fs/tool-fs`) cung cấp các công cụ `read`, `write` và `edit` hướng mô hình thông qua `ctx.fs`, và là bộ thực thi phát ra các sự kiện `fs/*`.

Package Consumer chỉ phụ thuộc vào package Service Definition, không bao giờ phụ thuộc `dsh-fs-local`. Các triển khai cần backend khác chỉ cần nạp một provider khác cho `ctx.fs`, không cần đổi schema công cụ hay phần dẫn dắt prompt hướng mô hình.

Chính sách đọc-trước-ghi/chỉnh-sửa và trạng thái quan sát nằm ở package thứ tư `@deepseek-ai/dsh-fs-observation-policy` (`packages/fs/fs-observation-policy`), đóng góp qua cơ chế kiểm soát bằng sự kiện `fs/*` chứ không gắn lên `ctx.fs`; triển khai nào nạp `dsh-tool-fs` thì nạp luôn `dsh-fs-observation-policy` để có khả năng đọc-trước-ghi/chỉnh-sửa. Quyết định này xác lập ranh giới gồm ba package; quyết định tách chính sách ra khỏi lớp cơ sở của provider do [Agent Note tách seam hệ thống tệp](../simplification/2026-06-26-fsspec-style-fs-seam.md) đưa ra, còn cách hiện thực nó bằng plugin kiểm soát theo sự kiện (thay vì service dạng phương thức) do [Agent Note kiểm soát theo sự kiện](2026-06-26-file-context-as-event-gate.md) đưa ra.

Backend đầu tiên cố ý chỉ giới hạn ở cục bộ: `dsh-fs-local` hiện thực `ctx.fs` trên hệ thống tệp của máy chủ. Các backend anh em trong tương lai có thể cung cấp hệ thống tệp sandbox, từ xa, ảo hoặc theo phạm vi dự án sau cùng một giao diện.

Consumer đầu tiên cố ý chỉ giới hạn ở tệp văn bản: `dsh-tool-fs` phơi bày các công cụ `read`, `write` và `edit` hướng mô hình, xử lý tệp văn bản UTF-8. Các Consumer tương lai có thể thêm liệt kê thư mục, tìm kiếm/glob, thao tác an toàn với nhị phân, theo dõi tệp hoặc các thao tác dự án ở tầng cao hơn, miễn là năng lực cần thiết tồn tại trên `ctx.fs` thì không cần đổi package backend cục bộ. Liệt kê thư mục trực tiếp về sau được thêm bởi [bổ sung năng lực liệt kê thư mục trực tiếp cho seam hệ thống tệp](../../archived/architecture/2026-07-03-filesystem-directory-listing-seam.md).

Quyền hệ thống tệp và sandbox không nằm trong hàm ý của phép tách này. Backend cục bộ phân giải đường dẫn tương đối từ thư mục cơ sở được cấu hình, nhưng chính sách ràng buộc bao hàm đường dẫn là một quyết định riêng: hoặc do một hiện thực `ctx.fs` nghiêm ngặt hơn cưỡng chế, hoặc do plugin quyền/sandbox bọc `tools/execute` và bác bỏ trước khi lời gọi tới được Consumer.

Đọc-trước-ghi/chỉnh-sửa và trạng thái quan sát thuộc về `dsh-fs-observation-policy`, không thuộc `ctx.fs`. Thông qua kiểm soát bằng sự kiện `fs/*`, chính sách ghi nhận phiên bản theo từng actor mờ đục, và cung cấp kỳ vọng thay đổi tùy chọn; provider cưỡng chế tính mới một cách nguyên tử. `dsh-tool-fs` phát sự kiện nhưng không phụ thuộc vào chính sách. Xem Agent Note [tách seam hệ thống tệp](../simplification/2026-06-26-fsspec-style-fs-seam.md) và [plugin kiểm soát theo sự kiện](2026-06-26-file-context-as-event-gate.md).

## Cấu trúc package

Seam hệ thống tệp dùng cùng hướng phụ thuộc như bộ ba bash:

```text
@deepseek-ai/dsh-tool-fs  --depends on-->  @deepseek-ai/dsh-fs  <--depends on--  @deepseek-ai/dsh-fs-local
        consumer                                interface                         implementation
```

`@deepseek-ai/dsh-fs` chỉ phụ thuộc `cordis` cộng với lớp cơ sở `HarnessError` ở cấp kho từ `@deepseek-ai/dsh-llm`. Nó khai báo khóa `ctx.fs`, service `FileSystem` trừu tượng, các kiểu từ vựng dùng chung giữa backend và Consumer, từ vựng lỗi hệ thống tệp, cùng từ vựng sự kiện chính sách `fs/*`. Nó không giữ kho trạng thái quan sát, cũng không giữ hình thái suy ra owner; sự kiện truyền một actor `object` mờ đục mà provider không bao giờ đọc, còn plugin `dsh-fs-observation-policy` sở hữu hình thái suy ra owner và kho trạng thái quan sát trên nền các sự kiện đó.

`@deepseek-ai/dsh-fs-local` phụ thuộc `@deepseek-ai/dsh-fs` và `cordis`. Nó kế thừa `FileSystem`, tự đăng ký thành `ctx.fs`, sở hữu cấu hình backend cục bộ (như thư mục cơ sở), và chứa toàn bộ truy cập `node:fs` / `node:path` trực tiếp. Nó không giữ kho trạng thái quan sát — tính mới là token phiên bản do backend đúc ra và do plugin chính sách ghi nhận.

`@deepseek-ai/dsh-tool-fs` phụ thuộc `@deepseek-ai/dsh-fs`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-system-prompt` và `cordis`. Nó đăng ký các công cụ hướng mô hình và đoạn prompt. Nó bị cấm import `node:fs`, `node:path` hay `@deepseek-ai/dsh-fs-local`; việc thực thi hệ thống tệp luôn đi qua `ctx.fs`. Nếu hiện thực cần các kiểu phụ trợ cụ thể của agent hay phiên, những phụ thuộc đó thuộc về `tool-fs`; chúng bị cấm rò ngược vào `dsh-fs`.

Plugin `tool-fs` gốc đăng ký trọn bộ công cụ hệ thống tệp (`read`, `write` và `edit`) bằng cách kết hợp các hàm phụ trợ đăng ký của từng công cụ. Nó inject `fs` và không bao giờ import package Service Provider.

## Quy ước `ctx.fs`

`@deepseek-ai/dsh-fs` sở hữu một service hệ thống tệp mang tính ngữ nghĩa. Nó ở tầng cao hơn `readFile` / `writeFile`, nhờ đó `tool-fs` không phải hiện thực lại việc phân giải đường dẫn, quản lý phiên bản, giải mã văn bản, từ chối nhị phân, phân trang, thay thế nguyên tử, hành vi symlink hay ngữ nghĩa chỉnh sửa theo nghĩa đen.

Giao diện này bao trùm các thao tác ngữ nghĩa sau:

- Phân giải đường dẫn do mô hình/plugin cung cấp thành đích do backend định nghĩa.
- Chuyển đích đã phân giải thành đường dẫn tiến trình chuẩn tắc hoặc URI `file:` của cùng môi trường thực thi, và kiểm tra quan hệ bao hàm mà không phân giải khóa mờ đục của nó.
- Lấy metadata của đích mà không đọc nội dung tệp.
- Đọc toàn bộ hoặc theo luồng văn bản UTF-8; Consumer tự áp giới hạn khung nhìn và giới hạn lưu giữ của mình.
- Tạo hoặc thay thế một tệp văn bản UTF-8.
- Chỉnh sửa một tệp văn bản UTF-8 đã có bằng phép thay thế theo nghĩa đen.

Quy ước của provider còn mang theo các hook về tính mới mà chính sách dựa vào — nhưng kho trạng thái quan sát và việc suy ra owner nằm trong plugin `dsh-fs-observation-policy`, không nằm trên `ctx.fs`:

- Backend đúc một token `version` mờ đục cho mỗi đích (trong `stat` cũng như trong mỗi kết quả đọc/thay đổi).
- `writeText`/`editText` nhận một kỳ vọng phiên bản tùy chọn: bỏ qua nó nghĩa là thay đổi trần vô điều kiện ở phía provider; cung cấp nó thì thay đổi sẽ được bảo vệ bên trong vùng tới hạn nguyên tử của backend.
- Plugin `dsh-fs-observation-policy` quyết định kỳ vọng đó trên `fs/write-intent`/`fs/edit-intent`, và ghi nhận phiên bản đã quan sát trên `fs/observed`, với khóa là owner mà nó suy ra từ actor mờ đục của sự kiện (thường là `exec.agent.session`).

Việc cấp phép dựa trên tính mới của phiên bản, chứ không dựa trên phân biệt khung nhìn đầy đủ/một phần: bất kỳ lần đọc nào cũng ghi nhận phiên bản của đích, và các lần ghi/chỉnh sửa sau đó được cấp phép miễn là tệp vẫn ở phiên bản đó — vì vậy một lần đọc cửa sổ dòng 100-150 có thể cấp phép cho việc chỉnh sửa dòng 120. Kho trạng thái quan sát là một `WeakMap<owner, Map<targetKey, version>>` nội bộ của `dsh-fs-observation-policy`; `dsh-fs` không giữ bất kỳ dữ liệu nào như vậy và coi actor là mờ đục. (Quyết định này ban đầu mô hình hóa một cache `FileState` với khung nhìn `full`/`partial` đặt trên `ctx.fs`; hai ghi chú tách seam hệ thống tệp và kiểm soát theo sự kiện đã thay nó bằng plugin chính sách dựa trên tính mới được mô tả ở đây.)

Phân giải đường dẫn là tường minh và cho phép bất đồng bộ. Phân giải cục bộ có thể chỉ là chuẩn hóa đường dẫn, nhưng backend sandbox/từ xa/theo phạm vi dự án có thể cần I/O mới phân giải được đường dẫn do người dùng cung cấp thành một định danh đích ổn định.

Đích đã phân giải phải phơi bày ít nhất ba khái niệm:

- Đường dẫn đầu vào gốc, dùng cho chẩn đoán.
- `targetKey` mờ đục, dùng để bảo vệ chống dữ liệu cũ và tra cứu trạng thái tệp. Backend cục bộ có thể dùng khóa kiểu realpath; backend từ xa có thể dùng URI workspace hoặc id tệp. Consumer bị cấm phân giải hoặc giả định nó là đường dẫn tuyệt đối cục bộ.
- `displayPath`, dùng cho đầu ra hướng mô hình/UI. Tùy backend, nó có thể là đường dẫn tuyệt đối cục bộ, đường dẫn tương đối theo workspace hoặc URI từ xa.

Ngay cả khi một năng lực khác dùng chung môi trường thực thi của provider, `targetKey` vẫn giữ nguyên tính mờ đục. Những Consumer như vậy lấy các dữ kiện cần thiết qua `processPath(target)`, `fileUrl(target)` hoặc `contains(parent, child)` của provider; [quyết định về môi trường thực thi khả chuyển](2026-07-28-portable-execution-world-consumers.md) giải thích vì sao các dữ kiện đó thuộc về seam hệ thống tệp.

Kết quả đọc và thay đổi phải bao gồm `version` mờ đục của tệp. Backend cục bộ dẫn xuất token từ metadata stat kiểu bigint (`dev`, `ino`, `size`, `mtimeNs` và `ctimeNs`), nhờ đó việc ghi đè cùng kích thước và việc thay inode đều làm Consumer mất hiệu lực một cách đáng tin cậy; backend từ xa có thể dùng revision id hoặc token kiểu hash. Plugin `dsh-fs-observation-policy` ghi nhận phiên bản để kiểm tra dữ liệu cũ; Consumer có thể hiển thị metadata liên quan nhưng bị cấm diễn giải token phiên bản.

Provider trả về văn bản đã giải mã: `readText` trả về toàn bộ tệp văn bản thường, `streamText` truyền theo luồng cùng ngữ nghĩa văn bản đó cho tệp lớn hoặc cho giới hạn lưu giữ do chính Consumer sở hữu. Việc chia cửa sổ theo dòng, giới hạn byte, kết xuất kèm số dòng và đếm tổng số dòng thuộc về các Consumer như `dsh-tool-fs`, `dsh-lsp-stdio`. Provider chịu trách nhiệm kiểm tra tệp thường, giải mã UTF-8 và từ chối nhị phân／NUL; nó không biết gì về cửa sổ dòng, giới hạn giao thức hay khung nhìn.

Việc ghi nhận trạng thái quan sát không nằm trên `ctx.fs`: sau khi đọc thành công, bộ thực thi phát `fs/observed`, và plugin `dsh-fs-observation-policy` ghi `{ version }` cho owner được suy ra. Không có khung nhìn `full`/`partial` — mọi lần đọc theo cửa sổ đều ghi nhận phiên bản, và chính tính mới (chứ không phải độ đầy đủ của khung nhìn) cấp phép cho các lần ghi/chỉnh sửa sau đó.

Ghi toàn tệp sẽ tạo hoặc thay thế tệp văn bản UTF-8. Backend có thể tạo thư mục cha khi có hỗ trợ và có tài liệu mô tả. Đích không thông thường đã tồn tại sẽ bị từ chối. `writeText` nhận một kỳ vọng tùy chọn: `createIfAbsent` tạo đích còn thiếu và từ chối đích đã tồn tại (báo `FS_NOT_OBSERVED`, đây là nhánh mà chính sách dùng cho owner chưa quan sát); `replaceIfVersion` chỉ thay thế khi đích đang ở phiên bản đã quan sát, ngược lại báo `FS_STALE_VERSION`; bỏ qua kỳ vọng thì đây là thao tác tạo hoặc ghi đè trần vô điều kiện ở phía provider. Plugin chính sách chọn cung cấp kỳ vọng nào dựa trên trạng thái quan sát của owner.

Chỉnh sửa theo nghĩa đen là một nguyên thủy của provider (`editText`), chứ không phải được ghép từ đọc cộng ghi trong `tool-fs`. Khớp theo nghĩa đen, từ chối khi khớp trùng lặp, giữ nguyên CRLF, từ chối nhị phân, kiểm tra phiên bản cũ tùy chọn và đọc-sửa-ghi nguyên tử phải cùng nằm trong vùng tới hạn thay đổi của backend. `editText` nhận cùng kỳ vọng phiên bản tùy chọn; việc kiểm tra dữ liệu cũ chạy trước khi khớp theo nghĩa đen, nên chỉnh sửa dựa trên lần đọc cũ sẽ báo `FS_STALE_VERSION`. Backend từ xa có thể hiện thực chỉnh sửa thành thao tác compare-and-edit nguyên bản; Consumer không ép buộc cách ghép theo kiểu cục bộ.

Chính plugin chính sách (chứ không phải `ctx.fs`) kiểm soát điều kiện đã quan sát trước đó: `edit` yêu cầu owner phải có quan sát trước đó (nếu không thì báo `FS_NOT_OBSERVED`), và phiên bản đã ghi nhận được truyền cho `editText` làm cơ sở CAS. Khi vắng plugin chính sách, bản thân `ctx.fs` là một seam đầy đủ và không ràng buộc (ghi/chỉnh sửa vô điều kiện); công cụ không bao giờ bị ghép với các phương thức chính sách.

Thất bại của quy ước hệ thống tệp được ném ra dưới dạng `FsError extends HarnessError`, và registry công cụ chuyển nó thành kết quả công cụ `isError` kèm metadata có cấu trúc `{ name, code }`. `dsh-fs` sở hữu từ vựng này, thay vì để mỗi công cụ tự nghĩ ra thông điệp riêng. Mã lỗi bao gồm `FS_NOT_FOUND`, `FS_NOT_TEXT`, `FS_STALE_VERSION`, `FS_NOT_OBSERVED`, `FS_NOT_REGULAR_FILE`, `FS_AMBIGUOUS_EDIT`, `FS_EDIT_NOT_FOUND` và `FS_ABORTED`. (Bản nháp ban đầu có `FS_PARTIAL_OBSERVATION`; cấp phép dựa trên tính mới không có phân biệt partial/full nên nó đã bị xóa. Các mã lỗi liên quan đến liệt kê thư mục về sau được thêm bởi [bổ sung năng lực liệt kê thư mục trực tiếp cho seam hệ thống tệp](../../archived/architecture/2026-07-03-filesystem-directory-listing-seam.md).)

## Hành vi của Consumer công cụ

`@deepseek-ai/dsh-tool-fs` là Consumer hướng mô hình. Nó sở hữu tên công cụ, JSON Schema, việc kiểm tra tham số ở ranh giới mô hình, đoạn prompt và định dạng kết quả. Nó không sở hữu việc thực thi hệ thống tệp.

Bộ công cụ đầu tiên gồm:

- `read`: kiểm tra một tệp văn bản UTF-8 và trả về nội dung kèm số dòng cùng phần dẫn dắt phân trang.
- `write`: tạo hoặc thay thế hoàn toàn một tệp văn bản UTF-8.
- `edit`: cập nhật một tệp văn bản UTF-8 đã có bằng cách thay thế văn bản theo nghĩa đen, mặc định yêu cầu khớp duy nhất, và cho phép chế độ thay thế tất cả một cách tường minh.

Mỗi công cụ tuân theo cùng một hình thái thực thi:

1. Kiểm tra và chuẩn hóa tham số của mô hình.
2. Gọi thao tác `ctx.fs` tương ứng.
3. Định dạng kết quả thành `ContentBlock[]` hướng mô hình.
4. Để lỗi backend/công cụ được ném ra chảy qua `ToolRuntime.execute()`, nơi chuyển nó thành kết quả công cụ `isError`.

Package này đăng ký phần dẫn dắt prompt qua `ctx.systemPrompt.section(...)`, và đăng ký schema qua `ctx.tools.register(...)`. Schema công cụ vẫn chảy vào đường lắp ráp prompt thông thường qua `SystemPrompt.assemble()` và `ToolRuntime.schemas()`; không cần đổi agent loop.

Gói công cụ giữ quy ước hướng mô hình ổn định khi backend thay đổi: backend cục bộ và backend từ xa có thể phân giải đường dẫn khác nhau bên trong, nhưng schema `read` / `write` / `edit` không thay đổi chỉ vì backend thay đổi.

Triển khai mặc định yêu cầu phải `read` trước khi dùng `write` hoặc `edit` để cập nhật tệp đã tồn tại. `tool-fs` không hiện thực điều này bằng cách kiểm tra xem một công cụ tên `read` đã chạy hay chưa: nó phát các sự kiện `fs/write-intent`/`fs/edit-intent` (truyền ngữ cảnh thực thi như một actor mờ đục), còn plugin `dsh-fs-observation-policy` suy ra owner, kiểm soát điều kiện quan sát trước đó và cung cấp kỳ vọng phiên bản. Bất kỳ lần đọc theo cửa sổ nào cũng có thể cấp phép cho lần ghi/chỉnh sửa sau đó, miễn là tệp chưa thay đổi. Dùng `write` để tạo tệp mới không yêu cầu quan sát trước đó.

Plugin gốc đăng ký trọn bộ bằng cách kết hợp các hàm phụ trợ đăng ký của từng công cụ. Nó inject `fs`, `tools` và `systemPrompt`.

## Kiểm thử

Kiểm thử bám theo ranh giới package, chứ không chỉ theo các công cụ mà người dùng thấy: quy ước service trong `dsh-fs`; hành vi hệ thống tệp thực được kiểm thử qua giao diện `ctx.fs` trong `dsh-fs-local` (phân giải, symlink, truyền luồng, từ chối nhị phân/UTF-8, ghi vô điều kiện và ghi có bảo vệ phiên bản, ngữ nghĩa chỉnh sửa theo nghĩa đen, giữ nguyên ký tự kết thúc dòng, mã lỗi `FsError` có cấu trúc); giao diện Consumer dựa trên provider cục bộ thật trong `dsh-tool-fs` (chỉ mock mô hình/đồng hồ, không bao giờ mock cộng tác viên); và kiểm thử tích hợp qua `ctx.tools.execute()` trong cả trường hợp có và không có `dsh-fs-observation-policy`, xác minh trạng thái thế giới bằng cách đọc lại tệp từ đĩa, không tin vào giá trị trả về theo đặc tả cũng không tin vào nội dung được kết xuất. Chính sách trạng thái quan sát/suy ra owner được kiểm thử trong `dsh-fs-observation-policy`, không phải ở đây.

Những nhóm mẫu phòng thủ mà kho này từng vấp phải được cố định trực tiếp:

- **An toàn tệp tạm khi ghi nguyên tử.** Ghi/chỉnh sửa được dàn dựng qua một tệp tạm độc quyền chỉ owner (`'wx'`, `0o600`) nằm trong một thư mục ngẫu nhiên riêng tư `0700` đặt cạnh đích, dọn dẹp khi thất bại, và cuối cùng rename nguyên tử — nhất quán với quy tắc tệp spill của bash, vì đường dẫn tạm có thể đoán trước và world-readable sẽ mời gọi tấn công đua symlink và rò rỉ thông tin. Kiểm thử khẳng định quyền truy cập, và khẳng định đường dẫn tạm đã tồn tại sẽ không bị ghi đè; nguyên thủy này là yêu cầu thường trực của seam.
- **Tính đồng nhất của `targetKey` qua symlink.** Hai đường dẫn đầu vào phân giải về cùng một realpath sẽ dùng chung một mục trạng thái quan sát: một lần `read` qua đường dẫn A thỏa mãn điều kiện đọc-trước-chỉnh-sửa cho `edit` qua đường dẫn symlink B, và một lần ghi với dữ liệu cũ qua một đường dẫn có thể phát hiện được qua đường dẫn kia.
- **Tranh chấp đồng thời/dữ liệu cũ.** Hai thao tác ghi/chỉnh sửa đồng thời trên cùng một đích hội tụ một cách tất định — một thành công, một bị từ chối với `FS_STALE_VERSION` — và lần chỉnh sửa thành công làm mới trạng thái đã ghi nhận, để lần chỉnh sửa tiếp theo của cùng owner có thể tiếp tục.
- **An toàn HMR (thay thế module nóng) và dispose (giải phóng tài nguyên).** Dispose fiber của backend sẽ rút provider `ctx.fs`; provider tiếp theo khởi động với trạng thái không kế thừa.

## Các phương án từng cân nhắc

- **Công cụ hướng mô hình dùng trực tiếp `node:fs`**: gói công cụ sẽ đồng thời gánh chính sách thực thi, phân giải đường dẫn, ghi nguyên tử, giải mã văn bản và ngữ nghĩa chỉnh sửa, ghép chặt ba mối quan tâm biến đổi độc lập đã nêu ở phần vấn đề, và bất kỳ lần thay backend nào cũng khuấy động schema.
- **Một package hợp nhất duy nhất `dsh-fs-tools`**: hình thái trước khi có seam; bị bác bỏ với cùng lý do tách Service Definition / Service Provider / Consumer như bash, và cái tên hợp nhất chưa bao giờ trở thành API công khai.
- **Đặt trạng thái quan sát trên `ctx.fs`**: hình thái mà Agent Note này triển khai ban đầu; bị thay thế bởi [Agent Note tách seam hệ thống tệp](../simplification/2026-06-26-fsspec-style-fs-seam.md) và [Agent Note kiểm soát theo sự kiện](2026-06-26-file-context-as-event-gate.md): backend sandbox/từ xa không nên kế thừa chính sách quan sát hướng mô hình, nên provider chỉ giữ lại token phiên bản và thay đổi có bảo vệ phiên bản tùy chọn.

## Hệ quả

**`cwd` có thể bị hiểu nhầm là sandbox.** Thư mục cơ sở của backend cục bộ là giá trị mặc định để phân giải, chứ không phải ranh giới cách ly tự động. Nếu cần ràng buộc bao hàm đường dẫn thì phải được cưỡng chế bởi quy ước backend hoặc bởi plugin quyền/sandbox trên `tools/execute`.

**Giao diện có thể trở nên quá cục bộ hóa.** Nếu `ctx.fs` trả về các trường như `absolutePath`, backend từ xa, sandbox hay ảo sẽ trở nên khiên cưỡng. Quy ước nên phơi bày metadata hiển thị, chứ không đòi hỏi Consumer phải hiểu đường dẫn của máy chủ.

**Giao diện có thể trở nên quá mỏng.** Nếu `ctx.fs` chỉ phản chiếu các nguyên thủy `node:fs`, `tool-fs` sẽ hiện thực lại việc phát hiện nhị phân, phân trang, ghi nguyên tử và ngữ nghĩa chỉnh sửa, tái tạo đúng sự ghép chặt mà quyết định này muốn tránh.

**Ngữ nghĩa chỉnh sửa vốn dĩ dễ bị tranh chấp.** Chỉnh sửa theo nghĩa đen là thao tác đọc-sửa-ghi; biện pháp bảo vệ là vùng tới hạn thay đổi nguyên tử của backend cộng với kỳ vọng phiên bản tùy chọn, nhờ đó các lần chỉnh sửa đồng thời hội tụ một cách tất định — một bên thắng, bên kia nhận `FS_STALE_VERSION`.

**Trạng thái quan sát không thuộc về `ctx.fs`.** Ghi nhận ngữ cảnh thực thi đã thấy gì là chính sách quy trình làm việc, chứ không phải I/O hệ thống tệp thô. Quyết định này ban đầu đặt nó bên trong seam hệ thống tệp; ghi chú tách seam hệ thống tệp sau đó xác lập rằng backend sandbox/từ xa không nên kế thừa chính sách quan sát hướng mô hình, và chuyển nó vào plugin `dsh-fs-observation-policy`. Quy ước của provider chỉ giữ lại những gì mà an toàn ghi/chỉnh sửa thực sự cần ở tầng lưu trữ — token phiên bản do backend đúc ra và thay đổi có bảo vệ phiên bản tùy chọn — còn plugin chính sách sở hữu việc suy ra owner, trạng thái quan sát và kiểm soát đọc-trước-chỉnh-sửa dựa trên sự kiện `fs/*`.

**Hình thái `resolve` rồi thao tác tốn thêm một vòng khứ hồi mỗi lần gọi.** Mỗi công cụ có thể trước hết phân giải đường dẫn thành `FsTarget`, rồi phát lời gọi đọc/ghi/chỉnh sửa bằng một lời gọi `ctx.fs` riêng. Với backend cục bộ, điều này không đáng kể (phân giải là chuẩn hóa đường dẫn trong bộ nhớ), nhưng backend từ xa/sandbox có thể biến mỗi bước thành một yêu cầu độc lập, khiến một lần `read` trở thành hai vòng khứ hồi mạng. Backend nào coi trọng chi phí khứ hồi có thể cache hoặc gộp việc phân giải bên trong, đồng thời giữ nguyên quy ước quan sát được.

**Việc lưu bền trạng thái quan sát bị hoãn lại.** Trạng thái quan sát tồn tại trong bộ nhớ (một `WeakMap` bên trong `dsh-fs-observation-policy`), nên các phiên được khôi phục sẽ thận trọng yêu cầu đọc lại tệp trước khi ghi/chỉnh sửa, cho tới khi một sự kiện phiên hoặc cơ chế lưu bền trong tương lai làm cho quan sát có thể phát lại được.

**Mã lỗi trở thành một phần của seam.** Mã lỗi `FsError` khiến phiên bản cũ và thất bại quan sát có thể được định tuyến bằng máy thông qua hệ phân loại lỗi có cấu trúc sẵn có. Cái giá là `dsh-fs` phải import lớp cơ sở `HarnessError` dùng chung từ `dsh-llm`; phụ thuộc đó là cố ý và giới hạn ở từ vựng lỗi.

**Chi phí tách package được trả trước.** Việc tách ba package làm tăng mã khuôn mẫu khi mới chỉ có một backend. Đây là cố ý: truy cập hệ thống tệp là ranh giới sandbox/từ xa tiềm năng, và đổi API package sau khi công cụ hướng mô hình đã phát hành thì tốn kém hơn nhiều.
