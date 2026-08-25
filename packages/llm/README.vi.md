# llm/ — họ năng lực LLM

[English](README.md) | Tiếng Việt

LLM (mô hình ngôn ngữ lớn) seam và các adapter nhà cung cấp của nó. Package `llm` đồng thời đảm nhận vai trò Service Definition và Consumer: dịch vụ trừu tượng, từ vựng khối nội dung và bộ lắp ráp mảnh (chunk) streaming. Adapter nhà cung cấp đăng ký vào `ctx.llm`. Tất cả đều là các package **sản phẩm**.

| Package | Trách nhiệm | ctx key |
|---|---|---|
| [`llm/`](llm/README.md) | Dịch vụ LLM và từ vựng streaming dùng chung | `ctx.llm` |
| [`token-meter/`](token-meter/README.md) | Đo token có nhận biết replay | `ctx.tokenMeter` |
| [`llm-retry/`](llm-retry/README.md) | Chính sách retry theo phạm vi nhà cung cấp | Lắng nghe `agent/request-error` |
| [`llm-deepseek/`](llm-deepseek/README.md) | Adapter DeepSeek trực tiếp | Đăng ký vào `ctx.llm` |
| [`llm-pi-ai/`](llm-pi-ai/README.md) | Adapter pi-ai đa nhà cung cấp | Đăng ký vào `ctx.llm` |

Adapter đăng ký route nhà cung cấp trên seam; retry và đo token vẫn là bên tiêu thụ độc lập. README con chịu trách nhiệm về routing, metadata, replay và chi tiết giao thức nhà cung cấp; [Quyết định kiến trúc LLM](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.md) giải thích lý do thiết kế.

Tham chiếu phân hệ — message và khối nội dung, request model, giao thức `StreamChunk`, quy ước adapter (adapter contract) — xem [docs/subsystems/llm-streaming.md](../../docs/subsystems/llm-streaming.md) (đo token: [token-meter.md](../../docs/subsystems/token-meter.md)); xem thêm các Agent Note [adapter song sinh](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.md), [đo token replay](../../.agents/notes/implemented/architecture/2026-07-15-replay-token-meter-service.md) và [ngữ cảnh model theo route](../../.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.md).
