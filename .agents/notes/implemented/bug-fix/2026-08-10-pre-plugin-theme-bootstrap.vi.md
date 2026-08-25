# Agent Note: Khởi tạo theme trước khi plugin kích hoạt

Status: implemented

[English](2026-08-10-pre-plugin-theme-bootstrap.md) | 中文

## Vấn đề

Shell Web hiển thị `Loading plugins…` trước khi cây plugin phía trình duyệt được kích hoạt. Token theme đã được nạp cùng style của shell, nhưng `color-scheme` và `body[data-ds-dark-theme]` chỉ được ghi khi ThemeRuntime của ui-theme và ThemePresenter của ui-layout được kích hoạt; khi tùy chọn đã lưu bền vững là theme tối, trang loading vì vậy sẽ vẽ theo bảng màu sáng trước, rồi mới chuyển sang tối.

`dshClient.immediately` chỉ đưa bundle vào giai đoạn prefetch đầu tiên, không khiến plugin thực thi trước khi HTML được parse hoặc shell render lần đầu. Chỉ điều chỉnh mức độ nạp của client plugin không thể đóng được khoảng thời gian này.

## Quyết định

Nửa host của ui-theme chuyển đổi mỗi HTML index thông qua `ctx.webServer.tapIndex()`, chèn một đoạn script inline đồng bộ ngay sau thẻ mở `<body>`. Việc chuyển đổi này đăng ký thông qua injection `httpServer` tùy chọn, nên các tổ hợp không có dịch vụ đó vẫn kích hoạt ui-theme, nhưng không cài đặt việc chuyển đổi. Khi trình phân tích HTML thực thi script này, body đã tồn tại, nhưng script module của shell và React root chưa chạy.

Khi settings provider tồn tại, nửa host sẽ đăng ký [section settings `ui-theme.preference`](2026-08-06-host-backed-web-preferences.md). Nó nhúng tùy chọn tích hợp sẵn đã qua xác thực bằng schema vào script inline cho mỗi phản hồi index; khi không có settings provider hoặc không có đăng ký hợp lệ thì nhúng giá trị mặc định `system`. Trình duyệt phân giải `system` thông qua `prefers-color-scheme`, khi không hỗ trợ `matchMedia` thì fallback về sáng. Script chỉ ghi hai trạng thái DOM mà ThemePresenter sẽ sở hữu về sau: `document.documentElement.style.colorScheme` và `body[data-ds-dark-theme]`.

Logic khởi tạo chỉ nhận biết ngữ nghĩa tích hợp sẵn `light`, `dark`, `system`, không đăng ký listener, cũng không phân giải theme bên thứ ba hay override token. Sau khi cây plugin phía trình duyệt kích hoạt, ThemeRuntime vẫn là nguồn có thẩm quyền cho trạng thái theme, ThemePresenter sẽ ghi lại kết quả phân giải đầy đủ vào cùng nhóm trạng thái DOM đó và chịu trách nhiệm cho các lần cập nhật và release về sau.

## Xác nhận

Unit test của ui-theme bao phủ việc kích hoạt khi không có bất kỳ dịch vụ Host tùy chọn nào, vị trí của script, ưu tiên settings của Host, tùy chọn hệ thống, thiếu `matchMedia`, input không có body, đọc settings trực tiếp, và việc đăng ký Host được release cùng plugin fiber. Kịch bản Chromium trên tổ hợp Web thật sẽ chọn tùy chọn tối đã lưu bền vững và chặn request bundle plugin, giữ cho trang loading vẫn quan sát được, sau đó khẳng định phản hồi index đã tạo ra nền tối, thuộc tính body và `color-scheme` ở phần tử gốc. Thay đổi này không đổi accessibility tree, nên không tạo ra golden trang mới nào.

## Các phương án thay thế đã cân nhắc

**Viết cứng logic vào `apps/web/index.html`.** Cách này có thể thực thi cùng thời điểm, nhưng HTML tĩnh không thể nhúng settings Host hiện tại, và sẽ sao chép lại việc phân giải tùy chọn cùng các trường DOM mà ui-theme đang sở hữu; việc chuyển đổi ở Host sẽ đi theo lifecycle của plugin theme, và giúp shell ứng dụng không cần biết về domain theme.

**Cho bundle client của ui-theme kích hoạt đồng bộ hoặc sớm hơn.** `immediately` chỉ điều khiển prefetch, việc khởi tạo instance plugin vẫn diễn ra sau khi shell bắt đầu chạy; việc chặn lần render đầu tiên cho đến khi ThemeRuntime kích hoạt sẽ trì hoãn giao diện loading và báo lỗi có thể nhìn thấy, đồng thời khiến cách hiển thị sự cố của shell phụ thuộc vào chính cây plugin mà nó đang theo dõi.

**Chỉ dựa vào CSS `prefers-color-scheme`.** Media query không thể đọc lựa chọn đã lưu bền vững tường minh, nên khi hệ điều hành đặt sáng còn người dùng chọn tối vẫn sẽ bị chớp.

**Thực thi trong `<head>` và thêm class tạm cho html.** Lúc đó body chưa tồn tại, còn cần thêm một bộ selector tạm khác với các thuộc tính bảng màu chính thức. Ngay sau `<body>` là vị trí parse sớm nhất có thể ghi trực tiếp vào các trường DOM chính thức.

## Hệ quả

Khung hình đầu tiên của trang loading khớp với tùy chọn tích hợp sẵn đã lưu bền vững; khi không tổ hợp settings provider thì mặc định dùng tùy chọn hệ thống. Việc chuyển đổi index sẽ đọc Host settings cho mỗi phản hồi, còn script inline chỉ chứa giá trị tích hợp sẵn đã chọn và logic phân giải `system`. Khi ngữ nghĩa tùy chọn tích hợp sẵn hoặc trường DOM của ThemePresenter thay đổi, cần cập nhật đồng thời cả script lẫn ThemeRuntime. Theme tùy chỉnh vẫn chỉ được áp dụng đầy đủ sau khi plugin trình duyệt kích hoạt; trong lúc loading, trang dùng bảng màu cơ sở sáng hoặc tối đã được phân giải từ theme đó.
