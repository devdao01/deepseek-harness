# Agent Note: Cắt tỉa các biến thể từ vựng không có bên sản xuất (gợi ý cache khối, nguồn tin nhắn `agent`, trigger lượt `continuation`)

Status: implemented
Archived: 2026-07-26

[English](2026-07-04-prune-producerless-vocabulary-variants.md) | Tiếng Việt

## Vấn đề

Các bảng ánh xạ từ vựng có thể mở rộng bằng hợp nhất được thiết kế để lớn lên qua declaration merging, và kho mã đã nêu rõ chính sách kết nạp trên `TurnEndReasonMap` (`packages/core/session/src/types.ts`): những biến thể như `refusal` «cố ý không được đưa vào trước khi một adapter hay vòng lặp phát nó ra lần đầu». Ba mục từ vựng đã khai báo vi phạm chính sách đó — mỗi mục đều không có bên sản xuất lẫn bên tiêu thụ, và hai trong số đó thậm chí không có cả kiểm thử:

- **`CacheHint` trên `TextBlock`/`ToolResultBlock` cùng trường khối `cache?: CacheHint` của nó** (`packages/llm/llm/src/types.ts`; khối hình ảnh từng có trường thứ ba loại này, đã bị gỡ cùng khối hình ảnh — xem [Agent Note bỏ khối hình ảnh (bản ghi quyết định của agent)](2026-07-04-drop-image-content-block.md)). Không nơi nào dựng khối với `cache:` — src, kiểm thử và các đoạn dán tài liệu đều rỗng — và cả hai adapter cũng không đọc `.cache`: cache prompt của DeepSeek là tự động, nên adapter ánh xạ ra `prompt_cache_hit_tokens` từ phản hồi, chứ không bao giờ gửi hint vào request. Đây là một bề mặt kiểu `cache_control` của Anthropic mà không nhà cung cấp nào có thể tuân thủ.
- **`MessageSourceMap.agent`** (`{ kind: 'agent'; agentId: string }`, cùng tệp). Không có điểm dựng nào, kể cả trong kiểm thử. Bên sản xuất mà nó kỳ vọng lại không dùng tới nó khi hiện thực: backend subagent gửi prompt của cấp cha xuống cấp con mà không kèm `source`, nên được ghi là `{ kind: 'user' }`, và renderer phong bì dùng chung khi nội suy `source.kind` cũng chưa từng định tuyến cho nó.
- **`TurnTriggerMap.continuation`** (`packages/core/session/src/types.ts`). Agent loop (vòng lặp tác tử) về mặt cấu trúc không thể phát ra nó — continuation xảy ra *bên trong* một lượt dưới dạng bước tiếp theo, chứ không phải như một lượt mới — vòng lặp chỉ dựng trigger `message` và `injection`. Bên ghi duy nhất là một fixture kiểm thử (dữ liệu chuẩn bị cho kiểm thử) dựng thủ công, vốn chỉ cần một trigger bất kỳ khác message (`packages/support/llm-replay/tests/llm-replay.spec.ts`), mà trigger `injection` cũng đáp ứng được; bên đọc trigger duy nhất trong môi trường production là cầu nối ACP (Agent Client Protocol), và nó chỉ lọc `kind === 'message'`.

## Quyết định

`CacheHint`, trường khối `cache?` của nó, biến thể nguồn tin nhắn `agent` và biến thể trigger lượt `continuation` đều đã bị xóa: từ vựng đã phát hành không còn mang chúng. Fixture llm-replay dùng trigger `injection` (bất kỳ trigger nào khác `message` đều đáp ứng mục đích của nó). Các đoạn dán type-equiv trong [core.md](../../../../docs/core-data-structures/core.md) và [session.md](../../../../docs/core-data-structures/session.md) khớp với map sau khi cắt tỉa — hai ký hiệu vẫn giữ dòng của mình trong `scripts/type-equiv.manifest.json`, vì mỗi map chỉ thiếu đi một thành viên và vẫn tiếp tục tồn tại — và hệ quả của [Agent Note về từ vựng khối nội dung](../architecture/2026-06-11-content-block-vocabulary.md) theo [implemented/AGENTS.md](../AGENTS.md) ghi nhận cache hint là bị chặn bởi bên sản xuất, chứ không phải đã có chủ sở hữu.

Mỗi biến thể sẽ trở lại vào ngày nó có bên sản xuất thật sự, và đó chính là cách mà bảng ánh xạ được thiết kế để lớn lên: tính năng cache sẽ thêm lại `cache` cùng với adapter truyền tải nó; việc quy thuộc subagent sẽ thêm lại `agent` cùng với backend gắn nhãn và consumer định tuyến nó; tính năng tự động tiếp tục thực sự khởi động một lượt mới sẽ thêm lại `continuation` cùng với plugin phát ra nó.

## Các phương án từng cân nhắc

### Vì sao không giữ chúng lại?

[Agent Note về từ vựng khối nội dung](../architecture/2026-06-11-content-block-vocabulary.md) từng liệt kê "cache hint… đã có chủ sở hữu" như một hệ quả thiết kế, và việc để dành sẵn ô trống quả thật cho thấy ý định. Nhưng ô trống là một bề mặt contract mà mọi implementation và consumer đều phải cân nhắc (adapter của tôi có buộc phải tuân thủ `cache` không? Renderer của tôi có buộc phải định tuyến nguồn `agent` không?), trong khi chính JSDoc của map liền kề đã bác bỏ chuyện "để dành trước khi có bên phát" — `refusal` và `max_turn_requests` được nêu đích danh là những biến thể chỉ thêm vào *khi lần đầu có thứ gì đó phát ra chúng*, chứ không khai báo trước. Bắt các biến thể đã khai báo nhưng vô dụng tuân theo cùng tiêu chuẩn mới khiến từ vựng thực sự có ý nghĩa: hễ đã nằm trong map thì phải có thứ gì đó sản xuất ra nó.

## Kiểm chứng

Chạy `rg` cho `CacheHint`, cách viết nguồn tin nhắn `agent` và cách viết trigger `continuation` chỉ trả về các bản ghi Agent Note (bài này, cùng phần [Agent Note bỏ khối hình ảnh](2026-07-04-drop-image-content-block.md) nói về trường `cache` của chính khối hình ảnh); fixture llm-replay dùng trigger `injection` để khẳng định cùng hành vi phát lại; các đoạn dán cấu trúc dữ liệu lõi và bản kê type-equiv vẫn đồng bộ.

## Hệ quả

Hành vi vận hành không thay đổi — vốn dĩ đã không có gì dựng ra được các giá trị này. Việc gỡ sự kiện mirror ([Agent Note về mirror ranh giới](2026-06-20-remove-agent-boundary-mirror-events.md), [Agent Note về phân mảnh luồng](2026-07-02-remove-stream-chunk-mirror.md)) chỉ chạm tới các sự kiện `agent/*` nhất thời, không bao giờ chạm vào từ vựng bền, nên không có xung đột. Những nơi khác vốn đã tuân thủ chính sách kết nạp: `rejected`, `prompt/blocked` và `hook/invoked`/`hook/result` đều có bên sản xuất thực tế — Agent Note này mở rộng cùng ngưỡng đó cho ba biến thể thiếu bên sản xuất. Trường `cache?` của chính khối hình ảnh thuộc về [Agent Note bỏ khối hình ảnh](2026-07-04-drop-image-content-block.md), nơi đã gỡ nó cùng với khối đó; Agent Note này bao phủ hai trường trên các loại khối còn lại.
