# Phân tích sự cố (postmortem)

[English](README.md) | Tiếng Việt

Phân tích sự cố ghi lại điều này: một bug đã xuất hiện ở nơi lẽ ra nó không được xuất hiện (người dùng thật, PR (Pull Request) đã merge, phiên bản đã phát hành), và điều đáng quan tâm là *vì sao quy trình của chúng ta để lọt nó*, chứ không chỉ là dòng mã sửa lỗi đó.

Phân tích sự cố không phải là [Agent Note](../../.agents/notes/README.md) (Agent Note ghi lại một quyết định thiết kế đã được cân nhắc kỹ cùng các phương án thay thế bị bác bỏ, hoặc đề xuất công việc tương lai). Nó là một bản ghi thất bại mang tính hồi cố: cái gì hỏng, cơ chế là gì, vì sao từng lớp lưới an toàn đều không chặn được, và đã bổ sung những biện pháp bảo vệ cụ thể nào để bảo đảm lần sau bug cùng loại sẽ báo lỗi rõ ràng.

Hãy viết phân tích sự cố khi một bug thỏa mãn các điều kiện sau: **khó thấy** (cơ chế không hiển nhiên, ngay cả kỹ sư cẩn thận cũng phải vất vả suy luận lại), **mang tính hệ thống** (nó lọt lưới vì lỗ hổng trong kiểm thử, công cụ hay quy ước, chứ không phải một lỗi đánh máy đơn lẻ), và **tốn kém khi phải phát hiện lại** (nó đã ngốn thời gian gỡ lỗi thực sự, và lần sau vẫn sẽ như vậy). Hãy liên kết tới các biện pháp bảo vệ mà bản phân tích sự cố đó thúc đẩy hình thành (kiểm thử, quy tắc trong AGENTS.md, ADR).

Mỗi bản phân tích sự cố mở đầu bằng một **tóm tắt điều hành**: một đoạn ngắn giúp người đọc bận rộn nắm được ý chính trong ba mươi giây — cái gì hỏng, nguyên nhân gốc nói nôm na là gì, vì sao nó lọt lưới, bài học dùng được lâu dài là gì — rồi mới đến các mục chi tiết «tổng quan, dòng thời gian, nguyên nhân gốc, biện pháp bảo vệ» phía sau.

| # | Tiêu đề |
|---|---|
| [0001](0001-acp-default-export-drops-inject.md) | Máy chủ ACP (Agent Client Protocol) sập khi kết nối: `export default` làm mất `inject` của plugin |
| [0002](0002-js-expression-disabled-filesystem-tools.md) | Tool chụp nhanh hệ thống tệp bị vô hiệu hóa vĩnh viễn bởi một đối tượng `!!js` nguyên văn |
| [0003](0003-web-agent-gui-feedback-loop.md) | Web agent (tác tử) xác minh máy chủ thay thế chứ không phải GUI đang chứa phiên của nó |
| [0004](0004-landlock-partial-notice-misclassified-child-failures.md) | Thông báo cưỡng chế một phần của Landlock khiến lỗi tiến trình con bị phân loại sai |
