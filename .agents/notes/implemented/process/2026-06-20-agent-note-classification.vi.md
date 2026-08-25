# Agent Note: Phân loại Agent Note qua thư mục con được mã hóa vào đường dẫn

Status: implemented

[English](2026-06-20-agent-note-classification.md) | 中文

## Vấn đề

Cây thư mục Agent Note chỉ tổ chức theo vòng đời (`proposed/` / `implemented/` / `rejected/`) không thể ghi lại mỗi file chứa quyết định thuộc *loại* nào. Khi người đọc duyệt qua một vòng đời, nếu không mở từng file một, sẽ không thể phân biệt được tính năng mới, mục bị gỡ bỏ, hay thay đổi chính sách công cụ.

Xu hướng nhất quán của repo này là [gate chất lượng máy móc ưu tiên hơn quy ước hành văn](2026-06-11-quality-gates.md): quy ước không được máy kiểm tra cuối cùng sẽ mục nát. Do đó phương án phân loại ở đây phải có thể cưỡng chế, chứ không dựa vào header file tự giác.

## Quyết định

Thêm chiều thứ hai, tức **loại** của Agent Note, và mã hóa nó vào đường dẫn: `{lifecycle}/{class}/yyyy-mm-dd-topic.md`. Thư mục *chính là* nhãn. Vị trí file khai báo loại của nó; tập hợp đóng giới hạn ở "chỉ những thư mục này và không gì khác"; gate [verify-md-links](2026-06-18-markdown-cross-link-lint.md) hiện có đã bảo vệ việc viết lại đường dẫn cần thiết khi di chuyển file.

### Tập hợp đóng gồm sáu loại

| Loại | Phạm vi bao phủ |
|---|---|
| `feature` | Tính năng mới hướng tới người dùng hoặc model. |
| `bug-fix` | Sửa lỗi hoặc lấp khoảng trống bị phơi bày bởi postmortem (báo cáo sự cố). |
| `simplification` | Gỡ bỏ code, hành vi hoặc phạm vi interface bên ngoài, không đưa vào tính năng mới. |
| `architecture` | Quyết định mang tính cấu trúc về **source code được phát hành** — quan hệ giữa các package, từ vựng runtime. |
| `process` | Công cụ, chính sách hoặc workflow **xung quanh** code, không phải hành vi runtime. |
| `testing` | Hạ tầng và chiến lược test. |

Ranh giới giữa `architecture` và `process` là: **architecture** liên quan đến source code chúng ta phát hành; **process** liên quan đến công cụ và workflow xung quanh source code. Bản thân Agent Note này thuộc quyết định `process`: nó thay đổi cách tổ chức repo và gate, không phải hành vi runtime của harness, do đó nằm dưới `implemented/process/`.

### Hai gate

Cả hai đều là thành viên của `doc-sync` (gate đồng bộ tài liệu), phong cách nhất quán với `verify-md-wrap` (tsx ESM, chỉ xác thực không sinh ra, phát hiện vi phạm đầu tiên là thoát với mã khác 0):

- **`scripts/verify-agent-note-classification.ts`**: định nghĩa tập hợp đóng của vòng đời và loại. Nó khẳng định mỗi file dưới thư mục vòng đời đều nằm trong thư mục loại thuộc tập hợp quy phạm (file `.md` nằm rải rác dưới thư mục gốc vòng đời hoặc thư mục loại không xác định đều sẽ fail), và từ chối `INDEX.md` tập trung. Tập hợp quy phạm nằm trong `scripts/agent-note-tree.ts`, còn [README](../../README.md) ghi lại bằng văn bản mỗi loại.
- **`scripts/verify-doc-refs.ts`**: kiểm tra comment source code tham chiếu tài liệu. Đường dẫn Agent Note không chỉ xuất hiện trong Markdown, mà còn xuất hiện trong doc comment TypeScript (ví dụ `.agents/notes/implemented/testing/2026-06-19-acp-snapshot-tests.md` tính từ gốc repo). `verify-md-links` không nhìn thấy các tham chiếu này, do đó việc tái cấu trúc thư mục có thể âm thầm để lại tham chiếu thất bại. Gate này quét file `.ts` do repo tự sở hữu dưới `packages/**` và `examples/**` (loại trừ `lib/` đã build và `vendor/`), tìm token `docs/….md` và `.agents/notes/….md`, giải quyết mỗi đường dẫn tính từ gốc repo và khẳng định nó tồn tại. Nó yêu cầu dùng phần mở rộng `.md`, do đó bỏ qua tham chiếu trong văn bản không có phần mở rộng.

## Phương án khác đã cân nhắc

- **Thêm dòng văn bản `Classification:` trong mỗi file** (ngay cạnh `Status:`), do gate parse. Khả thi, nhưng nó lặp lại sự thật mà đường dẫn đã có thể mang vào trong file, và nội dung dòng đó có thể không khớp với thư mục chứa nó. Mã hóa vào đường dẫn khiến nhãn và nơi lưu trữ hợp làm một, không có gì cần giữ đồng bộ.
- **Lập loại `refactor`.** Gần như trùng lặp hoàn toàn với `simplification`; tiêu chuẩn duy nhất có người thử dùng để phân biệt là "hành vi quan sát được có thay đổi không?", mà `simplification` đã mã hóa điều đó (nó không thay đổi). Chỉ cần một loại, không cần hai.
- **Bộ chỉ mục tài liệu được sinh ra hoặc bảo trì thủ công.** Không áp dụng: cây thư mục vòng đời/loại mới là cấu trúc có thẩm quyền; danh mục tập trung sẽ tạo điểm nóng merge, nhưng không mang lại khả năng khám phá nào mà điều hướng cây thư mục hay tìm kiếm trong repo không làm được.

## Hệ quả

- Mỗi Agent Note đều nằm dưới một thư mục loại. Người đọc duyệt một thư mục đơn lẻ là có thể xem toàn bộ quyết định simplification hoặc testing trong một vòng đời.
- Chuỗi `doc-sync` có thêm hai script tsx nhanh; không thêm dependency mới (bộ công cụ mdast/GFM đã tồn tại sẵn nhờ `verify-md-wrap`/`verify-md-links`).
- Thêm loại mới phải là quyết định tường minh: sửa `const` trong `scripts/agent-note-tree.ts` và [mục Classification](../../README.md#classification), chứ không chỉ dùng `mkdir` để tạo thư mục. Gate sẽ từ chối thư mục không xác định, do đó loại tạm thời không thể lẫn vào một cách âm thầm.
- Tham chiếu tài liệu trong comment source code cũng bị gate ràng buộc: một khi tài liệu được comment `.ts` tham chiếu bị di chuyển hoặc đổi tên, `verify-doc-refs` trong `doc-sync` và CI sẽ fail, từ đó chặn đứng một loại trôi dạt mà `verify-md-links` không thể phát hiện được về mặt cấu trúc.
