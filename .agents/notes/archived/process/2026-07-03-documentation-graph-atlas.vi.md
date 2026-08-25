# Agent Note: Chỉ mục sơ đồ quan hệ tài liệu dành cho maintainer và người dùng SDK

Status: implemented

Archived: 2026-07-26

[English](2026-07-03-documentation-graph-atlas.md) | 中文

## Vấn đề

Repo đã có một số bề mặt tài liệu có độ tin cậy cao, mỗi cái bao phủ một chiều khác nhau: [module-graph.md](../../../../docs/module-graph.md) được sinh ra từ `peerDependencies` của các package; mục lục [sự kiện Cordis](../../../../docs/cordis-catalog/events.md) và [service](../../../../docs/cordis-catalog/services.md) được sinh ra từ khai báo `Events` và `Context` của Cordis; [tool-catalog.md](../../../../docs/tool-catalog.md) được sinh ra bằng cách khởi động các tool plugin đã publish; [core-data-structures/](../../../../docs/core-data-structures/core.md) dùng khối `ts type-equiv` để giữ định nghĩa type được dán vào đồng bộ với source code.

Các tài liệu tham khảo này chính xác, nhưng phần lớn mang tính mục lục. Maintainer vẫn phải tự tổng hợp các mối quan hệ: những package nào tạo thành một capability seam, ứng dụng nào lắp ráp một xương sống cụ thể, sự kiện nào là bền vững còn sự kiện nào là thời gian thực, hook hoặc policy plugin có thể chặn công việc ở đâu, và tool nào hướng đến model phụ thuộc vào service nào. Người dùng SDK gặp phải cùng vấn đề từ góc độ khác: "tôi muốn một hành vi nào đó, nên cài hoặc load package nào? nên mở rộng event/service/tool nào?"

Hệ thống con hook khiến topology sản xuất/tiêu thụ sự kiện và điểm chặn trở nên quan trọng hơn; seam hệ thống file khiến capability seam, policy veto, cách trình bày tool và đường lắp ráp SDK trở nên quan trọng hơn. Nếu phạm vi của sơ đồ quan hệ chỉ giới hạn ở một bề mặt nhỏ bash/todo/subagent, chúng sẽ nhanh chóng lỗi thời.

## Quyết định

Thêm tài liệu sơ đồ quan hệ được sinh tự động (generated), do các generator chuyên biệt tạo ra và lập chỉ mục tại [docs/graph-atlas.md](../../../../docs/graph-atlas.md); được kiểm chứng như một phần của `doc-sync`, thông qua `pnpm run verify-doc-graphs` / kiểm tra độ mới của mục lục hiện có.

Chỉ mục này là một lớp quan hệ trên nền các mục lục hiện có. Nó không thay thế tài liệu tham khảo chính xác, mà liên kết đến chúng và giải thích các phần kết hợp với nhau như thế nào.

### Chế độ bảo trì

Mỗi trang sơ đồ quan hệ khai báo một chế độ bảo trì:

- **Generated (sinh tự động)**: mọi node và edge đều được phát hiện từ source code; nếu sản phẩm đã commit bị lỗi thời, `--check` sẽ thất bại.
- **Hybrid generated (sinh tự động kết hợp)**: source code phát hiện danh sách, một manifest nhỏ phân loại các chính sách không thể thu gọn, guard kiểm tra tính đầy đủ sẽ thất bại khi mục được phát hiện chưa được phân loại.
- **Curated (biên soạn thủ công)**: sơ đồ giải thích ý định thiết kế, trình tự thời gian hoặc quy thuộc; nó được generator xuất ra để tài liệu sơ đồ quan hệ luôn là một tổng thể có thể sinh lại, nhưng nội dung được viết có chủ đích.

### Bộ chỉ mục phát hành đầu tiên

Chỉ mục này liên kết mười bề mặt quan hệ. Topology package và chức năng mà bộ tool package cung cấp nằm trong các mục lục sinh tự động hiện có vốn đã sở hữu các sự thật đó; các sơ đồ chuyên biệt còn lại do `scripts/gen-doc-graphs.ts` sinh ra.

