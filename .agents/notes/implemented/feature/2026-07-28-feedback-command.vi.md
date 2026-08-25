# Agent Note: Lệnh `/feedback`

Status: implemented

[English](2026-07-28-feedback-command.md) | Tiếng Việt

## Vấn đề

Khi người dùng phát hiện vấn đề giữa chừng một session, họ không có chỗ nào để ghi lại quan sát đó. Nói với model thì lãng phí một lượt, làm chệch cuộc hội thoại mà người dùng đang tiến hành, và chôn nhận xét ấy vào lịch sử phái sinh khiến người đọc về sau không tìm thấy được. Còn ghi ra bên ngoài session thì mất đi phần ngữ cảnh làm nên ý nghĩa của nó: thuộc session nào, tại thời điểm nào, nhắm vào phần việc nào.

Interface thu thập phải dùng được ngay tại khoảnh khắc người dùng nảy sinh bất mãn, nên mọi phương án buộc người dùng rời khỏi client tương tác đều không khả thi; nó cũng không được làm nhiễu loạn lần chạy đang diễn ra: không tiêu tốn token của model, không tạo thêm lượt làm việc, không thay đổi request mà người dùng đang chờ.

## Quyết định

`@deepseek-ai/dsh-command-feedback` nằm tại `packages/feedback/command-feedback/` đăng ký một lệnh toàn cục `feedback` thông qua `ctx.commands`. `/feedback <text>` đưa vào văn bản xác nhận cả id của session nhận phản hồi lẫn id người dùng ẩn danh dùng chung của harness home; đầu vào rỗng hoặc chỉ gồm khoảng trắng sẽ trả về lỗi cách dùng trực tiếp. Handler là đồng bộ, chỉ inject `commands`, và không có cấu hình nào. [Quyết định về id dùng chung](../architecture/2026-08-07-shared-feedback-telemetry-user-id.md) giải thích vì sao feedback và OpenTelemetry dùng cùng một giá trị `$DSH_HOME/.anonymous-user-id`.

Package này khai báo sự kiện session `feedback/record { text }` chỉ ghi vào log, và export `recordFeedback(session, text)` như một bên sản xuất không phụ thuộc vào lệnh. Bên sản xuất này loại bỏ khoảng trắng đầu cuối, từ chối kết quả rỗng, và nối thêm đúng một sự kiện. `/feedback` ủy quyền cho nó, nhờ đó các UI, hook hay tích hợp host khác có thể ghi lại cùng một dữ kiện nghiệp vụ mà không cần dựng lệnh slash.

`dsh-commands` vẫn ghi cặp vòng đời `command/run` / `command/done` quanh `/feedback`, nhưng lệnh này đặt `recordInput: false`. Do đó `command/run` của nó mang theo định danh lệnh và nguồn gốc, nhưng không mang `args`; văn bản phản hồi chỉ tồn tại trong `feedback/record`, còn `command/done` mang theo kết quả xác nhận. Cả ba bản ghi đều chỉ ghi log và không phải surface. Việc nối thêm chúng đi theo đường ghi có giới hạn thông thường của lớp persistence; không khâu nào ép flush, nên văn bản xác nhận báo rằng phản hồi đã vào log, chứ không phải đã ghi xuống đĩa.

Việc thu thập vẫn không sinh ra hành động tiếp theo nào cho agent (tác tử) đang chạy và cho model. Package telemetry OTel tùy chọn về sau có thêm một bên tiêu thụ ở tầng hạ tầng: ở chế độ `FEEDBACK_ONLY` nó dùng `feedback/record` làm trigger phát hành, ở chế độ `DISABLED` nó dùng sự kiện này làm trigger cảnh báo chỉ trong phạm vi cục bộ, và không làm thay đổi sự kiện feedback hay đường đi của lệnh. Xem [Telemetry session được kiểm soát bởi feedback](2026-08-05-feedback-gated-session-telemetry.md) và [Công bố việc chia sẻ trong văn bản xác nhận](2026-08-07-feedback-acknowledgement-sharing-disclosure.md).

### Vì sao feedback có sự kiện riêng

Feedback là dữ kiện nghiệp vụ, còn `/feedback` chỉ là một cách kích hoạt. Chỉ lưu payload trong `feedback/record` vừa cho phép các cách kích hoạt về sau dùng chung một sự kiện, vừa cho phép bên tiêu thụ lọc feedback mà không phải dựa vào tên lệnh hay phân tích các bản ghi vòng đời lệnh. Bỏ `command/run.args` khỏi định nghĩa này giúp tránh việc cùng một đánh giá của con người lại xuất hiện thành hai bản sao mà bản nào trông cũng có vẻ có thẩm quyền.

### Vì sao model không bao giờ nhìn thấy nó

Feedback là nói *về* session, chứ không phải đầu vào của session. Inject nó dưới dạng message user sẽ làm thay đổi request model kế tiếp, xung đột với yêu cầu "ghi nhận không được làm nhiễu loạn lần chạy", đồng thời khiến nhận xét đó trở thành một phần của chính đoạn hội thoại mà nó nhận xét. `command/run` và `command/done` không thuộc `SurfaceEventType`, nên kể cả khi có lỗi cũng không thể nhận `surfaceOp` hay lọt vào lịch sử phái sinh.

### Văn bản giữ nguyên trạng

