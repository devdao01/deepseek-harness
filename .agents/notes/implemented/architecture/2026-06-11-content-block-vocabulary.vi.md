# Agent Note: Từ vựng content block độc lập với provider do dsh-llm sở hữu

Status: implemented

[English](2026-06-11-content-block-vocabulary.md) | Tiếng Việt

## Vấn đề

harness cần một ngôn ngữ message nội bộ thống nhất để agent loop (vòng lặp tác tử), session log và mọi plugin cùng dùng.

## Quyết định

Tự sở hữu từ vựng: message là mảng các content block có kiểu (`text`, `reasoning`, `tool-call`, `tool-result`), với union type dẫn xuất từ `ContentBlockMap` có thể mở rộng bằng cách hợp nhất, và plugin thêm kiểu block mới qua declaration merging. Cùng mô hình map mở rộng-bằng-hợp-nhất đó cung cấp kiểu cho mọi trường dạng "chuỗi hóa" (`MessageSource`, `FinishReason`, `TurnTrigger`, `TurnEndReason`). Output stream dùng giao thức phân mảnh nguyên bản; `BlockAssembler` là bản cài đặt lắp ráp dùng chung duy nhất. Adapter chịu trách nhiệm chuyển đổi sang định dạng giao thức của provider (wire format) — chi phí ánh xạ ở lại trong adapter, đúng nơi nó thuộc về.

Việc chèn context trong phiên (`context/message`) và steering (điều hướng giữa chừng) giữa lượt ban đầu được render thành phong bì user-role có gắn nhãn (mô hình system-reminder) thay vì thêm role mới, nhờ vậy adapter không phải gánh thêm gì. Nay cả hai đều được chiếu thành nội dung user thông thường không bọc; xem [Agent Note về phong bì nội dung chèn](../simplification/2026-07-20-unwrap-injected-content-envelopes.md). Kiểm chứng trên adapter thực tế đã xác nhận cách render này phù hợp với hành vi hiện tại của DeepSeek; nếu sau này có provider nào không tương thích thì phải xử lý bên trong adapter đó, chứ không thêm role chuẩn mới.

## Các phương án từng cân nhắc

- **Phản chiếu cấu trúc chat-completions của DeepSeek/OpenAI**: chi phí ánh xạ bằng không với provider đầu tiên, nhưng bất tiện khi xử lý nội dung phong phú (reasoning, tool result ở dạng block có cấu trúc).
- **Dùng nguyên cấu trúc block của Anthropic Messages**: đã được kiểm chứng thực chiến, nhưng kiểu chuẩn mực khi đó sẽ phản chiếu một API bên thứ ba mà harness không nhắm tới trước tiên.

## Hệ quả

- Reasoning có nơi thuộc về ở tầng core, không cần dựa vào cấu trúc riêng của provider.
- Block đa phương thức chỉ quay lại khi cả ba phía adapter, UI và context compaction (nén context) cùng hỗ trợ; xem [Agent Note drop-image](../simplification/2026-07-04-drop-image-content-block.md).
- Gợi ý cache và assistant prefill vẫn vắng mặt cho tới khi có adapter thực sự hiện thực được chúng; xem Agent Note [Biến thể từ vựng không có bên sản xuất](../../archived/simplification/2026-07-04-prune-producerless-vocabulary-variants.md) và [Núm điều chỉnh request không có đường dùng end-to-end](../../archived/simplification/2026-07-04-drop-inert-request-knobs.md).
- Mỗi adapter phải gánh chi phí dịch; nhóm adapter thật đầu tiên đã kiểm chứng giao thức output stream, và adapter mới nên tiếp tục kiểm chứng phần ánh xạ riêng của provider trong test cục bộ của adapter.
- ID vượt ranh giới package dùng branded type (`CallId`, `SessionId` dùng chung giữa agent và session) — kiểu danh nghĩa với chi phí lúc chạy bằng không.
