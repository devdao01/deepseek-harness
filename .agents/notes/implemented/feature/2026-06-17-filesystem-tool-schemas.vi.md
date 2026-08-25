# Agent Note: Schema công cụ hệ thống tệp — hình dạng giao diện đọc/ghi/sửa hướng model

Status: implemented

[English](2026-06-17-filesystem-tool-schemas.md) | Tiếng Việt

## Vấn đề

[Agent Note về capability seam hệ thống tệp](../architecture/2026-06-17-filesystem-capability-seam.md) đã định nghĩa capability seam hệ thống tệp (`ctx.fs`), cách tách package (`dsh-fs`, `dsh-fs-local`, `dsh-tool-fs`, cộng plugin chính sách `dsh-fs-observation-policy`), và chính sách tệp đã quan sát / phiên bản cũ dùng cho phép kiểm read-before-write/edit — về sau các Agent Note [tách seam hệ thống tệp](../simplification/2026-06-26-fsspec-style-fs-seam.md) và [cổng event](../architecture/2026-06-26-file-context-as-event-gate.md) đã chuyển nó từ `ctx.fs` sang cổng event `fs/*` của plugin `dsh-fs-observation-policy`. Quyết định còn lại của đợt giao hàng công cụ hệ thống tệp đầu tiên là schema hướng model: model nhìn thấy những tham số nào trong `read`, `write` và `edit`.

Schema đó phải đủ nhỏ, nhưng cũng phải đủ ổn định để backend hệ thống tệp cục bộ, từ xa và trong sandbox không cần thay đổi giao diện hướng model, đồng thời phải tránh bê nguyên mọi tùy chọn từ các hệ thống tham chiếu. Claude Code và OpenCode phơi bày những công cụ tệp lõi tương tự, nhưng khác nhau ở phong cách đặt tên và các flag phụ; quyết định này chọn giao diện chung nhỏ nhất.

## Quyết định

`@deepseek-ai/dsh-tool-fs` phơi bày ba công cụ hướng model sau trong bộ công cụ hệ thống tệp đầu tiên:

| Công cụ | Schema của chúng ta | Claude Code | OpenCode | Ghi chú |
|---|---|---|---|---|
| `read` | `read(file_path, offset?, limit?)` | `Read(file_path, offset?, limit?, pages?)` | `read(filePath, offset?, limit?)` | Chỉ hỗ trợ tệp; `offset` bắt đầu từ 1; bản đầu không hỗ trợ ảnh, PDF hay nội dung đa phương thức. |
| `write` | `write(file_path, content)` | `Write(file_path, content)` | `write(content, filePath)` | Tạo mới hoặc ghi đè văn bản UTF-8. Dưới fs-observation-policy mặc định, phải quan sát trước khi cập nhật tệp đã có; tạo tệp mới thì không cần. |
| `edit` | `edit(file_path, old_string, new_string, replace_all?)` | `Edit(file_path, old_string, new_string, replace_all?)` | `edit(filePath, oldString, newString, replaceAll?)` | Thay thế chuỗi theo nghĩa đen; mặc định yêu cầu khớp duy nhất; dưới fs-observation-policy mặc định phải quan sát trước (đọc bất kỳ cửa sổ nào cũng tính là quan sát). |

Schema dùng tên trường snake_case (`file_path`, `old_string`, `new_string`, `replace_all`), nhất quán với Claude Code và các ví dụ schema công cụ DeepSeek Harness hiện có. Package consumer chuyển các tên hướng model này thành lời gọi `ctx.fs` và phân phối event `fs/*`.

## Schema công cụ

### `read`

`read` xem xét một tệp văn bản UTF-8 và trả về nội dung kèm số dòng.

Tham số:

- `file_path: string` — bắt buộc. Đường dẫn cần đọc, do `ctx.fs` phân giải.
- `offset?: number` — tùy chọn. Dòng đầu tiên được trả về, bắt đầu từ 1. Mặc định là dòng đầu tiên.
- `limit?: number` — tùy chọn. Số dòng tối đa được trả về. Giá trị mặc định và mức trần là chi tiết hiện thực của `dsh-tool-fs` / `ctx.fs`.

Những gì hiện thực đầu tiên không đụng tới:

