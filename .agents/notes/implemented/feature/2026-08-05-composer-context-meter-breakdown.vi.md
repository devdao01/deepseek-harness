# Agent Note: Vòng tròn mức chiếm dụng context của composer và bảng phân tích thành phần theo heuristic

Status: implemented

[English](2026-08-05-composer-context-meter-breakdown.md) | Tiếng Việt

## Vấn đề

Dòng thống kê của Web chat nhét tỷ lệ chiếm dụng context vào giữa các nhóm tính phí dưới dạng một con số inline (`Context N% of X`). Nó trả lời được câu hỏi «đầy bao nhiêu» nhưng không trả lời được «bị cái gì làm đầy»: không có chỗ nào cho thấy cửa sổ được phân bổ ra sao giữa system prompt, tool schema và hội thoại, mà một dòng thống kê đơn cũng không chứa nổi bảng phân tích đó. Những con số hiện có lại thuộc hai hệ quy chiếu khác nhau — quy mô prompt tính phí chính xác từ phía provider lấy từ `contextPressure`, và heuristic ký tự cố định của token-meter — và không giao diện sẵn có nào trình bày được thành phần mà không làm lẫn lộn hai hệ này.

## Quyết định

Ba phần phối hợp với nhau, mỗi phần ứng với một ranh giới package:

`dsh-session` export hàm thuần `deriveEventMessage(event)` (trước đây chỉ truy cập được qua một phương thức của `Session`, và phương thức đó nay ủy quyền cho nó), giúp fold phía host tính giá cho các node bề mặt mà không cần instance `Session`.

`dsh-token-meter` tách heuristic tính giá ra `src/estimate.ts`, tách phần fold bề mặt theo vị trí ra `src/surface-fold.ts` (cả hai đều dùng chung nguyên văn với service đo lường), và đăng ký một phép chiếu session thứ ba là `contextBreakdown`, mang theo `systemTokens` / `toolsTokens` / `messageTokens`. Con số envelope được tính giá lại trên mỗi `request/header` qua `canonicalHeader` theo nguyên tắc cái sau thắng; con số message thì phát lại `foldSurfaceTokens` trên danh sách `{seq, tokens}` theo từng node, nên tại mọi ranh giới sự kiện nó bằng `measure().surfaceTokens` theo kiến tạo, và compaction sẽ thu nhỏ nó đúng như cách thu nhỏ request kế tiếp. Phép fold dùng chung này là hàm toàn phần và luôn tạo mảng mới — trả về bề mặt kế tiếp thay vì sửa tại chỗ — nhờ đó giữ được giao dịch phát lại «kiểm tra trước, commit sau» ở phía service: khi ném lỗi thì con trỏ phát lại không tiến, và cùng một sự kiện dị dạng sẽ báo đúng lỗi đó khi thử lại. Phạm vi thay thế không tồn tại trong bề mặt được fold sẽ ném lỗi thẳng: log đã commit vốn đã qua kiểm tra bề mặt lúc append, nên một phạm vi không phân giải được là log hỏng, chứ không phải sự kiện có thể bỏ qua.

`ui-conversation` chuyển tỷ lệ chiếm dụng context ra khỏi dòng thống kê (một sự kiện một chỗ ở), đưa vào `ContextMeter` ở cuối composer: một vòng tròn chiếm dụng 14px đặt sau chỗ ngồi của model, lấy số từ `contextPressure`; nhấn vào sẽ bật lên một panel đặt phần trăm chính xác từ provider cạnh tiêu đề `~đã dùng / dung lượng`, thanh tiến trình phân đoạn 4px với màu phân biệt, và các dòng phân tích thành phần có tiền tố `~`. Hai hệ quy chiếu này cố ý không bao giờ đối chiếu với nhau — con số heuristic chỉ quyết định tỷ lệ tương đối giữa các đoạn màu trên thanh tiến trình và được hiển thị nguyên trạng ở các dòng phân tích; mỗi con số đều được đánh dấu `~`, vì heuristic cố định «4 ký tự ≈ 1 token» sẽ ước lượng thiếu một cách hệ thống với văn bản CJK và mã nguồn. (Khi ghi chép này được triển khai, vòng tròn, tiêu đề và tổng chiều dài thanh tiến trình lấy giá trị chính xác từ provider; nay chúng đọc `projectedTokens` được neo theo số đọc từ provider, vì mẫu thô không nhìn thấy compaction — xem [đồng hồ đo mù với compaction](../bug-fix/2026-08-05-context-meter-blind-to-compaction.md).) Tiêu đề là một câu bản địa hóa trọn vẹn (`context.aria`, dùng chung với accessible name của vòng tròn), được cắt ra để render tại vị trí `{percent}`, nhờ đó vị trí của số đọc do từng ngôn ngữ tự quyết định — tiếng Anh đặt trước, tiếng Trung đặt sau — đồng thời số đọc vẫn giữ kiểu nhấn mạnh riêng; đoạn nào tính ra chiều rộng bằng không thì không render, nếu không min-width của `.segment` sẽ vẽ ra một vệt màu ngay cả khi mức chiếm dụng là 0%.

## Phương án thay thế

**Suy ra thành phần từ cửa sổ đã tải ở phía client.** Cửa sổ là một hậu tố liên tục của log: sự kiện `request/header` mang system prompt và tool schema có thể nằm ngoài cửa sổ, còn phân trang lại khiến các con số thay đổi ngấm ngầm. Chỉ một phép chiếu bền vững ở phía host mới sống sót qua phân trang và compaction, và đó chính là lý do dữ liệu đi qua ranh giới dưới dạng phép chiếu thứ ba chứ không phải một fold của cửa sổ chat.

**Co giãn các dòng phân tích heuristic theo tỷ lệ để tổng bằng `pressureTokens`.** Ép đối chiếu là bịa ra độ chính xác: áp lực trễ một request và còn bao gồm chi phí đóng gói của provider mà bộ ước lượng không bao giờ mô hình hóa, khiến các dòng phân tích dao động ngay cả khi thành phần không hề đổi. Lựa chọn cuối cùng là hiển thị đúng hệ quy chiếu thật của bộ ước lượng, kèm dấu `~` tường minh.

**Phân loại chi tiết hơn (rules, skill, MCP tool, như `/context` của Claude Code).** Ở đây không tách được: harness đã gộp các đóng góp đó vào phần system text và danh sách tool từ trước khi request header tồn tại, nên ba hạng mục là độ phân giải trung thực.

## Hệ quả

token-meter nay đăng ký ba khóa phép chiếu; gỡ cài đặt sẽ xóa cả ba, và `contextBreakdown` khôi phục được từ checkpoint JSON (`stateVersion` bằng 1). Dòng thống kê đã bỏ nhóm Context, vòng tròn trở thành UI context duy nhất. Các dòng phân tích heuristic của panel không khớp với con số chính xác từ provider ở tiêu đề, đủ để mắt thường thấy được — điều này được chấp nhận và đánh dấu bằng tiền tố `~`; muốn nâng độ chính xác ước lượng (ví dụ đánh trọng số cho CJK) chỉ cần sửa `estimate.ts`, không đụng đến seam nào. Mã màu tím của đoạn trong chú giải là literal, vì design platform không có static token màu tím.
