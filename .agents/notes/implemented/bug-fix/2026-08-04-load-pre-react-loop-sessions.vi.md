# Agent Note: Nạp các session có định dạng trước khi tái cấu trúc react-loop

Status: implemented

[English](2026-08-04-load-pre-react-loop-sessions.md) | Tiếng Việt

## Vấn đề

Việc đơn giản hóa react-loop đã thay đổi các event được lưu bền vững trong khi vẫn giữ `SESSION_FORMAT_VERSION` bằng 0. Những session được lưu ở mốc cơ sở của thay đổi đó chứa event steering (điều hướng giữa chừng) `steering/message`, cùng trường `turn/start.trigger`; lý do kết thúc của chúng còn dùng `aborted` ở mức thô, `disposed` riêng biệt và hai loại payload lỗi kiểu cũ. Các bất biến về bề mặt và về lượt hiện tại không thể phát lại trực tiếp những bản ghi này.

Inbox bền vững mới không thuộc vấn đề tương thích này. Mốc cơ sở đó phát ra thông báo inbox cục bộ trong tiến trình chứ không sinh ra event session `agent/inbox/*`, nên nếu phát lại lịch sử cũ thành công việc đang chờ thì các prompt đã được nhận hoặc đã bị bỏ sẽ chạy lại lần nữa.

## Quyết định

`PersistenceCoordinator` nhận diện đúng hình dạng trước khi tái cấu trúc react-loop sau khi backend giải mã, rồi chiếu nó sang view đọc hiện tại. Nó loại bỏ `turn/start.trigger` đã bị bỏ, chuyển `steering/message` thành cùng một `user/message` có mang định danh, ánh xạ các sự kiện thất bại kiểu cũ sang lỗi có cấu trúc hiện tại, gộp `disposed` thành lượt đã hủy với lý do `disposed`, và biểu diễn bản ghi hủy mức thô bằng lý do `{ kind: 'legacy' }` chỉ dùng cho việc import từ tầng lưu trữ, vì không thể biết được bên gọi của chúng.

Coordinator áp dụng phép chiếu này cho `load`, `inspect`, tiếp quản, so sánh tiền tố HMR (thay thế module nóng) và `readFrom`. `readFrom` có thể định địa chỉ thường chỉ đọc phần hậu tố; nếu hậu tố chứa event kiểu cũ cần thay thế định danh từ sớm hơn, coordinator sẽ nạp và chuẩn hóa toàn bộ tiền tố trước, rồi mới trả về dải seq được yêu cầu.

Bộ import không tổng hợp inbox splice. Các agent (tác tử) trước khi tái cấu trúc react-loop sau khi khôi phục sẽ bắt đầu với danh sách chờ rỗng, đúng với hành vi runtime ở mốc cơ sở là không thể lưu bền vững công việc inbox đang chờ. Sản phẩm đã lưu vẫn chỉ ghi thêm, và các event tiếp theo dùng định dạng hiện tại.

## Các phương án đã cân nhắc

**Coi các bản ghi cùng phiên bản là không được hỗ trợ.** Điều này phù hợp với lập trường mặc định của giai đoạn tiền phát hành, nhưng sẽ khiến các session sinh ra ở mốc cơ sở của PR (Pull Request) không thể khôi phục, dù nội dung steering đã bị loại bỏ và các sự kiện kết thúc đều có ánh xạ đầy đủ.

**Phát lại các thông báo inbox cũ thành splice bền vững.** Những thông báo này không phải event session và cũng không cung cấp được ảnh chụp đáng tin cậy về trạng thái đang chờ. Nếu không biết được từng lần nhận và từng lần bỏ, việc suy diễn ra thao tác chèn sẽ khiến công việc đã tiêu thụ chạy lại.

**Quy các bản ghi hủy mức thô cho một bên gọi có sẵn.** Ánh xạ chúng sang `user`, `parent` hay `hook` là gán bừa một bên gọi mà bản ghi cũ không hề ghi chú. Lý do `legacy` chuyên dụng vừa giữ được phân loại dừng, vừa không tạo ra sự kiện kiểm toán giả.

**Ghi lại các bản ghi JSONL và SQLite đã lưu.** Việc ghi lại vi phạm quy ước chỉ ghi thêm, và đòi hỏi thiết lập cơ chế migration nguyên tử riêng cho từng backend tại ranh giới tương thích khi đọc.

## Hệ quả

Các session được ghi theo định dạng ở mốc cơ sở của đợt tái cấu trúc có thể khôi phục qua AgentLoop hiện tại, giữ trọn vẹn nội dung steering, ranh giới lượt, sự kiện lỗi và phân loại dừng. Quy ước coordinator dùng chung bao phủ `load`／`inspect`／`readFrom` cho bộ nhớ, JSONL và SQLite, bao gồm cả đường lui theo hậu tố của SQLite; ca khôi phục agent JSONL sau khi lắp ráp xác minh rằng transcript (bản ghi văn bản) lịch sử vẫn hiển thị, đồng thời cả hai danh sách inbox mới đều bắt đầu từ trạng thái rỗng.

Ngoại lệ này hỗ trợ định dạng ở mốc cơ sở, không hỗ trợ các định dạng trung gian phát sinh trong quá trình phát triển đợt tái cấu trúc. Cụ thể, nó không định nghĩa migration cho payload `agent/inbox/spliced` thử nghiệm sớm hơn. Nhờ nhận diện theo đúng hình dạng, những bản ghi trông giống định dạng hiện tại nhưng sai cấu trúc vẫn đi vào nhánh từ chối, chứ không bị chuyển đổi theo phỏng đoán thành bản ghi hợp lệ.

## Tài liệu liên quan

- [Nạp các session được lưu trước khi có cơ chế định danh message](2026-07-28-load-pre-identity-session-messages.md): phụ trách phần định danh tất định và ranh giới import chỉ đọc dùng chung cho một thay đổi định dạng cùng phiên bản khác.
- [Lưu bền vững session bằng service trừu tượng](../architecture/2026-06-14-session-persistence.md): phụ trách phần lưu trữ backend chỉ ghi thêm và khôi phục.
