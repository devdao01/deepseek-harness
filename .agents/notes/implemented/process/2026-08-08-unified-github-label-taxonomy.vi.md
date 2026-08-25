# Agent Note: Hệ thống phân loại label GitHub thống nhất

Status: implemented

[English](2026-08-08-unified-github-label-taxonomy.md) | Tiếng Việt

## Vấn đề

Label PR (Pull Request) trả lời hai câu hỏi độc lập với nhau: công việc mang lại loại thay đổi nào, và tác động thực chất tới những khu vực lâu dài nào của repo. Trộn lẫn hai chiều này, hoặc đồng thời giữ cả label không tiền tố đồng nghĩa lẫn label có namespace, đều khiến ý nghĩa truy vấn trở nên mơ hồ; còn danh sách khu vực đóng kín sẽ buộc khu vực mới phải xếp vào một danh mục không chính xác.

Issue đã có sẵn Issue Type gốc và hệ thống phân loại nguồn riêng biệt. Tái sử dụng label loại hoặc label nguồn của PR trên hai loại đối tượng này sẽ tạo ra metadata trùng lặp, và làm suy yếu ý nghĩa của mỗi họ label.

## Quyết định

Mỗi PR đang mở hoặc đã merge đều mang đúng một label `kind/*` chuẩn, cùng ít nhất một label `area/*` biểu thị khu vực bị ảnh hưởng thực chất. PR bị đóng mà không merge giữ nguyên quan hệ label lịch sử đã migrate, nhưng không bổ sung thêm phân loại còn thiếu một cách tùy tiện. Label dùng cho mục đích quản lý có thể tồn tại song song, nhưng không thỏa mãn được bất kỳ chiều nào trong hai chiều này.

### Loại thay đổi

Tập hợp loại đóng kín và loại trừ lẫn nhau:

| Loại thay đổi | Ý nghĩa |
|---|---|
| `kind/feature` | Thêm hành vi mới hoặc thay đổi hành vi có chủ đích. |
| `kind/bug-fix` | Sửa hành vi lỗi. |
| `kind/doc` | Ý định chủ đạo là thay đổi tài liệu. |
| `kind/testing` | Sửa test hoặc hạ tầng test mà không thay đổi hành vi sản phẩm. |
| `kind/cleanup` | Bảo trì hoặc đơn giản hóa implementation hoặc quy trình repo mà không thay đổi hành vi. |
| `kind/dependency` | Cập nhật dependency khi không có ý định chủ đạo nào khác. |

Loại ghi lại ý định chủ đạo. Test, tài liệu, cleanup hoặc điều chỉnh dependency đi kèm không được lấn át ý định chủ đạo là thêm tính năng hay sửa lỗi. Thêm loại mới sẽ làm thay đổi các quy tắc phân loại này, nên phải sửa hệ thống phân loại và chính sách một cách rõ ràng.

Chính sách repo sẽ từ chối giá trị `kind/*` không được hỗ trợ, và liệt kê mọi alias đã bị loại bỏ trong quá trình thống nhất thành tên dành riêng: `kind/bug`, `kind/documentation`, `feature`, `bug-fix`, `doc`, `cleanup`, `testing`, `dependencies`, `ci`, `cli`, `llm` và `web-search`. Giữ chính xác nhóm tên đã migrate này giúp ngăn các tên đồng nghĩa lỗi thời bị tạo lại thành các label dùng cho mục đích quản lý trông có vẻ không liên quan.

### Khu vực

Khu vực biểu thị chủ đề sản phẩm hoặc kỹ thuật lâu dài, chứ không phải dự án chuyên biệt tạm thời, quan hệ sở hữu, hoặc các đường dẫn bị chạm tới ngẫu nhiên. Một lần sửa PR mang nhiều label khu vực khi nó thay đổi các hành vi hoặc API khác nhau, nhưng không dùng một label tổng quát cùng một label hẹp hơn để mô tả trùng lặp cùng một thay đổi. Tên và mô tả `area/*` hiện hành trên GitHub định nghĩa danh sách hiện tại; tài liệu này định nghĩa các trường hợp lựa chọn mà mô tả label ngắn gọn không thể chứa đựng đáng tin cậy.

- `area/web` bao phủ giao diện đồ họa trình duyệt và Electron, `area/vscode` bao phủ extension editor, `area/api` bao phủ giao thức liên nền tảng và SDK các ngôn ngữ.
- `area/planning` bao phủ goal, plan, todo và lập lịch, còn `area/workflow` bao phủ workflow có thể thực thi và runtime task nền.
- `area/artifact` cố ý gộp artifact, attachment và giao phẩm đa phương thức. Chỉ khi các mối quan tâm này lại cần review hoặc truy vấn độc lập mới có lý do để tách label.
- `area/tools` áp dụng cho registry, schema và quy ước thực thi tổng quát. Khả năng cụ thể dùng label khu vực riêng của nó, trừ khi nó còn thay đổi một trong các quy ước đó.
- `area/hooks` biểu thị cầu nối Claude Code và Codex, `area/infra` bao phủ build, phát hành, CI, gate repo, generator, dependency và công cụ developer, còn `area/windows` bao phủ hỗ trợ sản phẩm Windows native, chứ không phải lựa chọn CI runner.

