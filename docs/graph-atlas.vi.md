<!-- Tệp nguồn tiếng Anh do scripts/gen-doc-graphs.ts sinh ra; tệp tiếng Việt này là bản đối ứng đã qua đánh giá, được duy trì theo cặp song ngữ.
     Khi cập nhật, trước hết chạy `pnpm run gen-doc-graphs` để cập nhật bản tiếng Anh, sau đó cập nhật tệp này rồi chạy `pnpm run verify-translation-pairing --write docs/graph-atlas.md` để ghi lại cặp. -->

# Mục lục đồ thị tài liệu

[English](graph-atlas.md) | Tiếng Việt

Những đồ thị này thể hiện các quan hệ mà danh mục được sinh ra không bao gồm. Bạn có thể dùng chúng để tra cứu quan hệ giữa các package, capability seam, luồng sự kiện, các tool hướng tới model, cách tổ hợp ứng dụng và các đường vòng đời runtime. Chữ ký chính xác và định nghĩa kiểu vẫn lấy [trang subsystem](subsystems/core.md) (phần kiểu và vùng `cordis-surface` được sinh ra) cùng [danh mục tool](tool-catalog.md) làm căn cứ.

Quyết định về quy trình đằng sau mục lục này được ghi trong [Agent Note về đồ thị tài liệu](../.agents/notes/archived/process/2026-07-03-documentation-graph-atlas.md).

| Đồ thị | Chế độ |
| --- | --- |
| [Đồ thị phụ thuộc module](module-graph.md) | `generated` |
| [Danh mục tool schema và ánh xạ package](tool-catalog.md) | `generated` |
| [Capability seam và các service lõi](capability-seams.md) | `hybrid generated` |
| [Tổ hợp nền tảng dùng chung của dsh](../apps/cli/composition.md) | `hybrid generated` |
| [Tổ hợp ứng dụng headless-agent](../examples/headless-agent/composition.md) | `hybrid generated` |
| [Tổ hợp ứng dụng acp-agent](../examples/acp-agent/composition.md) | `hybrid generated` |
| [Ma trận bên sản xuất／bên tiêu thụ sự kiện](event-producer-consumer.md) | `hybrid generated` |
| [Vòng đời lượt và bước của agent (tác tử)](agent-lifecycle.md) | `curated` |
| [Pipeline thực thi tool](tool-execution-pipeline.md) | `curated` |

Chạy `pnpm run gen-doc-graphs` để sinh lại tệp nguồn tiếng Anh; chạy `pnpm run verify-doc-graphs` để xác minh độ mới của nguồn tiếng Anh, còn bản đối ứng tiếng Việt được duy trì theo cặp song ngữ.

Chế độ bảo trì của tệp nguồn tiếng Anh là hỗn hợp. Mỗi trang được liên kết đều khai báo chế độ nguồn tiếng Anh của nó là được sinh ra, hỗn hợp hay do người viết; tệp tiếng Việt này là bản đối ứng đã qua đánh giá, được duy trì theo cặp song ngữ.
