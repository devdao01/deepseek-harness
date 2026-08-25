# Agent Note: Render chat của Code Mode — sub-call là hàng gốc nằm dưới hàng cha

Status: implemented

[English](2026-07-26-code-mode-chat-subcall-rows.md) | 中文

> Phạm vi: cách Web chat view render một lượt `run_code`, tức phần phía client của stack UI Code Mode, xây dựng trên [nền tảng phía host](2026-07-26-code-dispatch-ui-foundation.md) (`tool/code-dispatch` mang nội dung đầy đủ, tham số `description` bắt buộc). Mô hình slot mà bài này dựa vào thuộc về [phân rã toolview](../architecture/2026-07-23-toolview-dissolution.md).

## Vấn đề

Sau khi bật Code Mode, chat view trước đây chỉ hiển thị một hàng `run_code` không minh bạch: tóm tắt chính là văn bản chương trình gốc, sub-call thì hoàn toàn không thấy được ở đâu. Yêu cầu sản phẩm đã chốt lại đòi hỏi điều ngược lại: mỗi sub-call phải render *hoàn toàn giống* với lời gọi tool gốc — cùng component hàng, cùng đăng ký tùy chỉnh, cùng panel chi tiết — trong khi transcript (bản ghi văn bản) vẫn phải phản ánh trung thực rằng model chỉ khởi tạo một lời gọi duy nhất.

## Quyết định

**Sub-call là các block lời gọi tool chuẩn được đính kèm đệ quy vào cha bên ngoài surface stream, render qua cùng keyed slot với hàng gốc, và luôn hiển thị dưới hàng cha.**

- **Tầng dữ liệu**: `ToolCallTree` của runtime gấp sự kiện `tool/code-dispatch-start` và `tool/code-dispatch` trong cửa sổ hiện tại vào chỉ mục riêng theo từng cha, rồi projection các sub-call đang chạy và đã settle lên `ToolCallBlock.subCalls` đệ quy. Projection session thời gian thực và `projectConversationHistory` dùng chung quá trình gấp này; mảng copy-on-write theo từng cha và projection copy theo đường dẫn giữ tham chiếu ổn định cho các node gốc không liên quan và anh em. Sub-call không bao giờ vào `nodes` — surface stream luôn chính xác bằng cấu trúc lượt mà model có thể thấy. Các sự kiện này bị thu hẹp cấu trúc tại ranh giới bên tiêu thụ wire, ranh giới đó cũng từ chối quan hệ cha-con thành vòng (kiểu host của dsh-tools không thể vào chương trình client, vì declaration merging của `Context` ở cả phía host và client sẽ xung đột).
- **Tầng render**: `ChatView` truyền mỗi lời gọi cha cùng sub-call đệ quy của nó qua seat tool tổng thể `'conversation.chat.tool'`. `ToolCallTree` của ui-tool render parent trước, rồi render lồng `[data-subcalls]`; mỗi lời gọi nguyên tử đều đi qua cùng keyed slot `'tool.call.toolview'`, dùng tên tool làm `entryKey`, và dùng chung fallback `GenericToolCard`. Một đăng ký keyed do đó có thể tiếp quản bất kỳ hậu duệ hay lời gọi cấp cao nào mà không cần thay đổi. Parent đang chạy (`runningCalls`) nhận dispatch đã tích lũy trong cùng block đệ quy, khiến hàng con chảy vào thời gian thực trong lúc đang chạy.
- **Cách trình bày `run_code`**: thêm một biến thể hàng `code` mới (bộ phân loại ánh xạ `run_code → code`, tiêu đề `Code`, icon `IconCodeOutline16`), dùng `description` do model viết làm tóm tắt, mở rộng ra hiển thị chính chương trình (dạng font đơn cách trên nền màu của khối code markdown), thay vì JSON đóng gói tham số.
- **Panel chi tiết**: `materialFor` tìm kiếm đệ quy trong `nodes` và `runningCalls`, nên callId hậu duệ được chọn sẽ đi qua đúng đường render như lời gọi gốc đã hoàn tất, giải mã ra tham số đầy đủ và output đầy đủ.

## Phương án thay thế đã cân nhắc

**Làm phẳng sub-call vào surface stream (gấp vào `nodes`).** Bác bỏ: điều này sẽ bóp méo transcript — model chỉ khởi tạo một lời gọi; lồng dưới hàng cha vừa giữ được liên kết code↔lời gọi, vừa giữ nguyên bất biến thứ tự model-có-thể-thấy của quá trình gấp.

**Ẩn sub-call, chỉ hiện sau khi mở rộng hàng cha.** Bị bác bỏ theo quyết định sản phẩm: sub-call chính là nội dung cốt lõi của một lượt Code Mode; giấu chúng đi tức là tái tạo lại chính sự không minh bạch mà tính năng này muốn loại bỏ. Công tắc mở rộng của hàng cha chỉ dùng để hiển thị chính chương trình.

**Component hàng sub-call chuyên dụng.** Bác bỏ: toàn bộ ý nghĩa của tính năng này nằm ở việc giữ tính đồng nhất với hàng gốc; một component song song chắc chắn sẽ trôi dần. Lớp bọc lồng (thụt lề + đường viền trái) là trang trí thị giác duy nhất riêng của sub-call.

## Hậu quả

Đăng ký toolview tùy chỉnh không cần thay đổi gì thêm cũng áp dụng được cho sub-call — và điều này là chủ đích: không có cơ chế thoát theo từng cấp đăng ký, lối ra duy nhất là để component tự đọc context của chính nó, hiện tại chưa có bên tiêu thụ nào cần làm vậy. Highlight lựa chọn đi qua cùng kênh `selectedCallId` đến hàng lồng (quy thuộc nhóm sẽ tìm kiếm toàn bộ cây). trajectory/waterfall giờ vẽ span của sub-call dựa trên cặp sự kiện timing dispatch ([dispatch song song thời gian thực](2026-07-26-code-mode-live-parallel-dispatch.md)); thiếu timing thì span trên waterfall coi như đang nói dối. Fixture (dữ liệu tiền đặt cho test) lượt 64 (`?fixture`), cộng với `code-mode-round` browser e2e (lượt thật đã ghi lại, replay không cần khóa), cùng nhau chốt toàn bộ giao diện; bộ test jsdom và runtime thì chốt việc phân phối slot, trạng thái lỗi, giải mã chi tiết đệ quy, projection lịch sử và đường dẫn copy giữ tham chiếu ổn định.
