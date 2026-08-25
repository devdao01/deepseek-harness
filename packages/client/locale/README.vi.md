# @deepseek-ai/dsh-client-locale

[English](README.md) | Tiếng Việt

Plugin locale: LocaleRuntime — tùy chọn `zh`／`en` được lưu ở `locale.preference` trong `$DSH_HOME/settings.yaml`; nếu không có giá trị Host tường minh, trình duyệt hoàn toàn mới sẽ tạm dùng ngôn ngữ mà `navigator` yêu cầu (khớp theo thẻ con chính; nếu ngôn ngữ nó yêu cầu vốn không được ứng dụng này cung cấp thì dùng `zh`). Việc đọc từ Host diễn ra sau khi plugin kích hoạt, nên việc dịch vụ settings không khả dụng sẽ không chặn trang; kết quả đọc sẽ thay thế giá trị tạm của trình duyệt theo thời gian thực. API settings chỉ giới hạn cho yêu cầu loopback, nên lựa chọn của trình duyệt từ xa chỉ được giữ trong tiến trình. `locale/change` chỉ kích hoạt khi chuyển đổi ngôn ngữ. Dịch vụ này còn sở hữu registry từ điển ns×locale (`register(ns, {zh, en})` có kiểu, được kiểm tra theo `LocaleNamespaceMap`, `bind(ns)`→`TranslateNS<ns>`; chuỗi tra cứu ns → common → zh → key), hiện thực `LocaleFace` của hệ thống slot, và tự cài đặt qua `ctx.slots.installLocale`, làm nền cho ghế tiêu chuẩn `t` do framework tiêm vào (`Translate`／`TranslateNS` là kiểu của ui-slots; hãy import từ đó — phần tái xuất của gói này chỉ nhằm tiện lợi cho bên sở hữu từ điển). Ranh giới lưu trữ bền vững này thuộc về [quyết định tùy chọn được Host settings hậu thuẫn](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.md).

## Trải nghiệm mô hình

Không có. Registry locale phục vụ văn án UI trong trình duyệt; không có nội dung nào ở đây đi vào yêu cầu gửi tới mô hình.

#### Ảnh hưởng tới KV Cache

Không có; gói này không lắp ráp cũng không gửi yêu cầu tới nhà cung cấp.

## Giới hạn đã biết và phần tạm hoãn

- **Một phần giao diện vẫn giữ văn án nội tuyến** — hàng thiết lập, thanh bên, bộ trả lời câu hỏi và phần chọn mô hình dùng locale seat; các gói khác vẫn tự sở hữu văn bản tĩnh trực tiếp.
- **Văn bản do registry nắm giữ chỉ đọc bản dịch một lần** — văn án được thu tại thời điểm đăng ký, nằm ngoài đường render của slot (ví dụ mô tả lệnh `/model` trong registry command), sẽ giữ nguyên ngôn ngữ lúc đăng ký cho đến khi đăng ký lại; văn án do slot render thì cập nhật theo thời gian thực khi chuyển ngôn ngữ.
