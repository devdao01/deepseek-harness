# @deepseek-ai/dsh-client-ui-model-selection

[English](README.md) | Tiếng Việt

Plugin chọn mô hình (phía trình duyệt): **hai lối vào dùng chung một thư mục ở cấp phiên**, do `ModelDirectoryResolver` (`ctx.modelDirectories`) nắm giữ. Với phiên thông thường, phần đóng góp popupSelect `/model` (đăng ký qua `ctx.commandUi`) và slot có tên `conversation.input.model` của composer đều đi qua cùng một thực thể `ModelDirectory`, nạp thư mục gợi ý của phiên qua `session.models` và gửi qua `session.selectModel`. Bộ kích hoạt composer dạng gọn sẽ mở menu Model/Effort hai cấp: mô hình vẫn được nhóm theo provider, còn mô hình cụ thể đã chọn sẽ cung cấp tên, mô tả và giá trị mặc định của mức độ suy luận do adapter của nó nắm giữ. `/model` áp dụng mức độ suy luận mặc định của mô hình đã chọn, sau đó composer có thể chọn bất kỳ mức độ suy luận nào đã được công bố.

`ModelSelection` do Host báo cáo là sự thật duy nhất về lựa chọn, bao gồm provider, mô hình và mức độ suy luận (reasoning); nhưng nó chỉ được phản chiếu lại khi cặp provider／mô hình đó vẫn nằm trong các nhóm đã công bố. Khi thiếu dòng thư mục, lựa chọn có thể định tuyến vẫn giữ nguyên, nhưng bộ kích hoạt sẽ nhắc `Select model`; hệ thống không tổng hợp dòng cũ kỹ, và không hiển thị dòng Effort cho tới khi người dùng chọn một mô hình đã công bố. Việc nạp thư mục và việc chọn dùng chung một bộ đếm thế hệ, phản hồi cũ không ghi đè kết quả mới; đặt lại kết nối sẽ loại bỏ mọi phép chiếu thư mục thường trú và kéo lại lựa chọn do Host khôi phục trước khi hiển thị. Lỗi lấy metadata của từng provider được liệt kê nội tuyến, trong khi các nhóm khả dụng vẫn chọn được; lỗi khi chọn thì giữ nguyên lựa chọn và thư mục trước đó.

Khi bên chủ quản báo rằng không có adapter nào phục vụ tuyến của phiên này (`session.models.routable`), plugin đăng ký một khối chặn composer qua `ctx.conversation.blocks`, ô nhập theo đó bị vô hiệu hóa và hiển thị văn bản của chính plugin; khi phục hồi thì tự động xóa mà không cần tải lại. Nó chỉ bám theo `routable`: giá trị `null` (trước lần tải đầu tiên, hoặc sau khi tải thất bại) tuyệt đối không chặn, nếu không một bên chủ quản chậm sẽ khóa cứng một composer vốn dùng được; tư cách thành viên trong thư mục cũng không chặn, vì một tuyến vẫn đang phục vụ mà chỉ là không còn công bố mô hình đó thì tuy không nằm trong nhóm nhưng vẫn dùng được hoàn toàn. Phần dự phòng `Select model` của chính bộ kích hoạt vẫn bao trùm tình huống ấy — đó là hiển thị, không phải cổng chặn.

Thư mục được phân giải lười theo phiên (`ctx.modelDirectories.directoryFor(sessionId)`), và được dispose (giải phóng tài nguyên) cùng phạm vi phiên. Phiên subagent đã được định địa chỉ không mở lối vào nào trong hai lối vào trên, thư mục của nó từ chối nạp, chọn và làm mới khi kết nối lại, vì RPC mô hình thông thường gắn với agent (tác tử) sẽ kích hoạt lịch sử con được lưu bền ngoài đường thực thi tiếp tục của parent trực tiếp.

Mỗi thư mục thường trú đều kéo lại dữ liệu trực tiếp trên các sự kiện owner được chuyển tiếp `llm/adapters-updated` và `settings/document-updated`. Nhờ vậy topology provider, thư mục provider và lựa chọn mặc định đều hội tụ, Host và client runtime không cần phái sinh thêm một bí danh riêng cho sự kiện thay đổi mô hình.

Bề mặt export `/client` gồm chính plugin (`apply`/`inject`), `ModelDirectoryResolver`, `ModelDirectory` cùng hình dạng trạng thái của nó, và các kiểu của giao diện inject cho slot.

## Trải nghiệm mô hình

Ảnh hưởng gián tiếp. Cả hai lối vào đều gửi trọn `ModelSelection` qua RPC `session.selectModel` vốn chỉ dành cho phiên thông thường; Host sẽ chụp lại nó tại ranh giới lắp ráp prompt kế tiếp, nhờ đó các yêu cầu sau dùng provider, mô hình và mức độ suy luận đã chọn, còn bước đang chạy vẫn giữ lựa chọn đã lắp ráp. Lựa chọn chỉ được lưu bền sau khi header yêu cầu hiện có ghi nhận một yêu cầu thực sự áp dụng lựa chọn đó; thao tác trên menu không thêm nội dung prompt.

#### Ảnh hưởng KV Cache

Chuyển tuyến có thể làm giảm mức tái sử dụng cache cho các yêu cầu sau ở phía provider, hoặc làm nó mất hiệu lực; bản thân tiền tố prompt không bị ảnh hưởng.

## Hạn chế đã biết và phần tạm hoãn

- **Không chọn được lúc tạo phiên hay cho subagent đã định địa chỉ** — cả hai lối vào đều đòi agent của một phiên thông thường đã có; không có bước chọn mô hình dạng nháp để đưa vào lúc tạo phiên, và việc subagent tiếp tục thực thi cũng cố ý không mở ra một quy ước chọn mô hình riêng.
- **Tên thư mục chỉ để trình bày** — việc chọn và lưu bền dùng id của provider／mô hình／mức độ suy luận; provider có lỗi khi truy vấn thư mục hoặc truy vấn metadata mô hình chính xác sẽ được liệt kê thành dòng lỗi không chọn được, và giữ nguyên như vậy cho tới khi tải lại.
- **Không nhập tùy ý mức độ suy luận** — composer chỉ cung cấp các mức độ suy luận mà adapter công bố cho đúng mô hình đó; khi adapter không có metadata suy luận thì không hiển thị dòng Effort.
