# Agent Note: minimal preset sở hữu toàn bộ thành phần cấu tạo RL agent

Status: implemented

[English](2026-08-10-minimal-preset-owns-rl-composition.md) | 中文

## Vấn đề

Cấu hình Web đi kèm định nghĩa RL agent (tác nhân) tương thích với Claude SWE ở cả hai nơi cùng lúc: patch cấp tiến trình `core-web.cordis.yml`, và preset `minimal` theo từng phiên. Sau khi [agent preset](../architecture/2026-08-03-per-session-agent-presets.md) trở thành ranh giới thành phần cấu tạo agent, `deployment:persona` có scope trong preset sẽ che khuất persona global đã được overlay sửa lại, bằng văn bản coding-agent cũ. Test overlay không mount preset, còn test preset khởi động mà không có overlay, nên cả hai đều không bao phủ được tổ hợp mà người dùng thực sự chọn.

Sự tách rời này còn che giấu những sai lệch khác. Preset mount Bash một lần (one-shot) thay vì [Bash thường trú](../feature/2026-07-29-persistent-bash-str-replace-editor.md) mà RL harness sử dụng, và bỏ sót chính sách nén (compaction) của RL. Giữ hai chủ sở hữu sẽ khiến mỗi lần sửa prompt, tool hoặc policy sau này đều phải xác minh tổ hợp giao nhau của cả hai.

## Quyết định

Preset Web `minimal` đi kèm là chủ sở hữu duy nhất của thành phần cấu tạo RL agent trong Web. Nó khai báo registry PTY cục bộ theo entry cùng backend cục bộ, `bash` thường trú kèm mô tả môi trường RL với timeout 300 giây, và `str_replace_editor`. Cách trình bày tool vẫn do deployment lựa chọn. [Quyết định về runtime hai-tool trần](../feature/2026-08-11-minimal-profiles-bare-two-tool-runtime.md) sau đó đã thay thế lựa chọn nén và filesystem provider ban đầu của note này: preset hiện tại mount provider `fs-local` cục bộ theo entry, không mount backend nén. Editor không nhận setting `requireAbsolutePath`, vì yêu cầu đường dẫn tuyệt đối là quy ước vô điều kiện của nó.

Persona của preset chỉ vỏn vẹn là `You are a helpful software engineer assistant.`, nó đặt `complete: true`, và ức chế runtime context cho scope agent của nó. `PromptSection` complete vẫn tham gia vào quá trình lắp ráp thông thường, nên tool, biến và listener hợp tác vẫn được phân giải; sau khi waterfall (sự kiện dạng thác nước) `system-prompt/assemble` kết thúc, prompt registry sẽ khôi phục bản sao độc lập của section đó thành section prompt hệ thống duy nhất, và loại bỏ mọi đóng góp ngữ cảnh động. Khi tồn tại nhiều section complete hợp lệ, việc lắp ráp sẽ bị từ chối. Các ràng buộc cuối cùng ở cấp registry này ngăn danh tính harness, định vị Web, hướng dẫn tool, listener lắp ráp, sandbox policy, approval policy, delegation hoặc bất kỳ provider ngữ cảnh động nào khác thêm vào input của model.

Patch cấp tiến trình `core-web.cordis.yml` không còn tồn tại. Browser UI, workspace attach, lưu bền vững, subprocess, sandbox, quyền hạn, định tuyến model và các dịch vụ xuyên phiên khác vẫn do host nắm giữ. Chọn `minimal` sẽ thay đổi thành phần cấu tạo hướng tới model của một agent, và chỉ che khuất filesystem provider của host cho đúng agent đó, không thay đổi các phiên khác trong tiến trình Web.

## Xác nhận

Test của package system-prompt và persona chứng minh ràng buộc cuối cùng của section complete và việc ức chế runtime-context, bao gồm cả sửa đổi waterfall và việc từ chối trùng lặp. Test thành phần cấu tạo preset khi giao hàng khẳng định chính xác prompt, mô tả Bash, schema editor yêu cầu đường dẫn tuyệt đối và catalog hai tool dưới cách trình bày native mặc định. Bản replay Web không cần key gửi một request thật qua agent `minimal`, đồng thời đăng ký danh tính global, văn bản định vị Web, ngữ cảnh policy động và một section test; nó khẳng định không tồn tại snapshot runtime-context, filesystem cục bộ theo entry là backend trần và không có nén, sau đó thực hiện hai lời gọi Bash thường trú để chứng minh trạng thái môi trường và cwd được giữ lại, và thực thi editor bằng đường dẫn tuyệt đối.

[`minimal.cordis.yml`](../../../../examples/jsonrpc-agent/minimal.cordis.yml) độc lập là thành phần cấu tạo hai-tool đầy đủ của runtime JSON-RPC tích hợp sẵn. [Quyết định về runtime hai-tool trần](../feature/2026-08-11-minimal-profiles-bare-two-tool-runtime.md) giải thích cấu hình môi trường riêng cho cách khởi động của nó, filesystem trần và lựa chọn không nén. Bản replay SDK không cần key của nó khẳng định prompt hệ thống đã lắp ráp và catalog hai tool, thực thi Bash thường trú xuyên nhiều lời gọi, và sử dụng editor; tutorial Python SDK cung cấp entry point có thể chạy được.

## Các phương án thay thế đã cân nhắc

**Giữ `core-web.cordis.yml` như một patch tương thích.** Bị bác bỏ, vì patch cấp tiến trình và preset cấp phiên là hai chủ sở hữu riêng biệt của cùng một quy ước agent; thứ tự ưu tiên sẽ khiến bên nào cũng có thể âm thầm ghi đè cấu hình của bên kia.

**Tắt từng đóng góp prompt đã biết trong preset.** Bị bác bỏ, vì hàng vi của host thuộc về toàn bộ tiến trình, đóng góp mới cũng sẽ mở lại prompt. Chỉ có việc thực thi ràng buộc section complete cuối cùng ở registry lắp ráp prompt mới diễn đạt được đảm bảo phủ định này.

**Chỉ dùng listener waterfall tiền xử lý để lọc section.** Bị bác bỏ, vì một lớp bọc tiền xử lý khác có thể thực thi bên ngoài listener đó và thêm nội dung vào sau khi đã lọc. Chỉ có việc thực thi ràng buộc sau khi toàn bộ waterfall kết thúc mới ổn định nắm được quyền quyết định cuối cùng.

**Mount dịch vụ PTY trên host Web.** Bị bác bỏ, vì chỉ có agent minimal tiêu thụ các dịch vụ này. Realm `pty` cục bộ theo entry có cùng lifecycle và scope với consumer duy nhất của nó, không cần preset publish thành dịch vụ global cấp tiến trình.

## Hệ quả

Prompt RL của Web cố định, không thể ghi đè qua môi trường; prompt JSON-RPC độc lập do deployment lựa chọn. Preset Web và example JSON-RPC độc lập khai báo cùng một quy ước hai-tool ở đường khởi động riêng của mỗi bên. Model chỉ thấy `bash` thường trú và `str_replace_editor`; trạng thái shell được cô lập theo từng agent, và biến mất cùng agent đó. Preset Web gánh chi phí cho instance dịch vụ PTY và filesystem trần của riêng nó, các preset khác không phải gánh. Backend cục bộ của shell thường trú cần môi trường terminal POSIX được hỗ trợ nền tảng, nên preset này không hỗ trợ agent Windows.
