# Agent Note: Gỡ `GenerateOptions.prefill` và `ToolSchema.strict` — những núm xoay request không có đường đi khả dụng đầu-cuối

Status: implemented
Archived: 2026-07-26

[English](2026-07-04-drop-inert-request-knobs.md) | Tiếng Việt

## Vấn đề

Hai núm xoay trong contract request chạy xuyên suốt cả pipeline request, nhưng đều không tạo ra bất kỳ tác dụng nào:

- **`prefill`** (`packages/llm/llm/src/types.ts`) không có setter ở cấp production: agent loop (vòng lặp tác tử) lắp ráp `model`/`system`/`tools`/`messages` cùng `sessionId`/`signal`, backend context compaction (nén ngữ cảnh) chỉ nối thêm `maxTokens`; hơn nữa cả hai adapter đều từ chối nó: `packages/llm/llm-deepseek/src/serialize.ts` và `packages/llm/llm-pi-ai/src/adapter.ts` mỗi bên đều ném `LlmError('UNSUPPORTED')` khi `prefill` khác undefined. Toàn bộ hành vi quan sát được của trường này chỉ là hai lệnh throw, mỗi lệnh được cố định bởi một bài kiểm thử adapter. Chat-prefix completion của DeepSeek là tính năng Beta, chạy trên một base URL mà cả hai adapter đều không trỏ tới.
- **`strict`** (`ToolSchema`, cùng tệp) đi xuyên qua `DefineToolOptions`/`defineTool` (`packages/core/tools/src/schema.ts`), danh sách cho phép `schemas()` của registry (`packages/core/tools/src/index.ts`), ánh xạ định dạng giao thức (wire format) của deepseek (`packages/llm/llm-deepseek/src/serialize.ts`, với chú thích wire-type ghi rằng chế độ strict cần base URL `/beta` mà adapter không dùng), logic vá payload theo từng công cụ trong `packages/llm/llm-pi-ai/src/adapter.ts`, và dòng `Strict:` có điều kiện trong trình dựng tool-catalog (`scripts/gen-tool-catalog.ts`). Không công cụ nào đã phát hành đặt giá trị cho nó — chạy `rg` trên src của mọi package `tool-*` và trong `examples/`, số bên sinh ra `strict:` là con số không; setter duy nhất xuất hiện trong kiểm thử đơn vị của dsh-tools.

Hai núm xoay này đối xứng giữa các adapter, nên thao tác gỡ bỏ tách chúng khỏi cả hai adapter song sinh cùng lúc — [thiết kế adapter song sinh](../architecture/2026-06-13-twin-llm-adapters.md) không bị ảnh hưởng.

## Quyết định

- Gỡ `prefill` khỏi `GenerateOptions`, đồng thời gỡ các guard UNSUPPORTED của hai adapter, các bài kiểm thử cố định hành vi ném lỗi, dòng dán trong [core.md](../../../../docs/core-data-structures/core.md), và dòng bảng trong README adapter ghi lại hành vi từ chối đó. Hướng dẫn UNSUPPORTED trong sổ tay thực hành ([adding-an-llm-adapter.md](../../../../docs/cookbook/adding-an-llm-adapter.md)) chuyển sang cách diễn đạt tổng quát — trường `GenerateOptions` mà nhà cung cấp không tuân thủ được thì nên ném `LlmError(..., 'UNSUPPORTED')` — thay vì lấy prefill làm ví dụ. Hệ quả của [Agent Note về từ vựng khối nội dung (bản ghi quyết định của agent)](../architecture/2026-06-11-content-block-vocabulary.md) theo [implemented/AGENTS.md](../AGENTS.md) ghi nhận prefill là bị chặn bởi bên sản xuất, chứ không phải đã có chủ sở hữu.
- Gỡ `strict` khỏi `ToolSchema`, `DefineToolOptions`, `defineTool`, danh sách cho phép `schemas()`, nhánh tuần tự hóa deepseek cùng trường wire-type của nó, và dòng `Strict:` của trình dựng danh mục công cụ. Logic vá payload của pi-ai được đơn giản hóa thành việc xóa vô điều kiện giá trị mặc định strict theo từng công cụ của chính pi-ai (pi-ai gắn `strict: false` lên mọi công cụ được tuần tự hóa; adapter song sinh viết tay không gửi trường này, nên logic xóa được giữ lại để duy trì tính tương đương định dạng giao thức, và được cố định bởi kiểm thử serializer của nó). Bài kiểm thử setter và dòng dán trong core.md đã bị gỡ; `GenerateOptions` và `ToolSchema` vẫn giữ dòng của mình trong `scripts/type-equiv.manifest.json`, vì hai kiểu này chỉ thiếu đi một trường chứ bản thân chúng vẫn tồn tại.

Agent Note này cố ý không đụng tới `temperature`, `stop` hay `maxTokens`: cả hai adapter đều tuân thủ chúng đầu-cuối, và chúng đương nhiên là nhóm mục tiêu đầu tiên của các plugin hook sửa đổi request trên `agent/request`.

## Các phương án từng cân nhắc

### Vì sao không giữ lại?

«Lệnh throw UNSUPPORTED tường minh là hành vi contract trung thực» — nhưng một núm xoay mà hiện thực duy nhất trong cả hai adapter song sinh là từ chối thì chẳng hứa hẹn điều gì; xóa nó còn nâng cấp chế độ thất bại: một setter vô ý trở thành lỗi biên dịch thay vì lỗi throw lúc chạy. «Tuân thủ strict schema là tính năng nhà cung cấp có tài liệu chính thức, và đường ống đã hoàn chỉnh» — nhưng một núm xoay chỉ trở thành bề mặt sản phẩm khi đã có công cụ phát hành đặt nó và có endpoint thực thi nó; hôm nay cả hai đều chưa thành. Chúng sẽ quay lại cùng với bên sản xuất thật đầu tiên của mình: `prefill` quay lại cùng adapter hiện thực chat-prefix completion (và một chính sách rõ ràng cho adapter không hỗ trợ tính năng đó); `strict` quay lại cùng công cụ cần nó và phương án dùng endpoint beta.

## Kiểm chứng

`rg prefill` chỉ trả về các bản ghi Agent Note (bài này và hệ quả bị chặn bởi bên sản xuất trong [Agent Note về từ vựng khối nội dung](../architecture/2026-06-11-content-block-vocabulary.md)); `rg strict` giới hạn trong phạm vi schema công cụ chỉ trả về Agent Note này, logic dọn dẹp pi-ai còn lại, và các nội dung không liên quan như `strictEqual`. Kiểm thử contract của cả hai adapter đều vượt qua khi không còn guard, còn phần hiệu chỉnh pi-ai vẫn dọn giá trị mặc định strict của thư viện — kiểm thử serializer của nó cố định tính nhất quán của giao thức đường truyền.

## Hệ quả

Cầu nối hook đã phát hành không đặt trường request nào, còn plugin sửa đổi request (bộ lắng nghe waterfall (sự kiện thác nước) `agent/request`) dùng `temperature`/`stop` (được giữ lại và khả dụng), chứ không dùng các trường bị adapter từ chối. Nếu chat-prefix completion hoặc chế độ strict trở thành tính năng sản phẩm, việc thêm lại sẽ đi kèm với công việc adapter/endpoint, và khi đó contract có thể nói rõ điều gì thực sự xảy ra, thay vì «mọi người đều throw».
