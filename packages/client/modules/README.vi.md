# @deepseek-ai/dsh-client-modules

[English](README.md) | Tiếng Việt

Hệ thống module phía client: bản tương đương phía trình duyệt của ESM loader nội bộ trong Node, hiện thực bằng bảng CJS lười. Vỏ web gắn vendored cordis Loader để quản trị các mục cấu hình (vòng đời fiber, chờ inject, update/refresh), và tiêm `ClientModuleLoader` của gói này qua giao ước `internal` của nó; điểm tiêu thụ duy nhất ở phía vendored là `EntryTree.import`, nên thay thế `internal` chỉ đúng thay thế «mã plugin đến bằng cách nào», không thay đổi gì khác.

Mô hình CJS lười (web2): thực thi bundle plugin chỉ đăng ký factory của nó (`window.__ModuleLoader__.load({id, factory})`); mọi hiệu ứng phụ của thân module (bao gồm cả việc tiêm CSS) đều nằm trong closure của factory và chỉ chạy khi vật chất hóa (`factory(require)` → bề mặt export, và được ghi nhớ trong `loadCache`), chứ không chạy lúc script được thực thi. Nếu factory phụ thuộc vào một module khác đã đăng ký nhưng chưa vật chất hóa, hệ thống sẽ vật chất hóa module đó theo kiểu đệ quy, nên thứ tự nạp không cần điều phối từ bên ngoài; vòng lặp require sẽ ném ngoại lệ (CJS dạng factory không thể cung cấp export từng phần). `<id>/client` và id trần trỏ tới cùng một bề mặt (một bundle plugin chính là phía client của gói đó).

Thứ tự nhánh phân giải (`import(specifier)`): từ mầm nền tảng → thực thể vỏ; bản ghi đã ghi nhớ → bề mặt; registry tĩnh của chính vỏ (`registerStatic`, app-shell) → module; factory đã đăng ký → vật chất hóa; bản ghi đồ thị module (`window.__DSH_BOOT__`) → nạp classic script bên ngoài + vật chất hóa; các trường hợp khác đều ném ngoại lệ. Đây là tấm gương phản chiếu lúc chạy của cổng kiểm tra độ thuần khiết bundle tại thời điểm build. Hàm `require` đồng bộ được giao cho factory dùng cùng thứ tự đó, nhưng không có nhánh nạp bất đồng bộ, và ghi lại các cạnh quan sát được vào bản ghi module. `prefetch` là hook đến ở giai đoạn đầu (chỉ nạp script và đăng ký factory; các lời gọi đồng thời dùng chung một tác vụ đang chạy); `invalidate` sẽ loại bỏ factory cùng bản ghi vật chất hóa, khiến lần prefetch/import kế tiếp nạp lại script; đó là hook HMR (thay thế module nóng).

Phía Node sẽ quét các mục cấu hình Loader đã bật để phát hiện gói web `dsh.client`, phân giải từng `exports["./client"]`, ghi hash của bundle sau khi build vào đồ thị khởi động, và phục vụ tệp đó cùng sourcemap của nó qua `/plugins`. Khởi động từ mã nguồn sẽ ánh xạ import phía host về mã nguồn TypeScript, nhưng vẫn tiêu thụ export client đã build này; các tệp bị thiếu dùng chung một thông báo build, sau đó liệt kê từng mục theo danh sách gói／đường dẫn, còn các lỗi hệ thống tệp không liên quan vẫn là sự cố độc lập.

## Trải nghiệm mô hình

Không có. Module loader thuộc cơ chế nhân phía trình duyệt; không có nội dung nào ở đây đi vào yêu cầu gửi tới mô hình.

#### Ảnh hưởng tới KV Cache

Không có; gói này không lắp ráp cũng không gửi yêu cầu tới nhà cung cấp.

## Giới hạn đã biết và phần tạm hoãn

- **Cố ý dùng đồ thị module phẳng**: mỗi bundle là một nút module, và các cạnh của nó chỉ trỏ tới nút lá trong bảng; giao diện (`loadCache`/`edges`/`invalidate`) vốn đã hỗ trợ đồ thị module tổng quát, nên có thể thay đổi độ mịn của externalization mà không đổi giao diện.
- **Tự nó không duy trì bản ghi gỡ tải**: việc gỡ style và thứ tự tháo dỡ fiber thuộc về bộ điều khiển HMR (`@deepseek-ai/dsh-client-hmr`); loader chỉ ghi nhận id của các thẻ style mà nó sở hữu trong từng bản ghi.