- Không có tham số `pages` cho PDF.
- Không đọc ảnh hay tệp đa phương thức.
- Không liệt kê thư mục qua `read`; nếu cần, việc liệt kê thư mục sẽ là một công cụ riêng sau này.

### `write`

`write` tạo mới hoặc thay thế hoàn toàn một tệp văn bản UTF-8.

Tham số:

- `file_path: string` — bắt buộc. Đường dẫn cần ghi, do `ctx.fs` phân giải.
- `content: string` — bắt buộc. Toàn bộ nội dung văn bản UTF-8 cần ghi.

Dưới fs-observation-policy mặc định, dùng `write` để cập nhật một tệp đã có đòi hỏi cùng ngữ cảnh thực thi đó trước đó đã có một lần quan sát (read/write/edit) tệp này; plugin `dsh-fs-observation-policy` cung cấp phiên bản đã quan sát làm lớp bảo vệ chống phiên bản cũ trên `fs/write-intent`. Tạo tệp mới không cần quan sát trước. Nếu plugin chính sách không tồn tại, `write` là thao tác tạo hoặc ghi đè vô điều kiện do provider trần thực hiện.

Schema không phơi bày `expected_hash`, `expected_version` hay `create_only` làm tham số hướng model. Việc kiểm phiên bản cũ được điều khiển bởi phiên bản do backend sinh ra và trạng thái quan sát của plugin chính sách, chứ không đòi model sao chép token phiên bản qua schema.

### `edit`

`edit` cập nhật một tệp văn bản UTF-8 đã có bằng cách thay thế văn bản theo nghĩa đen.

Tham số:

- `file_path: string` — bắt buộc. Đường dẫn cần sửa, do `ctx.fs` phân giải.
- `old_string: string` — bắt buộc. Văn bản nghĩa đen cần thay thế. Chuỗi rỗng không hợp lệ trong hiện thực đầu tiên.
- `new_string: string` — bắt buộc. Văn bản thay thế theo nghĩa đen; chuỗi rỗng nghĩa là xóa phần khớp.
- `replace_all?: boolean` — tùy chọn. Mặc định là false. Khi là false, `old_string` phải khớp đúng một chỗ.

`edit` đòi hỏi cùng ngữ cảnh thực thi trước đó đã quan sát tệp này (đọc theo cửa sổ bất kỳ đều tính — việc cho phép phụ thuộc vào việc phiên bản đã quan sát còn là mới nhất hay không, chứ không đòi phải xem toàn văn), hoặc ngữ cảnh đó trước đó đã thực hiện write/edit lên tệp này. Plugin chính sách `dsh-fs-observation-policy` suy ra chủ sở hữu, và cung cấp phiên bản đã ghi nhận làm lớp bảo vệ chống phiên bản cũ; khóa thay đổi của provider cưỡng chế lớp bảo vệ đó.

Hiện thực đầu tiên từ chối cú pháp patch kiểu Codex và API edit đa chế độ. Nó dùng một chế độ thay thế nghĩa đen nghiêm ngặt, giữ giao ước hướng model đơn giản, và để backend nắm ngữ nghĩa của khớp chính xác, khớp trùng lặp, ký tự xuống dòng và phiên bản cũ.

## Hình dạng kết quả

Hiện thực đầu tiên từng đặt logic định dạng `ContentBlock[]` trong `execute`. [Giao ước đầu ra công cụ chuẩn tắc](../architecture/2026-07-20-canonical-tool-output-contract.md) ngày nay giữ các sự kiện kết quả của `ctx.fs` làm giá trị đã được công cụ xác thực, và phái sinh cùng phần văn bản cho model qua `output.render`; việc ghi nhận/làm mới trạng thái tệp vẫn thuộc về `ctx.fs`.

Phép chiếu gốc mặc định:

| Công cụ | Kết quả `ctx.fs` có cấu trúc mà `tool-fs` dùng | Phép chiếu model mặc định |
|---|---|---|
| `read` | các dòng trả về, số dòng trả về, tổng số dòng, đường dẫn hiển thị đích, phiên bản tệp, cờ đánh dấu khung nhìn từng phần | văn bản kèm số dòng và chân trang phân trang |
| `write` | thao tác tạo/cập nhật, đường dẫn hiển thị đích, phiên bản tệp mới | văn bản thành công tạo/cập nhật ngắn gọn |
| `edit` | số lần thay thế, cờ thay thế toàn bộ, đường dẫn hiển thị đích, phiên bản tệp mới | văn bản thành công chỉnh sửa ngắn gọn |

