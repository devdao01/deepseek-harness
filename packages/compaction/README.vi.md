# compaction/ — nhóm năng lực compaction

[English](README.md) | Tiếng Việt

Một nhóm năng lực compaction (nén) (xem [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)): Service Definition, bên cung cấp tóm tắt, dịch vụ đi kèm cắt tỉa kết quả công cụ không phụ thuộc mô hình, và Consumer lệnh người dùng. Tất cả đều là các package **sản phẩm**.

| Package | Trách nhiệm | ctx key |
|---|---|---|
| [`compaction/`](compaction/README.md) | Seam compaction & từ vựng sự kiện | `ctx.compaction` |
| [`compaction-basic/`](compaction-basic/README.md) | Áp lực token & backend tóm tắt | Đăng ký `ctx.compaction` |
| [`compaction-tool-result-pruner/`](compaction-tool-result-pruner/README.md) | Cắt tỉa kết quả công cụ không phụ thuộc mô hình (tùy chọn) | `ctx.toolResultPruner` |
| [`command-compact/`](command-compact/README.md) | Lệnh compaction của người dùng | Đăng ký vào `ctx.commands` |

Backend, bộ cắt tỉa tùy chọn và lệnh người dùng được kết hợp thông qua seam này; việc đo lường token vẫn là một dịch vụ độc lập thuộc nhóm LLM (large language model). [Agent Note về capability seam của compaction](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md) chịu trách nhiệm giải thích căn cứ thiết kế cho các phụ thuộc này.

Tài liệu tham khảo hệ thống con — các sự kiện `compaction/*`, `CompactionResult`, dịch vụ, kết quả cắt tỉa — xem [docs/subsystems/compaction.md](../../docs/subsystems/compaction.md); quyết định seam cố ý phụ thuộc vào `dsh-session`/`dsh-llm` được ghi lại trong [Agent Note về capability seam của compaction](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md).
