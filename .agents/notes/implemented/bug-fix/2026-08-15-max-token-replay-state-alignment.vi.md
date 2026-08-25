# Agent Note: Trạng thái phát lại và nội dung đã lắp ráp được căn theo đúng cấu trúc

Status: implemented

[English](2026-08-15-max-token-replay-state-alignment.md) | Tiếng Việt

## Vấn đề

pi-ai ghi lại cho mỗi response một dữ liệu phát lại (replay) không minh bạch, được chiếu ra từ message gốc của nhà cung cấp, trong khi `BlockAssembler.blocks()` lại tách riêng việc loại bỏ tool call khỏi response `max-tokens`, vì lời gọi bị cắt ngang không thể thực thi an toàn. Vì vậy, message assistant đã lưu bền giữ nội dung đã biến đổi cùng với metadata mô tả danh sách block gốc chưa biến đổi. Request kế tiếp thất bại ở bước dựng lại lịch sử với `INVALID_REPLAY_STATE: block count does not match assistant content`; vì sự không nhất quán đã được ghi xuống đĩa, mọi request sau đó trong session này đều thất bại theo cùng cách — session bị kẹt vĩnh viễn. Nguyên nhân gốc mang tính cấu trúc: hai biểu diễn của cùng một response chụp snapshot riêng ở các vị trí khác nhau trong pipeline, và việc căn chỉnh chỉ số giữa chúng chỉ được giữ vững nhờ một lỗi cứng khi đọc.

## Quyết định

Hai thay đổi, mỗi thay đổi bao phủ một phía của ranh giới lưu bền.

**Phía ghi — một quyết định giữ/bỏ duy nhất.** `replayState` của phân đoạn finish trở thành một `ReplayEnvelope` có kiểu: một nửa `response` không minh bạch, cộng với các mục từng-block không minh bạch tùy chọn, được căn theo đúng chuỗi block đã phát ra. `BlockAssembler` chỉ tính quyết định giữ/bỏ đúng một lần, và áp dụng nó đồng thời cho cả block lẫn mục từng-block, nên bất kỳ biến đổi nào mà việc lắp ráp thực hiện — hôm nay là loại bỏ tool call do max-token, hoặc biến đổi khác trong tương lai — đều tự động cắt bỏ metadata tương ứng theo đúng cấu trúc. Block được giữ lại vẫn giữ mục của nó, nên response bị cắt vẫn giữ được chữ ký cho phần reasoning và text mà nó còn giữ lại. Dữ liệu có số mục không khớp với số block đã phát bị loại bỏ toàn bộ (một adapter phát sai không được phép công bố metadata gán sai). pi-ai tách trạng thái phẳng cũ thành nửa response phiên bản 2 và các mục chữ ký từng-block.

**Phía đọc — nội dung đã lưu bền là bản ghi có thẩm quyền.** `toPiAssistant` coi trạng thái phát lại là metadata về độ trung thực, chứ không phải input mang tính chịu tải: bất kỳ trạng thái nào phía đọc không dùng được — kind của adapter khác, phiên bản khác (kể cả dạng phẳng phiên bản 1 đã lưu xuống đĩa), metadata sai định dạng, hoặc cấu trúc block không còn khớp với nội dung — đều hạ cấp message đó về phép biến đổi không phụ thuộc nhà cung cấp sẵn có, và báo cáo chẩn đoán `INVALID_REPLAY_STATE` qua hook `onReplayDegrade` của plugin (logger cảnh báo). Request vẫn tiếp tục thực thi. Chính điều này giúp những session đã bị nhiễm độc trước thay đổi này có thể tiếp tục thay vì báo lỗi vĩnh viễn, đồng thời giới hạn mọi nguồn phân kỳ trong tương lai chỉ còn ở mức mất độ trung thực của một message đơn lẻ.

## Kiểm chứng

Test unit của assembler chứng minh việc cắt bớt, việc loại bỏ khi lệch vị trí, và việc truyền qua nguyên trạng dữ liệu chưa biến đổi hoặc không có mục từng-block. Test unit của pi-ai chứng minh việc round-trip dữ liệu phiên bản 2, và mọi case trạng thái không hợp lệ trước đây từng ném lỗi nay đều hạ cấp thành phép biến đổi không phụ thuộc nhà cung cấp kèm chẩn đoán. Test hồi quy của agent loop cho một response văn bản kèm tool call bị cắt đi qua toàn bộ quy trình lưu bền, và chứng minh request kế tiếp mang theo dữ liệu đã cắt. Test lắp ráp thật không cần khóa (keyless) khởi động `dsh-llm-pi-ai` qua loader, chứng minh việc tiếp tục hội thoại gốc sau khi cắt mà không có `tool_calls`, và tiếp tục thành công trên cả message ở trạng thái phẳng cũ mà số block không còn khớp. Kịch bản snapshot keyless viết tay `max-tokens-continue` chốt log lưu bền của ứng dụng đã lắp ráp qua đường ACP subprocess thật — lượt bị cắt, dữ liệu đã cắt trên message đã lưu, và lượt tiếp tục.

## Các phương án đã cân nhắc

**Ngăn toàn bộ trạng thái phát lại khi việc lắp ráp loại bỏ tool call.** Có hiệu quả với phép biến đổi duy nhất hôm nay, nhưng lại suy ra lại điều kiện loại bỏ ở một chỗ khác cạnh `blocks()` (hai chỗ đó sẽ trôi lệch nhau âm thầm), làm mất chữ ký hợp lệ của những block được giữ lại, và khiến phân kỳ khi đọc — trước tiên là các session cũ đã lưu xuống đĩa — vẫn là lỗi cứng.

**Giữ trạng thái và nới lỏng việc kiểm tra số block của pi-ai, dán được bao nhiêu thì dán.** Bị bác bỏ: chữ ký đã căn theo chỉ số mà dán vào một danh sách block khác sẽ trình bày cho nhà cung cấp một lịch sử gốc giả. Việc hạ cấp thì không dán gì cả.

**Để mỗi adapter tự viết lại trạng thái của mình sau khi lắp ráp.** Bị bác bỏ: cách này đẩy nghĩa vụ sang cho adapter, vốn chỉ giữ dữ liệu không minh bạch; envelope chỉ đưa vào từ vựng dùng chung đúng phần cấu trúc cần thiết — không hơn — để một quyết định duy nhất của assembler có thể tự động viết lại một cách máy móc.

## Ảnh hưởng

Việc tiếp tục hội thoại sau một response max-token có chứa tool call giờ hoạt động được, block được giữ lại vẫn giữ chữ ký gốc, và được phát lại như message pi-ai gốc. Với các session đã được ghi lại trước thay đổi này, những message assistant bị ảnh hưởng sẽ được phát lại như nội dung không phụ thuộc nhà cung cấp (kèm chẩn đoán) thay vì làm lượt đó thất bại; hình dạng `replayState` lưu xuống đĩa thay đổi trong tư thế chưa cam kết tương thích trước phát hành — dạng phẳng cũ được xử lý qua cùng đường hạ cấp đó. Với trạng thái không dùng được, điều này thay thế quy tắc lỗi cứng khi đọc trong [quyết định adapter LLM định tuyến theo nhà cung cấp](../architecture/2026-07-14-provider-routed-llm-adapters.md); bản thân việc kiểm tra hợp lệ không đổi, vẫn chạy trước bất kỳ lần dựng lại gốc nào.