Tập hợp khu vực cố ý giữ khả năng mở rộng. Khi mọi mô tả hiện có đều không thể bao quát đúng thực tế một khu vực lâu dài và có thể tái sử dụng, agent (intelligent agent) không cần xin phê duyệt riêng để tạo một label `area/<lowercase-kebab-case>` ngắn gọn. Agent không được tạo khu vực cho một PR đơn lẻ, đường dẫn bị chạm tới ngẫu nhiên, dự án tạm thời, trạng thái, cá nhân hoặc team, và phải báo cáo label cùng lý do đó cho người yêu cầu sau khi áp dụng label mới. Chỉ để tránh thêm một label khu vực thực sự cần thiết mà tái sử dụng một khu vực không chính xác là điều không thể chấp nhận.

### Issue và migration

Issue dùng Issue Type gốc, chứ không phải `kind/*`; label `area/*` của nó vẫn là tùy chọn. Label `source/*` ghi lại cách Issue được tạo, không áp dụng cho PR. Priority, label mặc định của GitHub và trigger workflow vẫn là metadata quản lý độc lập với nhau.

Khi migrate label, phải giữ ngữ nghĩa trước, rồi mới loại bỏ alias: trước tiên thêm label thay thế chuẩn, xác thực đối tượng có thể gắn label, rồi mới loại bỏ quan hệ label lỗi thời. Chỉ khi mọi PR và Issue không còn dùng một label mới được xóa nó, và tuyệt đối không thay thế nguyên khối các label không liên quan.

## Các phương án thay thế đã cân nhắc

**Label không tiền tố.** Tên không tiền tố có thể giảm nhiễu thị giác, nhưng không thể chỉ rõ label đang phân loại ý định, khu vực, nguồn, priority hay mục đích tự động hóa. Giữ song song cả label không tiền tố lẫn label có namespace đồng nghĩa cũng khiến ý nghĩa truy vấn và thực thi chính sách trở nên mơ hồ.

**Một tập hợp label duy nhất không phân biệt chiều.** Việc một label tồn tại không chứng minh được rằng cả ý định lẫn phạm vi ngữ nghĩa đều đã được cân nhắc.

**Danh sách khu vực cố định (allowlist) trong chính sách repo.** Khu vực lâu dài của repo sẽ tiến hóa. Namespace `area/*` vẫn có thể nhận diện được bằng máy móc, còn mô tả hiện hành mang danh sách có thể mở rộng.

**Khu vực suy ra theo package hoặc đường dẫn.** Khu vực mô tả tác động ngữ nghĩa vượt qua ranh giới package, còn đường dẫn thay đổi sẽ chứa test, tài liệu và file hỗ trợ bị chạm tới ngẫu nhiên.

**Đặt label riêng cho mỗi loại phương tiện giao phẩm hoặc vòng đời media.** Giao phẩm trình duyệt và Electron dùng chung một khu vực giao diện đồ họa, artifact, attachment và giao phẩm đa phương thức hiện tại cũng dùng chung một khu vực review/truy vấn. Chỉ nên tách khi việc tách có thể khôi phục một phân loại độc lập hữu ích, trong một lần thay đổi hệ thống phân loại sau này.

**Dùng label implementation rộng thay cho chủ đề sản phẩm hoặc kỹ thuật.** Một khả năng cụ thể không chỉ là công cụ, interface, hệ thống file hoặc implementation tiến trình của nó. Khu vực implementation tổng quát chỉ áp dụng khi hành vi hoặc API của chính nó thay đổi.

**Dùng label loại trên Issue.** Issue Type gốc đã đảm nhiệm phân loại này; dùng label sao chép thêm sẽ gây trôi dạt.

**Mỗi PR đúng một khu vực.** Một thay đổi có tính gắn kết có thể tác động thực chất tới nhiều API hoặc hành vi độc lập, bỏ khu vực phụ sẽ che giấu phạm vi bị ảnh hưởng.

## Hệ quả

Người review và automation có thể truy vấn riêng biệt ý định, phạm vi ngữ nghĩa, cách Issue được tạo, priority và điều kiện trigger workflow. Maintainer phải đọc nội dung thay đổi và mô tả label hiện hành, chứ không thể suy ra phân loại từ tiền tố tiêu đề hay đường dẫn. Khi một loại nào đó hoặc một ranh giới khu vực không hiển nhiên thay đổi, danh sách label hiện hành, cơ sở quyết định trong tài liệu này và việc thực thi chính sách phải được đồng bộ cập nhật; việc migrate hệ thống phân loại cũng sẽ phát sinh chi phí backfill lịch sử rõ ràng và chi phí xác thực.
