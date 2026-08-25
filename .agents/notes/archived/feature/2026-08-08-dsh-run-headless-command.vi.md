# Agent Note: `dsh run` chịu trách nhiệm thực thi headless một lần

Status: implemented
Archived: 2026-08-10

[English](2026-08-08-dsh-run-headless-command.md) | 中文

> **Cú pháp lệnh đã bị thay thế.** [Ứng dụng giờ tự giữ command line của riêng mình](../architecture/2026-08-06-app-owned-command-line.md): dòng khởi động headless parse task từ `dsh --profile headless <task...>`, launcher không còn chứa lệnh gọi `run`, cũng không còn patch văn bản task vào dòng cấu hình. Note này giữ lại bối cảnh thiết kế do launcher giữ đã bị từ chối; ràng buộc thực thi trực tiếp và hoàn tất mà nó đã chọn vẫn được [headless là điểm vào core trực tiếp](../architecture/2026-08-09-headless-direct-core-entry-point.md) giữ.

## Vấn đề

Khởi động profile thông thường và thực thi task một lần có ràng buộc vòng đời khác nhau. Nếu cú pháp gốc chấp nhận văn bản task tùy chọn, cùng một hình dạng argv có thể biểu thị tiến trình thường trực hoặc task kết thúc, ý nghĩa cụ thể tùy thuộc vào dòng cấu hình plugin chỉ được phát hiện sau khi tổ hợp xong. Nó còn phơi bày chi tiết triển khai profile thành lệnh người dùng chính, và khiến profile tùy chỉnh thiếu điểm vào một lần rõ ràng.

Động từ `run` phải chỉ có một ý nghĩa cấp cao nhất. Dùng chung động từ đó với thực thi file ứng dụng, hoặc suy diễn ý nghĩa dựa trên hình dạng positional argument, đều tạo ra sự mơ hồ giống nhau.

## Quyết định

Thực thi một lần dùng cú pháp sau:

```text
dsh run [--profile <name>] [--patch <path>...] <task...>
```

`--profile` mặc định là `headless`, và hỗ trợ tổ hợp một lần tùy chỉnh. `--patch` có thể lặp lại, và chiếm layer overlay bình thường. Commander nối các tham số task với số lượng thay đổi bằng khoảng trắng, và từ chối task thiếu hoặc trống trước khi khởi động.

`RunInvocation` là một thành viên `DshInvocation` riêng biệt. Lệnh gọi profile thông thường không mang trạng thái task, cũng không nhận positional argument. Cả hai đường phân phối đều dùng `runProfile`: khởi động profile bỏ qua `task`, còn `run` cung cấp trường đó. Profile một lần thiếu `headless-runner` sẽ kích hoạt kiểm tra dòng tổ hợp; nếu profile được khởi động chứa dòng đó nhưng không cung cấp task, lỗi sẽ chỉ đến `dsh run --profile <name> "<task>"`.

[Quyết định gói plugin profile](../architecture/2026-08-05-profile-plugin-bundles.md) chịu trách nhiệm tổ hợp. [Headless là điểm vào core trực tiếp](../architecture/2026-08-09-headless-direct-core-entry-point.md) chịu trách nhiệm ràng buộc thực thi: một session bền vững mới, văn bản assistant cuối cùng trên stdout, ánh xạ exit status completed/không completed, stderr rỗng khi thành công, không có cổng lắng nghe, và đóng có giới hạn theo tín hiệu sau khi Agent dừng hoàn toàn và session đã flush.

Động từ `run` chỉ chịu trách nhiệm thực thi task một lần. Khởi động file ứng dụng cần một tên lệnh khác.

## Các phương án thay thế đã cân nhắc

| Phương án thay thế | Điểm không khớp ràng buộc |
|---|---|
| Đặt văn bản task trên lệnh khởi động profile gốc | Ý nghĩa vòng đời phụ thuộc vào dòng cấu hình plugin chỉ được phát hiện sau khi parse. |
| Chấp nhận alias lệnh gốc như `dsh -p` | Cú pháp tiền phát hành có được một nhánh tương thích không thuộc về bất kỳ lệnh hiện tại nào. |
| Yêu cầu chỉ định `--profile headless` | Surface một lần đi kèm mất đi cách viết chuẩn ngắn nhất. |
| Dùng `dsh run` cho file ứng dụng | Một động từ cấp cao nhất có hai ý nghĩa, lệnh task chính cũng trở nên gián tiếp. |
| Thêm `apps/cli/src/run.ts` chỉ để chuyển tiếp | Quyền sở hữu lệnh bị chia tách, nhưng không ẩn giấu độ phức tạp nào. |

## Hệ quả

Thông tin trợ giúp, tài liệu, test parser, xác minh binary sau build, coverage đóng PTY, và snapshot không cần key của ứng dụng đã lắp ráp đều dùng `dsh run`. Profile một lần tùy chỉnh dùng `--profile`; khởi động profile thường trực và dump cấu hình dùng cú pháp profile gốc. Thực thi file ứng dụng là mối quan tâm lệnh độc lập.
