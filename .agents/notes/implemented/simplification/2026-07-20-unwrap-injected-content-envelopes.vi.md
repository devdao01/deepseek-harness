# Agent Note: Chiếu nội dung được tiêm nguyên văn, bỏ lớp bọc XML

Status: implemented

[English](2026-07-20-unwrap-injected-content-envelopes.md) | 中文

## Vấn đề

Hai loại nội dung phiên được tiêm (injected) bị bọc trong lớp bọc XML khi được render vào transcript (bản ghi văn bản) của model: `steering/message` được bọc thành `<steering source="…">…</steering>`, `context/message` được bọc thành `<context source="…">…</context>` (loại sau có một lựa chọn thoát `'raw'` để bỏ qua lớp bọc). Các lớp bọc này nhằm báo cho model biết「đây là nội dung được tiêm, không phải người dùng đang nói」.

Hai vấn đề:

- **Không có model nào được huấn luyện với các thẻ này.** `<steering>` và `<context>` là các đánh dấu tùy ý mà chưa model nào được dạy để đọc, do đó lớp khung này chỉ làm tăng token mà không có hiệu quả đáng tin cậy, thậm chí có thể phản tác dụng — các transcript đã ghi lại cho thấy model coi chỉ thị `<steering>` là metadata của bên thứ ba và từ chối tuân theo, chỉ trả lời prompt gốc.
- **Lớp bề mặt của phiên là sai tầng để mang khung này.** Trách nhiệm của lớp bề mặt là chiếu log bền vững thành transcript của model; việc quyết định nội dung được diễn đạt ra sao không phải việc của nó. Bên gọi muốn một khung cụ thể có thể tự định dạng nội dung trước khi tiêm — bên sản xuất nặng ký duy nhất (`agent-instructions`) vốn đã làm như vậy, tự mang theo khung `<system-reminder>` hoàn chỉnh và thoát khỏi lớp bọc `<context>` bằng `envelope: 'raw'`. Cơ chế đánh thẻ còn lại (kiểu `ContextEnvelope`, cùng trường `envelope` xuyên suốt `InjectOptions`, `HookContext`, sự kiện `context/message` và agent loop (vòng lặp tác tử)) phục vụ sự phân biệt vốn nên thuộc về bên gọi.

## Quyết định

Nội dung phiên được tiêm sẽ được chiếu nguyên văn, khung do bên gọi tự chịu trách nhiệm. `deriveEventMessage` chuyển các khối nội dung của `user/message` đến model nguyên vẹn; `source` vẫn được giữ trong log sự kiện bền vững, nhưng không render.

Kiểu `ContextEnvelope` và tất cả các trường `envelope` bị loại bỏ — bao gồm `context/message` trong `SessionEventMap`, `InjectOptions`, `HookContext`, và các đường ống liên quan của `inject()`/`additionalContexts` trong `dsh-agent-loop`. `agent-instructions` không còn yêu cầu `'raw'`; cách nó tự render nội dung có khung không đổi. Các hàm phụ trợ `renderTagged`/`renderContextEnvelope` bị xóa. `context/message.meta` vẫn mang trạng thái JSON bền vững, ẩn với model.

Thông tin nguồn gốc `source` mà lớp bọc từng mang không bị mất — nó vẫn được giữ trên sự kiện bền vững; chỉ là không còn được render vào transcript.

## Các phương án thay thế đã cân nhắc

- **Giữ lớp bọc `<context>`, chỉ bỏ bọc cho steering (dẫn dắt giữa chừng)** — sẽ giữ lại cơ chế `ContextEnvelope`/`envelope` cho một vị trí khung mà không model nào đọc, và giữ lại sự không nhất quán mà bên sản xuất chính vốn đã thoát khỏi.
- **Chỉ giữ trường envelope cho nội dung có nguồn từ plugin** — sẽ tách một lần chiếu thành hai theo `source.kind`, mà không quan sát thấy lợi ích nào; khi plugin dẫn dắt agent (lý do tiếp tục lượt của cầu nối hook), chúng cũng muốn chỉ thị được tuân theo, chứ không phải bị dán nhãn.
- **Chuyển logic bỏ bọc vào adapter** — chiếu chuẩn hóa chính là quy ước model-visible (「model-visible ⟺ đã ghi log」); để mỗi adapter tự xử lý khung theo cách riêng sẽ khiến transcript suy ra phụ thuộc vào adapter. Khung mà bên gọi thực sự muốn nên nằm trong nội dung của chính bên gọi, không phải trong adapter.

## Kết quả

- Dẫn dắt giữa chừng và ngữ cảnh được tiêm đến model với cùng trọng số như prompt thông thường của người dùng.
- Transcript không còn phân biệt nội dung được tiêm với tin nhắn người dùng; bên tiêu thụ cần sự phân biệt này đọc log sự kiện bền vững, nơi loại sự kiện, `source` và `meta` được giữ nguyên vẹn.
- Các snapshot ACP (Agent Client Protocol) của `hook-{cc,codex}-stop-continue` đã được ghi lại lại: bản ghi cũ bắt được đúng chế độ lỗi mà model coi steering là metadata bên thứ ba và từ chối tuân theo, chính là điều bản sửa lỗi lần này nhắm tới.
- Điều khoản về lớp bọc có gắn nhãn trong [Agent Note về từ vựng khối nội dung](../architecture/2026-06-11-content-block-vocabulary.md) đã được sửa lại để trỏ về tài liệu này.

## Việc hoãn lại

`agent-instructions` đã tự đóng khung nội dung của mình: nó phát ra một khối `<system-reminder>…</system-reminder>` hoàn chỉnh như nội dung tin nhắn, không phụ thuộc vào lớp bọc bề mặt. Mẫu hình bên gọi tự đóng khung này mới là thứ nên được giữ lại — lớp bề mặt chuyển tiếp nội dung nguyên văn, mọi khung đều nằm trong nội dung của chính bên sản xuất.

Từng tồn tại hai đường khung — bên gọi tự đóng khung (`<system-reminder>` của `agent-instructions`), và lớp bọc bề mặt (`<context>`/`<steering>` do `deriveEventMessage` thêm vào). Thay đổi lần này loại bỏ đường thứ hai, chỉ giữ lại khung tự có của bên gọi. Nếu tương lai lại cần khung có gắn nhãn, nó nên được thống nhất qua map `meta` của sự kiện (trường metadata do bên sản xuất gắn thêm, ẩn với model), để một renderer hoặc adapter chuyên biệt tiêu thụ, thay vì hard-code lại thẻ trong `deriveEventMessage`. Bên sản xuất khai báo khung cần thiết trong `meta`, và một renderer thống nhất áp dụng nó; lớp chiếu bề mặt của phiên luôn giữ nguyên nguyên văn.
