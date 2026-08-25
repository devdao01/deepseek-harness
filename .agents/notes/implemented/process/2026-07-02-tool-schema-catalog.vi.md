# Agent Note: Danh mục schema công cụ được sinh ra (khởi động và thu thập)

Status: implemented

[English](2026-07-02-tool-schema-catalog.md) | Tiếng Việt

## Vấn đề

Trước đây repo không có một tài liệu tham chiếu thống nhất nào ghi lại tên công cụ, mô tả và JSON Schema thực sự được phơi ra cho mô hình. Các khai báo trong mã nguồn nằm rải rác nhiều nơi và được kết hợp lúc chạy, còn các trang tham chiếu Cordis và trang hệ thống con sẵn có thì bao phủ việc đấu nối và từ vựng, chứ không phải công cụ.

## Quyết định

Danh mục được sinh ra bằng cách **khởi động từng plugin công cụ và đọc schema đã đăng ký của nó**, chứ không phân giải mã nguồn. `scripts/gen-tool-catalog.ts` gắn từng gói công cụ đã phát hành lên một `Context` Cordis hoàn toàn mới; context đó cũng cung cấp `SystemPrompt`, `ToolRuntime` cùng các service được inject mà `apply` của plugin đọc tới. Trình sinh gọi `ctx.tools.schemas()` — chính là `ToolSchema[]` được gửi cho mô hình — sau đó dispose (giải phóng tài nguyên) context, rồi render một mục `## <package>` cho mỗi gói, mỗi công cụ kèm một khối ` ```json ` `parameters`. Nó nhất quán về hình thức CLI với `gen-cordis-catalog` / `gen-module-graph`: mặc định `--write` sinh lại; `--check` thất bại khi bản đã commit đã cũ; đầu ra có tính tất định (sắp xếp theo manifest, công cụ sắp theo tên). `verify-tool-catalog` (tức là `--check`) chạy trong `doc-sync`, nên các thay đổi tài liệu liên quan và CI đều thực thi cùng một kiểm tra độ tươi.

### Vì sao khởi động thay vì phân giải (điểm cốt lõi)

Danh mục Cordis là duyệt AST TypeScript thuần túy, vì mọi tên sự kiện/service đều là chuỗi literal, ánh xạ khứ hồi được về khai báo tĩnh — AST chính là toàn bộ sự thật. **Schema công cụ không thể biết được ở tầng tĩnh**, nên cùng kỹ thuật đó sẽ tạo ra một tài liệu nói dối:

- `tool-todo` viết `enum: [...STATUSES]` — một phép trải của một `const` lúc chạy. AST nhìn thấy biểu thức trải, chứ không phải `["pending","in_progress","completed"]`.
- Mỗi đoạn mô tả đều được dựng bằng **nối chuỗi** (`'…' + '…'`). AST nhìn thấy node nối chuỗi, chứ không phải văn bản cuối cùng mà mô hình thực sự đọc.
- Tên công cụ của `tool-subagent` là `config.toolName ?? 'subagent'` — được chọn lúc nạp, không phải literal.
- Plugin MCP có thể đăng ký **JSON Schema thô** trực tiếp qua `ctx.tools.register()`, hoàn toàn không đi qua `defineTool`, nên việc liệt kê có cấu trúc các điểm gọi `defineTool(` sẽ bỏ sót.

Nguồn sự thật chính xác duy nhất là schema mà registry thực sự nắm giữ sau khi plugin được nạp. Khởi động plugin là áp dụng nguyên tắc «kiểm chứng thực tế, không phải tự báo cáo» trong [chiến lược kiểm thử](../../../../docs/testing.md) vào trình sinh tài liệu: đọc sản phẩm đã phát hành, chứ không suy diễn lại một bản khác.

### Khôi phục bảo đảm «không âm thầm bỏ sót»

Việc khởi động có một cái giá mà duyệt AST không có: không có tập khai báo mã nguồn nào để liệt kê, nên gói công cụ mới có thể bị quên. Một **bộ canh gác tính đầy đủ** khôi phục bảo đảm này — `assertManifestComplete` glob toàn bộ gói `tool-*` dưới `packages/`, và báo lỗi ngay nếu có bất kỳ gói nào không nằm trong manifest khởi động của trình sinh. Gói công cụ mới sẽ làm trình sinh thất bại trước khi được đăng ký, kéo theo `doc-sync` thất bại. Đây chính là thuộc tính cấu trúc mà trình sinh Cordis có được miễn phí nhờ liệt kê mã nguồn, chỉ là được hiện thực lại một lần nữa cho trình sinh dựa trên khởi động.

### Manifest khởi động bảo trì thủ công là chính sách không thể lược bỏ

Hệ thống tệp chịu trách nhiệm phát hiện danh sách gói công cụ, bộ canh gác tính đầy đủ chịu trách nhiệm từ chối các thiếu sót. `TOOL_PACKAGES` vẫn giữ một công thức khởi động tường minh cho từng gói, vì các Service Provider và cấu hình cần thiết thuộc về chính sách, không phải sự thật có thể suy ra an toàn từ bố cục thư mục hay tên inject.

### Phạm vi

Các gói công cụ sản phẩm đã phát hành dưới `packages/*/tool-*`, mỗi gói khởi động bằng cấu hình mặc định, bao gồm `dsh-tool-bash` (`bash`), `dsh-tool-jobs` (`job_output`, `job_list`, `job_kill`) và `dsh-tool-subagent` (`subagent`). Các công cụ chỉ dùng cho ví dụ nằm ngoài phạm vi.

Đơn vị của danh mục là gói, không phải từng thực thể công cụ đã được cấu hình. Mỗi gói khởi động một lần với cấu hình mặc định; các bí danh lúc nạp (như `subagent_fork`) được ghi chú, nhưng không liệt kê mọi tổ hợp cấu hình triển khai. Bản kê triển khai bao phủ một phạm vi độc lập và vô hạn.

### Dùng fence `json` thông thường

Khối schema dùng ` ```json `, chứ không phải fence họ `ts` tùy biến. `doc-typecheck` chỉ trích xuất fence `ts*`, nên khối JSON vô hình đối với nó — không cần đấu nối `BlockKind` (khác với fence `ts cordis-catalog` của danh mục Cordis, vốn phải đưa vào danh sách trắng để tránh biên dịch các mảnh chữ ký trần).

## Các phương án từng cân nhắc

- **Duyệt AST TypeScript thuần túy, như danh mục Cordis**: schema công cụ không thể biết được ở tầng tĩnh (xem điểm cốt lõi ở trên): trải lúc chạy, nối chuỗi, tên do cấu hình chọn, và đăng ký `ctx.tools.register()` thô đều khiến tài liệu suy ra từ AST nói dối.
- **Suy ra công thức khởi động từ inject của từng gói**: thuộc lối đi «quá thông minh» mà [đề xuất phát hiện danh mục gói](../../proposed/process/2026-06-20-discover-package-inventory.md) đã cảnh báo; công thức giữ nguyên là chính sách viết tay, danh sách do hệ thống tệp phát hiện và do bộ canh gác tính đầy đủ gác cổng.
- **Dùng fence họ `ts` tùy biến cho khối schema**: không cần thiết. Fence ` ```json ` thông thường vô hình đối với `doc-typecheck`, không cần danh sách trắng `BlockKind`.

## Hệ quả

- Danh mục không trôi dạt: thay đổi schema công cụ mà tệp đã commit không phản ánh sẽ làm `verify-tool-catalog` thất bại trong `doc-sync` và CI. Gói `tool-*` mới thêm mà chưa vào manifest sẽ làm bộ canh gác tính đầy đủ thất bại ngay.
- Văn bản mô tả công cụ có một nơi thuộc về duy nhất — `description` của `defineTool` trong mã nguồn — chất lượng các mục được sinh ra phụ thuộc vào nó, với sức cưỡng chế giống hệt điều mà danh mục Cordis áp lên JSDoc của sự kiện.
- Trình sinh import và thực thi các gói workspace (đây là script đầu tiên trong repo làm vậy; các script khác chỉ đọc văn bản). Nó chạy dưới `tsx` thông qua ánh xạ `paths` của `tsconfig` gốc, dùng cùng lối đi mã nguồn chưa build như demo và test, nên không cần bước build.
- Tương lai nếu thêm một capability seam phía sau một công cụ nào đó thì có nghĩa là manifest cần thêm một mục công thức (khai báo cần gắn những seam nào). Đây chính là cái giá viết tay có chủ ý đã nêu ở trên; chỉ cần thay đổi khi thêm gói công cụ mới.