Kết quả có cấu trúc không lặp lại tham số của model (như `file_path`, `old_string` hay `content`), trừ khi backend đã phân giải chúng thành thông tin mới (như `displayPath`, `targetKey` hay phiên bản mới). Việc cắt bớt nhằm tiết kiệm token là trách nhiệm của phép chiếu model, chứ không phải một phần kết quả chuẩn tắc của backend.

## Những phần hoãn lại

Những nội dung sau bị loại trừ rõ ràng khỏi hiện thực schema hệ thống tệp đầu tiên:

- Tham số `expected_hash`, `expected_version` hay `create_only` hướng model.
- Công cụ liệt kê thư mục, glob, grep và tìm kiếm.
- Thao tác đọc/ghi an toàn cho dữ liệu nhị phân.
- `read` cho PDF/ảnh/đa phương thức.
- Giá trị chiếu Code Mode cho công cụ hệ thống tệp.
- Định dạng diff chuẩn tắc cho edit.

## Kiểm thử

Test schema ghim tập tham số bắt buộc/tùy chọn của từng công cụ, việc từ chối `old_string` rỗng, giá trị mặc định của `replace_all`, tên trường snake_case, phần mô tả chính sách quan sát trong văn bản mô tả, và việc đăng ký bộ plugin gốc; test tích hợp thực thi cả ba công cụ qua `ctx.tools.execute()` trên provider `dsh-fs-local` thật, và xác minh rằng tham số của model được chuyển đúng thành các lời gọi `ctx.fs` và phân phối `fs/*` như mong đợi.

## Các phương án từng cân nhắc

- **Cú pháp patch kiểu Codex hoặc API edit đa chế độ**: bác bỏ. Một chế độ thay thế nghĩa đen nghiêm ngặt giữ giao ước hướng model đơn giản, và để backend nắm ngữ nghĩa của khớp chính xác, khớp trùng lặp, ký tự xuống dòng và phiên bản cũ.
- **Tên tham số camelCase (kiểu OpenCode)**: snake_case nhất quán với Claude Code và các ví dụ schema công cụ hiện có của harness, và tên gọi một khi phát hành sẽ trở thành API công khai.
- **Tham số `expected_hash` / `expected_version` / `create_only` hướng model**: bác bỏ. Việc kiểm phiên bản cũ được điều khiển bởi phiên bản do backend sinh ra và trạng thái quan sát của plugin chính sách, không bao giờ dựa vào những token mong manh do model sao chép.

## Hệ quả

**Schema bản đầu nhỏ hơn của Claude Code một cách có chủ đích.** Việc bỏ đi pages cho PDF, read đa phương thức, các flag grep/list phong phú và trường expected hash giúp hiện thực tập trung, nhưng người dùng có thể sớm yêu cầu chúng. Những tính năng đó sẽ được đưa vào qua Agent Note riêng hoặc công việc tiếp nối tập trung, chứ không phải bằng cách nhồi nhét quá nhiều vào schema ban đầu.

**Trong v1 không có lớp bảo vệ chống phiên bản cũ hướng model tường minh.** Schema không đòi model cung cấp expected hash/version. Đây là chủ đích: việc kiểm phiên bản cũ đến từ phiên bản do backend sinh ra và trạng thái quan sát của plugin `dsh-fs-observation-policy`, chứ không từ những token mong manh do model sao chép. Thất bại an toàn của hệ thống tệp được phơi bày qua mã `FsError` có cấu trúc do `dsh-fs` sở hữu, chứ không qua trường phiên bản do model cung cấp.

**Tên gọi trở thành API công khai.** Một khi đã phát hành, đổi `file_path` thành `filePath` hay `old_string` thành `oldString` sẽ kéo theo thay đổi ở prompt, ví dụ và client hạ nguồn. Agent Note này chọn trước snake_case, và coi đó là một giao ước hướng model ổn định.
