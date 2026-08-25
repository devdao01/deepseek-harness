# dsh-agent-tool-presentation

[English](README.md) | 中文

Dòng dùng trong [agent preset](../../preset/agent-presets/README.md) để khai báo "model nhìn thấy công cụ ở hình thái nào": `native` (toàn bộ schema), `code` (chỉ có `run_code` cùng một SDK TypeScript được sinh ra) hoặc `both`.

## Vì sao là một dòng plugin, thay vì chuyển registry xuống

Registry công cụ không thể chuyển vào preset. Các bên tiêu thụ nó đều nằm ở mặt phẳng host — [`dsh-agent-loop`](../agent-loop/README.md) đọc bộ điều phối của nó, [`dsh-apiproxy`](../../host/apiproxy/README.md) đọc presenter của nó để hiển thị thẻ công cụ, mỗi plugin công cụ đều đăng ký vào đó — mà một service chỉ có thể chuyển xuống khi **tất cả** bên tiêu thụ cùng chuyển xuống.

Cái mà preset có thể sở hữu là **cách trình bày** registry này. `ctx.tools.presentAs()` chỉ khai báo cho agent đang được mount, vì vậy một phiên Code Mode có thể cùng tiến trình tồn tại song song với nhiều phiên native, mỗi phiên nhìn thấy danh mục riêng của mình. `mode` trên dòng của [`dsh-tools`](../tools/README.md) vẫn là giá trị mặc định, dành cho agent chưa khai báo.

## Nó làm gì

`native` có hiệu lực ngay lập tức. Các chế độ dạng code thì chờ `ctx.codeRuntime` — đây là một service ở mặt phẳng host ([`dsh-code-runtime-worker-thread`](../../code-runtime/code-runtime-worker-thread/README.md)): nếu một preset chọn Code Mode trên một bản triển khai chưa lắp ráp runtime, dòng này sẽ dừng ở trạng thái pending, `dsh-agent-presets` sẽ chỉ đích danh id này để từ chối mount. Cách làm khác — áp dụng lạc quan trước — sẽ đẩy lỗi sang lần yêu cầu đầu tiên của phiên đó, lúc mà người vận hành không còn cách nào can thiệp vào preset và việc lắp ráp nữa.

`mode` là bắt buộc, không có giá trị mặc định: preset không có dòng này vốn dĩ sẽ nhận giá trị mặc định khi triển khai, bỏ nó đi tức là dòng này được lắp ráp một cách vô ích.

Một agent chỉ khai báo cách trình bày một lần. Khai báo lần thứ hai trong cùng một lần lắp ráp sẽ bị từ chối thay vì được gộp lại: đưa ra hai câu trả lời cho câu hỏi "model nhìn thấy hình thái nào" là mâu thuẫn, không phải ghi đè.

## Trải nghiệm model

Có hiệu lực gián tiếp, tùy thuộc vào phép chiếu mà nó chọn trong `dsh-tools`: `code` trình bày `run_code`, một đoạn SDK được sinh ra, và quy tắc "chỉ `run_code` mới có thể được gọi trực tiếp"; `native` trình bày schema của từng công cụ. Lựa chọn này đồng thời quyết định **cái gì có thể thực thi**: trong `code`, registry sẽ phân giải việc model gọi thẳng tên bất kỳ công cụ nào khác thành `UNKNOWN_TOOL`, do đó chính dòng này giữ cho "mặt thông báo" và "mặt có thể gọi" nhất quán với nhau đối với mỗi agent mà nó bao phủ (xem [ghi chú thiết kế về sự sụp đổ executor](../../../.agents/notes/implemented/bug-fix/2026-08-07-code-mode-executor-collapse.md)).

#### KV Cache effect

Không có ảnh hưởng làm mất hiệu lực trực tiếp; cách trình bày được cố định ngay khi lắp ráp agent, do đó tiền tố yêu cầu của nó giữ ổn định trong suốt vòng đời phiên đó.

## Hạn chế đã biết và việc còn hoãn lại

- **Runtime vẫn nằm ở mặt phẳng host** — preset có thể chọn Code Mode, nhưng không thể tự mang theo runtime TypeScript mà nó cần; bản triển khai chưa lắp ráp runtime cũng vì vậy không thể lắp ráp bất kỳ preset chế độ code nào.
