# Agent Note: Script cài đặt bỏ qua clone khi chạy bên trong thư mục checkout

Status: implemented

Archived: 2026-07-26

[English](2026-07-22-installer-in-repo-skip-clone.md) | 中文

## Vấn đề

`scripts/install.sh` được viết cho đường dẫn `curl ... | sh`: nó clone harness vào `~/.dsh/source`, rồi cài đặt, tạo symlink và khởi động. Contributor đã có sẵn checkout, nếu chạy trực tiếp cùng script đó (`sh scripts/install.sh`), sẽ nhận được một bản clone thứ hai không liên quan tại `~/.dsh/source` — cài đặt và symlink trỏ tới một cây khác với cây họ đang làm việc, và không có cách nào dùng script local để kiểm chứng mã nguồn local.

## Quyết định

Script sẽ phát hiện xem bản thân nó có đang chạy bên trong một checkout thật hay không; trong chế độ đó, nó tái sử dụng checkout này và bỏ qua hoàn toàn bước clone/update, giữ nguyên working tree không bị ảnh hưởng.

Việc phát hiện dựa trên `$0`: dưới `curl ... | sh`, văn bản script đến qua stdin, nên `$0` là tên shell, không có đường dẫn để phân giải; chạy bản đã checkout khiến `$0` chính là file script đó. Khi `$0` là một file đọc được, thư mục cha của nó là một thư mục `scripts/`, và cây đó có cả launcher `bin/dsh` lẫn `scripts/install.sh`, script sẽ đặt `IN_REPO=1` và trỏ lại `DSH_SOURCE` về gốc repo đó. Bước 2 sau đó in ra một dòng "using existing checkout" và không làm gì khác — không chạy `git fetch`, không chạy `git checkout -B`, nên working tree và branch của người dùng không bao giờ bị thay đổi. `DSH_REF` trong chế độ này chỉ mang tính tham khảo và bị bỏ qua.

`DSH_SOURCE` tường minh được ưu tiên hơn việc phát hiện: giá trị này được bắt trước khi áp giá trị mặc định, việc phát hiện chỉ trỏ lại `DSH_SOURCE` chưa được đặt (hoặc đã bằng đúng gốc repo được phát hiện). Đặt `DSH_SOURCE` thành một thư mục khác sẽ quay lại đường dẫn clone/update bình thường, do đó vẫn còn lối thoát để cài đặt một cây độc lập khác từ bên trong thư mục checkout.

## Phương án thay thế

**Phát hiện bằng cách chạy `git rev-parse --show-toplevel` trên thư mục hiện tại.** Đã bác bỏ: `curl ... | sh` thường chạy bên trong một git repo không liên quan (`cwd` của người dùng), điều này sẽ phán đoán sai và bỏ qua clone cho một cây không phải dsh. Neo quyết định vào vị trí của chính `$0` khiến nó gắn với nơi script thực sự nằm, còn dấu hiệu `bin/dsh` + `scripts/install.sh` xác nhận đó đúng là một checkout dsh.

**Luôn bỏ qua clone miễn là chạy từ file, bỏ qua `DSH_SOURCE`.** Đã bác bỏ: contributor có thể hợp lý muốn chạy script trong checkout để cấu hình một bản cài đặt `~/.dsh/source` độc lập; tôn trọng `DSH_SOURCE` tường minh khác với checkout giữ lại đường dẫn đó.

## Ảnh hưởng

Giờ đây chạy `sh scripts/install.sh` từ thư mục checkout sẽ cài đặt, symlink và khởi động chính checkout đó, thay vì clone một bản song song, điều này cũng cho phép script local test được với mã nguồn local. Cái giá phải trả là một đoạn logic phát hiện gắn chặt với bố cục repo (`scripts/` nằm cạnh `bin/dsh`); nếu launcher hoặc script di chuyển trong tương lai, dấu hiệu này phải di chuyển theo. Hành vi này được ghi lại ở đầu script và trong hai file README, và được kiểm chứng qua bốn đường chạy (bỏ qua khi trong checkout, clone kiểu curl, `DSH_SOURCE` tường minh trỏ nơi khác nên quay lại clone, `DSH_SOURCE` tường minh bằng đúng gốc repo vẫn bỏ qua).