Khoảng trắng đầu cuối bị loại bỏ, nhưng ngoài ra không phân tích gì thêm. `/feedback /plan felt slow` ghi lại `/plan felt slow`; chuỗi `/plan` ở đầu là nội dung, không phải lệnh lồng nhau. Nếu áp dụng cú pháp từ khóa điều khiển kiểu `/goal`, thì phản hồi đúng theo nghĩa đen tương ứng sẽ không diễn đạt được — trái ngược hẳn với mục đích của interface thu thập.

### Một nhóm package mới

`packages/feedback/` là nhóm mới, vì không nhóm hiện có nào sở hữu trách nhiệm này: `goal/` lo trạng thái mục tiêu, `session-title/` lo tiêu đề, `core/` là trục sản phẩm. Nhóm này chỉ chứa một package sản xuất; các bên tiêu thụ liên lĩnh vực vẫn ở lại nhóm của riêng chúng, thay vì ép nhóm này phình ra không ngừng.

## Các phương án đã cân nhắc

**Dùng `command/run` làm bản ghi feedback.** Đã bác, vì cách này gắn chặt feedback với một cách kích hoạt duy nhất, và bên tiêu thụ còn phải nhận diện dữ kiện nghiệp vụ thông qua tên lệnh. Bên sản xuất không phải lệnh sẽ không tạo được bản ghi tương đương trừ khi giả dạng đang thực thi một lệnh.

**Lưu văn bản đồng thời trong `feedback/record` và `command/run.args`.** Đã bác, vì cùng một hành vi lại sinh ra hai bản sao payload không khác nhau về bản chất. `recordInput: false` giữ lại vòng đời chung mà vẫn để sự kiện nghiệp vụ giữ vai trò có thẩm quyền.

**Inject feedback dưới dạng message user qua `agent.inject()`.** Không cần thêm kiểu sự kiện mới, và tái dùng đúng đường đi mà thay đổi `/goal` đang dùng. Đã bác: nó khiến feedback lộ ra với model, do đó lọt vào request kế tiếp, làm thay đổi chính lần chạy đang bị nhận xét và tiêu tốn token — xung đột với cả ba khía cạnh của yêu cầu "không được làm nhiễu loạn".

**Để `/feedback` trở thành một no-op thật sự, không ghi lại gì cả.** Đây là cách hiểu theo nghĩa đen nhất của "không làm gì cả". Đã bác: nó khiến lệnh này mất hết ý nghĩa — yêu cầu đưa ra rất rõ ràng là đưa nhận xét ấy vào log session.

**Đăng ký lệnh này trong một package sẵn có**, ví dụ `packages/interaction/commands`. Cách này bỏ được nhóm package mới cùng README song ngữ của nó. Đã bác: `ctx.commands` là registry, chứ không phải nơi trú ngụ của mọi cài đặt lệnh tùy ý; hơn nữa bên yêu cầu đã nói rõ là muốn một package độc lập.

**Phân tích cấu trúc từ văn bản** (tiền tố phân loại, cờ mức nghiêm trọng). Đã bác vì thuộc kiểu thiết kế đầu cơ: không bên tiêu thụ nào cần cấu trúc đó, mà bất kỳ cú pháp từ khóa điều khiển nào cũng khiến phản hồi đúng nghĩa đen tương ứng không ghi lại được. Văn bản nguyên trạng là interface rộng nhất mà bên tiêu thụ tương lai có thể thu hẹp lại; còn một interface đã bị phân tích thì không thể nới rộng về sau.

**Chuyển sang cung cấp một tool hướng tới model.** Đã bác: feedback là quan sát trực tiếp của con người. Đi qua model sẽ tiêu tốn một lượt, để model diễn đạt lại nguyên văn của người dùng, và khiến việc ghi nhận phụ thuộc vào chuyện model có chọn gọi tool đó hay không.

## Hệ quả

Bộ composition nền của `dsh` đi kèm gắn lệnh này vô điều kiện: không có cấu hình, cũng không phụ thuộc vào goal stack. Client Web phơi bày lệnh này qua adapter lệnh. Chế độ headless, ACP (Agent Client Protocol) và JSON-RPC không cung cấp adapter lệnh, nên `/feedback` không dùng được ở đó. Với một harness home nhất định, `$DSH_HOME/.anonymous-user-id` có thể được tạo ra ở lần đầu tiên tiếp nhận feedback; đầu vào rỗng bị từ chối sẽ không đọc hay tạo id nào.

Package này sở hữu một sự kiện chỉ-nối-thêm độc lập, không tồn tại quan hệ liên sự kiện hay quan hệ dữ liệu khả biến nào để plugin đồng hành kiểm tra bất biến soi vào. Sự kiện này tuân theo đúng các hành vi phát lại, fork, lưu bền vững và xử lý phần đuôi khi crash hiện có của session log.

Những việc hoãn lại: chưa có bên tiêu thụ ở tầng sản phẩm hay model; chưa có trường có cấu trúc; không hỗ trợ sửa hay rút lại, vì log chỉ nối thêm và package này không thêm tombstone; và không có rào chắn persistence tường minh, nên các mục được ghi ngay sát trước lúc crash có thể mất cùng phần đuôi chưa flush. Bên tiêu thụ telemetry tùy chọn chỉ dùng sự kiện này làm trigger cho chính sách export.

Theo chỉ thị rõ ràng của bên yêu cầu, thay đổi lần này không kèm snapshot transcript (bản ghi văn bản) không cần khóa. Các bài test package, bài test composition với Loader thật dựa trên `cordis.yml`, cùng bài test composition Web đi kèm đã phủ phần đăng ký, thu thập, loại trừ khỏi model và lắp ráp sản phẩm.
