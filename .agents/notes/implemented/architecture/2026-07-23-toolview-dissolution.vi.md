# Agent Note: Giải thể toolview — hàng công cụ trở thành slot keyed per-view

Status: implemented

[English](2026-07-23-toolview-dissolution.md) | 中文

> Phạm vi: vì sao vòng công cụ độc lập (ToolViewRegistry/ctx.toolviews/outlet) bị loại bỏ, và bị thay thế bởi gì. Tường thuật trạng thái triển khai sinh ra từ quyết định này thuộc về [Agent Note kiến trúc Web client](2026-07-19-gui-web-client-architecture.md); toàn bộ mô hình đăng ký mà mọi thứ hiện đang chạy trên đó thuộc về [chuẩn chuỗi kiểu slot](2026-07-22-slot-type-chain-implementation.md). Quyết định sau đó về [quyền sở hữu hiển thị Client Tool](2026-08-08-client-tool-presentation-ownership.md) chỉ thay thế cách đặt per-view của bài này: việc phân phối tên Tool vẫn dùng keyed slot, chứ không phải registry song song.

## Problem

Sau khi vòng view giải thể vào hệ thống slot, phía client vừa vặn còn sót lại một mô hình đăng ký song song: vòng công cụ — một registry có tên (`ctx.toolviews`), với văn phạm register riêng, ngữ nghĩa resolve riêng (phân phối theo predicate scoped đè global), cặp subscribe/version riêng, cache inject riêng, và outlet render riêng có error boundary riêng. Mỗi thứ trong số đó là bản triển khai thứ hai của thứ mà bộ máy slot đã sẵn có, và mỗi năng lực tương lai (chỗ store cho bản nháp hàng, inject i18n, danh tính xuyên bundle) sẽ đều phải xây hai lần hoặc trôi dạt. Lý do tồn tại đáng kể duy nhất của vòng này là: tên tool là tập mở tại runtime, còn `SlotMap` là bảng khai báo đóng — một registry lấy bất kỳ chuỗi nào làm key trông có vẻ cần thiết về mặt cấu trúc.

## Decision

Vòng công cụ với tư cách hạ tầng độc lập đã biến mất: hàng công cụ là **sub-slot keyed do từng view tự khai báo cho chính mình**, toàn client giờ chỉ còn một mô hình đăng ký. Lý do nêu trên là rỗng — *không gian key* của keyed slot vốn đã mở tại runtime (SlotMap khai báo slot, không bao giờ khai báo key; `key: 'question'` của ask-user composer chính là tiền lệ), và tập tên tool mở tự nhiên khớp với phân phối theo `entryKey`.

Quyết định này ban đầu đặt `'conversation.chat.toolview'` dưới entry chat, do điểm render chat phân phối từng hàng. Quyết định sau đó về [quyền sở hữu hiển thị Tool](2026-08-08-client-tool-presentation-ownership.md) chuyển cách đặt này vào slot Tool tổng thể, khiến `ui-tool` sở hữu một sub-slot keyed `'tool.call.toolview'`. Điều quyết định sau thay đổi là bên sở hữu hiển thị, chứ không phải ràng buộc cốt lõi của bài này: việc đăng ký Tool vẫn dùng cơ chế keyed-slot thông thường, kích hoạt, thay thế, cache, cô lập lỗi, version và fallback vẫn thuộc về framework.

## Thay đổi ngữ nghĩa được chấp nhận

Bốn gia số hành vi là chủ đích chấp nhận chứ không phải bỏ sót. Việc xuất hiện xuyên view ban đầu dùng đăng ký từng view; Note sau ghi lại vì sao việc điều phối root/subcall sau này chứng minh là hợp lý khi do một bên sở hữu hiển thị cấp Tool đảm nhiệm thống nhất. Phân phối theo chiều session, nếu hàng cần, thuộc về nội bộ component (kit chuẩn đã có sẵn `useSessions`), không đi qua predicate của registry — hiện chưa có mẫu biến thể session nào đã lên sàn. Hình thái ghi đè cấp registry của bên thứ ba (đăng ký scoped đè global) không còn tồn tại; nhu cầu tương lai thực sự phát sinh sẽ đi theo quy ước namespace của key hoặc một resolver nhỏ nội bộ component, không bao giờ hồi sinh registry song song.

## Alternatives considered

**Giữ registry độc lập (hình thái nguyên bản).** Từ chối: mỗi chiều trong phân phối đa chiều của nó đều có một nhà đúng đắn hơn — quyền sở hữu hiển thị thuộc sub-slot khai báo tường minh, chiều session thuộc nội bộ component vốn đã có kit chuẩn. Phần còn lại chỉ là một bản sao của bộ máy slot không có năng lực riêng nào.

**Đưa `renderToolView` lên kit chuẩn, di dời registry vào gói runtime.** Từ chối: hiển thị Tool là từ vựng Client UI; đẩy lên runtime sẽ làm rò rỉ khái niệm hiển thị vào tầng đối tượng dữ liệu, và vẫn để lại hai mô hình đăng ký.

**Suy ra khai báo slot từ refCount của subscribe** (bên đăng ký đầu tiên subscribe thì ngầm khai báo slot). Từ chối: khớp nối ngầm định cộng thêm độ phức tạp debounce; ghi lại làm phương án dự phòng cho khi thật sự xuất hiện UI đa view trong tương lai.

**Một façade `registerToolView` mỏng trên `slots.register`.** Hoãn xây chứ không từ chối: sau khi giải thể, façade này chỉ còn là đường (syntax sugar) tại compile-time (thu hẹp literal tên slot, dịch từ vựng tool→key, tiền tổ hợp props), runtime là bằng không. Theo nguyên tắc "enforce at the operation boundary" (façade không phải điểm cưỡng chế), giữ nguyên không xây; phần tổ hợp kiểu hữu ích đã được đáp ứng bằng Tool view props alias đã export. Nếu nghi lễ đăng ký lặp lại sau này đủ chứng minh giá trị của nó, có thể bổ sung façade mà không xáo trộn việc đăng ký trực tiếp.

## Consequences

Client chỉ còn một mô hình đăng ký; kiểm toán ai render lệnh gọi Tool tức là đọc lệnh gọi slot register, cùng một bộ kiểm toán với mọi slot khác. Bên đăng ký nhận miễn phí sự cô lập lỗi của framework, cache inject và chỗ store — không có năng lực nào phải xây hai lần. Cái giá phải trả chính là các thay đổi ngữ nghĩa được chấp nhận ở trên, chủ yếu là key trùng lặp sẽ loud failure, và bên thứ ba không có quyền ghi đè cấp registry. Bên đăng ký độc lập nêu đích danh slot có ràng buộc kiểu trong `ctx.slots.inject`, nên quan hệ phụ thuộc vừa tường minh, vừa có thể thay thế theo khai báo, không cần quy ước thứ tự service.