| Sơ đồ quan hệ | Chế độ bảo trì | Nguồn chân lý |
|---|---|---|
| [Sơ đồ dependency giữa module](../../../../docs/module-graph.md) | Sinh tự động | Peer dependency của `packages/*/*/package.json` và đường dẫn nhóm package |
| [Mục lục schema tool và ánh xạ package](../../../../docs/tool-catalog.md) | Sinh tự động | Schema tool được thu thập sau khi khởi động, và metadata service/effect của tool package |
| [Capability seam và core service](../../../../docs/capability-seams.md) | Sinh tự động kết hợp | Khai báo service Cordis, và danh sách vai trò trong `gen-doc-graphs.ts` |
| [Lắp ráp ứng dụng tui-agent](../../../../examples/tui-agent/composition.md) | Sinh tự động kết hợp | Danh sách plugin `examples/tui-agent/cordis.yml`, và phần mở rộng ứng dụng/bundle được bảo trì thủ công |
| [Lắp ráp ứng dụng headless-agent](../../../../examples/headless-agent/composition.md) | Sinh tự động kết hợp | Danh sách plugin `examples/headless-agent/cordis.yml`, và phần mở rộng ứng dụng/bundle được bảo trì thủ công |
| [Lắp ráp ứng dụng cordis-agent](../../../../examples/cordis-agent/composition.md) | Sinh tự động kết hợp | Danh sách plugin `examples/cordis-agent/cordis.yml`, và phần mở rộng ứng dụng/bundle được bảo trì thủ công |
| [Lắp ráp ứng dụng acp-agent](../../../../examples/acp-agent/composition.md) | Sinh tự động kết hợp | Danh sách plugin `examples/acp-agent/cordis.yml` cộng phần mở rộng ứng dụng/bundle được biên soạn thủ công |
| [Ma trận sản xuất/tiêu thụ sự kiện](../../../../docs/event-producer-consumer.md) | Sinh tự động kết hợp | Khai báo sự kiện Cordis, vị trí `ctx.on/emit/parallel/serial/waterfall` được quét bằng AST, và các override phân phối động tường minh |
| [Vòng đời lượt và bước của agent](../../../../docs/agent-lifecycle.md) | Biên soạn thủ công | Vòng đời loop trong architecture.md, liên kết mục lục Cordis, và ngữ nghĩa sự kiện session |
| [Pipeline thực thi tool](../../../../docs/tool-execution-pipeline.md) | Biên soạn thủ công | Ngữ nghĩa pipeline tool và waterfall `tools/execute` |

### Vì sao generator sở hữu tài liệu

Topology package thuộc `gen-module-graph.ts`, ánh xạ capability tool-package thuộc `gen-tool-catalog.ts`, vì các generator này đã sở hữu sự thật có thẩm quyền và guard kiểm tra độ mới. `gen-doc-graphs.ts` sở hữu các trang quan hệ còn lại và chỉ mục. Cái giá phải trả là các sơ đồ biên soạn thủ công cần được chỉnh sửa trong khối chuỗi TypeScript, thay vì chỉnh sửa Markdown trực tiếp. Đối với phiên bản đầu tiên, điều này chấp nhận được, vì sản phẩm hướng đến người dùng vẫn là Markdown/Mermaid thuần túy; trong tương lai nếu trải nghiệm viết quan trọng hơn khả năng sinh lại, có thể tách các trang biên soạn thủ công ra riêng.

### Guard kiểm tra tính đầy đủ

Các trang sinh tự động kết hợp phải báo lỗi rõ ràng khi manifest của chúng lỗi thời:

- Sơ đồ module đọc `peerDependencies` của mỗi package, và nhóm package theo đường dẫn `packages/<group>/<pkg>`.
- Mục lục tool thu thập tool đã publish thông qua khởi động, và render ánh xạ package/service/effect từ cùng một manifest (guard kiểm tra tính đầy đủ của nó đã kiểm tra manifest này).
- Sơ đồ capability seam import bộ thu thập service Cordis, khẳng định mỗi `ctx.<key>` được phát hiện của harness đều đã được phân loại trong `SERVICE_ROLES`, và mỗi key đã phân loại vẫn còn tồn tại.
- Ma trận sản xuất/tiêu thụ sự kiện được đánh dấu là hybrid, vì các sự kiện vòng đời subagent cố ý dùng `ctx.events.dispatch` để cô lập theo từng listener; các edge động này là override tường minh chứ không phải sự bỏ sót âm thầm.
- `verify-mermaid` dùng chính bộ parser của Mermaid để parse mỗi hàng rào (fence) ` ```mermaid ` trong repo, do đó lỗi cú pháp được bắt cục bộ và trong giai đoạn `doc-sync` của CI, thay vì chỉ hiện ra thành sơ đồ hỏng khi GitHub render.

## Các phương án đã cân nhắc

Sơ đồ đã commit dùng Mermaid, vì GitHub render nó gốc (native) trong Markdown và không đưa thêm dependency build tài liệu mới; dữ liệu nhiều-nhiều dày đặc (như quan hệ sản xuất/tiêu thụ sự kiện) đổi sang bảng Markdown. **PlantUML, dịch vụ vẽ sơ đồ được host, và SVG sinh ra** đã từng được cân nhắc, nhưng cố ý không áp dụng cho đến khi Mermaid trở thành nút thắt cổ chai.

## Hậu quả

- Maintainer có được lối vào trực quan cho topology, seam, luồng sự kiện, vòng đời và lắp ráp ứng dụng.
- Người dùng SDK có được đường đi từ use case đến việc lắp ráp package, thay vì chỉ có tài liệu tham khảo package từ dưới lên.
- `doc-sync` giờ bao gồm `verify-doc-graphs` và `verify-mermaid`, do đó việc lệch sơ đồ quan hệ và lỗi cú pháp Mermaid được bắt cùng các guard kiểm tra độ mới tài liệu khác.
- Công việc hệ thống file và hook trong tương lai có vị trí cụ thể để mang thêm độ phức tạp mới: hệ thống file nên mở rộng tài liệu capability và mục lục tool, hook nên mở rộng ma trận sự kiện và pipeline thực thi tool.
