# Agent Note: Gỡ bỏ CLI demo độc lập

Status: implemented

[English](2026-08-08-remove-cli-demo.md) | Tiếng Việt

## Vấn đề

Sau khi [`dsh --profile headless`](../architecture/2026-08-06-app-owned-command-line.md) trở thành lệnh chạy một lần của sản phẩm, `@deepseek-ai/dsh-cli-demo` vẫn là gói ứng dụng thứ hai gánh cùng một công việc. Nó sở hữu riêng một bộ file thực thi, cú pháp tham số, tổ hợp ứng dụng, vòng đời hủy bỏ, quy ước đầu ra text／JSON／stream-JSON, sản phẩm build, tài liệu đi kèm và bộ test. Cây tổ hợp của hai lối vào cũng khác nhau, nên demo chạy thành công không chứng minh được profile `headless` đã bàn giao là dùng được, và người dùng còn phải chọn giữa những lệnh chồng chéo chức năng.

Bộ test replay vẫn cần các sự kiện session chuẩn tắc để ghim hành vi backend sau khi tổ hợp. Nhu cầu kiểm thử này không đòi hỏi một lệnh đã phát hành hay quy ước tương thích nào.

## Quyết định

Xóa hoàn toàn `@deepseek-ai/dsh-cli-demo`: bao gồm gói, bin, parser, plugin ứng dụng, định dạng đầu ra, test, tham chiếu workspace, mục trong danh mục sinh tự động và tài liệu hiện hành. Không giữ lại alias hay gói tương thích. Người dùng bản mã nguồn gọi lệnh sản phẩm qua `pnpm dsh --profile headless`; văn bản cuối trên stdout, chẩn đoán lỗi trên stderr, việc lưu bền, trạng thái thoát và hành vi đóng đều do lệnh đó chịu trách nhiệm.

`examples/headless-agent` trở thành tổ hợp kiểm thử tường minh. Cấu hình Loader của nó mount `@deepseek-ai/dsh-agent-spine-demo`, một root agent, persistence JSONL và chính sách checkpoint thành các dòng cấu hình riêng biệt, không còn giấu chúng sau một gói tổ hợp ứng dụng. Gói `@deepseek-ai/dsh-loader-smoke` ở tầng hỗ trợ đảm nhiệm helper lượt agent trực tiếp dùng chung; driver cục bộ không được export của ví dụ chọn cấu hình Loader riêng và render các sự kiện chuẩn tắc thành JSONL. Những driver này chỉ do test khởi chạy, không cung cấp bin, và cũng không định nghĩa định dạng đầu ra sản phẩm được hỗ trợ.

## Các phương án đã cân nhắc

- **Giữ `dsh-cli-demo` làm alias hoặc lớp bọc cho `dsh --profile headless`.** Không chấp nhận: một bin và một gói thứ hai sẽ khiến cùng một chức năng tiếp tục có hai nơi sở hữu có thể tìm thấy được, mà chẳng thêm năng lực nào.
- **Chuyển các cờ JSON và stream-JSON sang `dsh --profile headless`.** Không chấp nhận: hiện không có bên tiêu thụ sản phẩm nào cần các cờ này; kế thừa giao thức demo cũ chỉ làm phình quy ước CLI (giao diện dòng lệnh) chuẩn tắc để giữ lại một cơ chế kiểm thử.
- **Xóa luôn snapshot sự kiện chuẩn tắc cùng với gói.** Không chấp nhận: những snapshot này ghim hành vi tổ hợp mà mô hình nhìn thấy, còn nghiệm thu sản phẩm chỉ kiểm tra văn bản cuối thì không quan sát được các hành vi đó.
- **Giữ plugin ứng dụng, chỉ xóa bin của nó.** Không chấp nhận: tổ hợp ẩn vẫn lặp lại profile headless tường minh và che khuất việc lá kiểm thử đã mount những service nào.

## Hệ quả

Đây là thay đổi phá vỡ tương thích có chủ ý. `dsh-cli-demo`, tùy chọn `--output-format` của nó và các import tới `@deepseek-ai/dsh-cli-demo/src/cli.ts` đều không còn phân giải được. Thay đổi này không cung cấp giao diện luồng sự kiện công khai thay thế; bên gọi dùng `dsh --profile headless` để chạy tác vụ một lần, còn khi cần tự động hóa có cấu trúc thì phải chọn một giao diện giao thức sẵn có.

Kho mã giữ lại độ phủ replay backend bằng hạ tầng chỉ dành cho test, còn smoke test sản phẩm và nghiệm thu built-bin thì chạy `dsh --profile headless`. Chỉ khi một gói chạy-một-lần độc lập đảm nhiệm một giao thức thực sự độc lập, có phiên bản riêng và không thể thuộc về launcher sản phẩm, thì nó mới được đưa lại; cách viết lệnh thứ hai hay một shim đầu ra không đủ làm lý do.

## Kiểm chứng

Smoke test Loader tập trung phủ tổ hợp tường minh ở cả chế độ mã nguồn lẫn chế độ build chạy bằng Node thuần, snapshot test đối chiếu JSONL chuẩn tắc và log persistence của nó, nghiệm thu sản phẩm phủ `dsh --profile headless`, còn kiểm tra tài liệu cùng cổng đồ thị／danh mục sinh tự động thì từ chối mọi tham chiếu còn sống tới gói đã gỡ. Kho lưu trữ Agent Note đã đóng băng được giữ làm chứng cứ lịch sử và sẽ không bị viết lại.
