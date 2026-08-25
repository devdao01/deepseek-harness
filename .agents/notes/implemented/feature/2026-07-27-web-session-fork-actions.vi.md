# Agent Note: Thao tác fork session trên Web

Status: implemented

[English](2026-07-27-web-session-fork-actions.md) | 中文

## Problem

Session store đã cung cấp nguyên thủy (primitive) tạo session con theo tiền tố lượt (turn) đã hoàn thành, nhưng phía Web chưa có một quy ước tương tác thống nhất. Menu dòng session chỉ diễn đạt được "fork từ lượt đã hoàn thành mới nhất", trong khi IconActions của tin nhắn còn cần diễn đạt "fork từ lượt chứa tin nhắn này"; nếu hai nơi tự diễn giải ranh giới, chuyển đổi (switch) và hành vi thất bại theo cách riêng, cùng một thao tác của người dùng sẽ hình thành hai bộ ngữ nghĩa. Việc lồng session fork con dưới session nguồn còn khiến session con vừa được chọn phụ thuộc vào trạng thái mở rộng (expand) của tổ tiên mới thấy được, đồng thời làm suy yếu mô hình sắp xếp thủ công của workspace.

## Decision

Phần điều kiện đủ về tin nhắn trong quyết định này đã được thu hẹp bởi [quyết định về đuôi lượt đã hoàn thành](../bug-fix/2026-08-02-message-fork-actions-require-completed-turn-tail.md); các quyết định về thao tác runtime dùng chung, gán quyền sở hữu injection, xử lý tiêu đề và danh sách anh em (sibling list) vẫn còn hiệu lực.

Menu dòng session và IconActions tin nhắn trên Web dùng chung thao tác `sessions.fork` của client runtime. Dòng session truyền `{ sessionId, increaseTitle: true }`, do đó fork tại lượt đã hoàn thành cuối cùng của session nguồn; tin nhắn đủ điều kiện và nằm ở đuôi một lượt đã hoàn thành truyền `{ sessionId, atSeq: node.seq, increaseTitle: true }`, do đó fork tại lượt kết thúc bằng tin nhắn đó. `increaseTitle` chỉ được client tiêu thụ: sau khi session con vào danh sách cục bộ, client tăng số `(N)` hoặc `（N）` ở đuôi tiêu đề đã persist của session nguồn và giữ nguyên kiểu dấu ngoặc, không có số thì thêm ` (1)`, không có tiêu đề đã persist thì không đổi tên. Yêu cầu fork của Host vẫn chỉ có `sessionId` và `atSeq` tùy chọn. Chỉ sau khi đổi tên thành công, bên gọi mới mở session con; nếu fork hoặc đổi tên thất bại, session nguồn và lựa chọn hiện tại giữ nguyên, và nếu đổi tên thất bại, session con đã tạo vẫn còn trong danh sách.

`forkAt(seq)` chỉ chạm tới session service tại tầng apply injection của ui-conversation, còn component tin nhắn chỉ trả lại sự kiện `seq`. Dòng session cũng tương tự, chỉ khởi phát thao tác qua callback injection của ui-workspace; cả hai package trình diễn đều không giữ state mutation của session, cũng không sao chép việc đánh giá ranh giới của host.

Huyết thống (lineage) session không được chiếu (project) thành phân cấp danh sách. Chế độ WorkSpace hiển thị session nguồn và tất cả session con đã fork thành các dòng ngang hàng theo thứ tự thủ công của `WorkspaceView.sessionIds`, mỗi dòng đều có thể mở, tìm kiếm và kéo thả độc lập; chế độ In one list vẫn sắp xếp nghiêm ngặt theo `updatedAt`; nhóm Ungrouped khi không có sổ workspace cũng sắp theo recency. `parentId` vẫn dùng cho lineage và truy vấn về sau, nhưng không kiểm soát khả năng hiển thị của danh sách session.

## Alternatives considered

**Chỉ hỗ trợ menu dòng session.** Bác bỏ: người dùng ở tin nhắn đã chọn một ngữ cảnh chính xác hơn, buộc họ quay lại danh sách chỉ có thể thoái hóa về lượt đã hoàn thành mới nhất, và icon fork tin nhắn vốn đã hiển thị sẽ trở thành control không phản hồi.

**Chỉ cho phép fork tin nhắn của user.** Bác bỏ: nội dung assistant đã chốt cũng có `seq` sự kiện ổn định, host sẽ quy nó vào lượt đã hoàn thành tương ứng; để hai nút fork có hình thức giống nhau nhưng chỉ một cái dùng được sẽ tạo ra khác biệt hành vi vô hình.

**Lồng session con đã fork dưới session nguồn theo `parentId`.** Bác bỏ: lineage không phải là quyền sở hữu điều hướng; việc lồng đòi hỏi tự động mở rộng tổ tiên mới thấy được mục hiện tại, và khiến session con không thể tham gia sắp xếp thủ công đồng cấp của workspace.

**Để component tin nhắn gọi trực tiếp session service.** Bác bỏ: component client không được chạm vào `ctx` hoặc business service; callback injection giữ mutation ở thế giới apply, component vẫn thuần props.

## Consequences

Người dùng có thể tạo fork từ dòng session hoặc từ tin nhắn ở đuôi một lượt đã hoàn thành đủ điều kiện, cả hai nơi cuối cùng đều đi qua cùng một thao tác runtime/host; điểm tin nhắn giữ ranh giới sự kiện chính xác, điểm danh sách giữ ngữ nghĩa tắt "lượt đã hoàn thành mới nhất". Tiêu đề của các lần fork liên tiếp tăng dần theo `(1)`, `(2)`, thay vì lặp lại thêm `(1)`; tiêu đề dùng dấu ngoặc full-width vẫn giữ kiểu full-width.

Mọi session con đã fork lập tức xuất hiện như dòng ngang hàng bình thường, danh sách không còn cần trạng thái mở rộng session, node đệ quy hay control twist.

Cả fork và đổi tên session con đều âm thầm giữ nguyên lựa chọn nguồn khi thất bại, tránh để một thao tác phái sinh phá hỏng vị trí đọc hiện tại; đánh đổi này cũng có nghĩa là UI hiện chưa cung cấp lý do thất bại hay lối vào thử lại. Test ở tầng package chốt việc chuyển tiếp `seq` của tin nhắn đủ điều kiện, việc tăng tiêu đề và cách suy ra danh sách ngang hàng; `apps/web/tests/message-actions.e2e.ts` chạy qua ứng dụng đã lắp ráp để thực hiện fork tin nhắn assistant và fork qua menu dòng session.
