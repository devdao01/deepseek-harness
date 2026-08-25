# Agent Note: Ví dụ MCP bộ nhớ (memory) bên thứ ba

Status: implemented

[English](2026-07-31-third-party-memory-mcp-examples.md) | 中文

## Vấn đề

Tích hợp trực tiếp một nhà cung cấp cụ thể sẽ khiến API, cấu hình, hành vi trạng thái sức khỏe (health) và ngữ nghĩa công cụ của nhà cung cấp đó trở thành một phần của DSH. Đối với những chức năng vốn đã có thể diễn đạt qua MCP, cách làm này sẽ khiến giao diện sản phẩm phình to, và mỗi lần kết nối thêm một hệ thống bộ nhớ lại phải lặp lại đúng công việc thích ứng đó. Người dùng cần một cách tinh gọn, có thể kiểm tra được, để bật một MCP server bộ nhớ bên ngoài, trong khi vẫn giữ nguyên biên MCP chung.

Tiêu chí nghiệm thu không chỉ dừng ở "socket kết nối được": mỗi cấu hình tham khảo phải chứng minh DSH thực sự ghi được ở phiên A, gọi lại (recall) được từ nhà cung cấp trong một phiên DSH mới B, và sử dụng được giá trị đã gọi lại. Trong khi đó, việc tải xuống nhà cung cấp, tài khoản, model, embedding, khởi tạo lưu trữ và tiến trình HTTP độc lập vẫn do bên upstream chịu trách nhiệm.

## Quyết định

Cung cấp ba ví dụ overlay Cordis mặc định tắt tại `examples/mcp-memory`: Memorix, MCP Reference Memory và Engram. Mỗi file chỉ chèn một mục cấu hình `@deepseek-ai/dsh-mcp-client`. Bộ tổ hợp đã bàn giao (shipped composition) không tham chiếu các file này; CLI chỉ khai báo bridge chung, để người dùng chọn overlay một cách rõ ràng thì mới được phân giải.

Các cấu hình bên thứ ba này chỉ mang tính tham khảo về khả năng tương tác; việc thu nạp không đồng nghĩa với sự chuẩn thuận, khuyến nghị, quan hệ hợp tác hay cam kết hỗ trợ liên tục nào từ DeepSeek. Hệ thống không có registry preset bộ nhớ, không có plugin DSH riêng cho từng nhà cung cấp, không có dịch vụ bộ nhớ chung, không có UI cài đặt, không có tầng migrate, không có health checker hay bộ điều khiển kết nối lại. Các MCP server bộ nhớ khác có thể dùng cùng các mục cấu hình stdio hoặc Streamable HTTP trong cùng tài liệu.

## Ranh giới trách nhiệm

| Việc | DSH | Nhà cung cấp upstream hoặc người dùng |
|---|---|---|
| Phân giải overlay đã chọn | Có | Chọn một file |
| Khởi động lệnh stdio, và dừng nó khi plugin dispose (giải phóng tài nguyên) | Có | Cài đặt executable phiên bản cố định |
| Kết nối Streamable HTTP và phát hiện công cụ | Có | Chạy và giám sát dịch vụ HTTP |
| Đăng ký công cụ dưới dạng `mcp__<serverName>__<rawName>` | Có | Định nghĩa schema và hành vi công cụ |
| Tài khoản, xác thực, model, embedding, khởi tạo lưu trữ | Không | Có |
| Migrate dữ liệu, retry, khôi phục sau crash của nhà cung cấp | Không | Có |

Đường truyền tải (transport) stdio chung sẽ xóa các biến môi trường có tên giống credential và các biến `DSH_*`, đồng thời kế thừa các biến môi trường khác. Ví dụ cơ sở chỉ thêm các mục ghi đè bắt buộc; khóa nhà cung cấp tùy chọn phải được thêm vào `config.env`, hoặc cấu hình trong file riêng của nhà cung cấp.

## Cố định phiên bản, lưu trữ và danh tính

| Nhà cung cấp | Quy ước đã kiểm thử |
|---|---|
| Memorix | npm `1.3.0`, tag commit `500792cad3144142293bfbb20acb4841c9f7fcfa` |
| MCP Reference Memory | npm `2026.7.4`, package commit `6dd0a683e198783e30feabf7abaf42f925bd18b1` |
| Engram | tag `v1.20.0`, commit `ba9e46ced152c37a7cb9e576153c41995873e2fc` |

Việc lưu trữ vẫn thuộc trách nhiệm của nhà cung cấp. Memorix mặc định dùng `~/.memorix/data`, Engram mặc định dùng `~/.engram`. Ví dụ Reference Memory thiết lập đường dẫn ổn định `$HOME/.dsh-mcp-reference-memory.jsonl`, thay vì ghi vào thư mục package npm đã cài. Các biến môi trường riêng của mỗi nhà cung cấp đều có thể ghi đè các vị trí này trước khi DSH khởi động.

Danh tính dự án vẫn thuộc trách nhiệm nhà cung cấp: Memorix và Engram dùng dự án Git trong thư mục làm việc của DSH, trong đó Engram còn có thể tùy chọn nhận `ENGRAM_PROJECT`.

## Hướng dẫn cho model

Các ví dụ không sửa đổi `@deepseek-ai/dsh-system-prompt`: config patch sẽ thay thế toàn bộ cấu hình của một mục, có thể xóa mất persona đã có. README thay vào đó cung cấp một chỉ dẫn bổ sung tùy chọn:

> Khi người dùng yêu cầu bạn ghi nhớ điều gì đó, hãy gọi công cụ ghi bộ nhớ. Khi thông tin lịch sử có thể liên quan, hãy tìm kiếm bộ nhớ và sử dụng kết quả liên quan.

Mô tả công cụ của nhà cung cấp vẫn là định nghĩa có thẩm quyền.

## Quy ước xác minh

CI từ xa không truy cập dịch vụ bên thứ ba hay tiêu tốn khóa. Bộ test không cần khóa (keyless) sẽ phân giải cả ba file overlay, kiểm tra bridge chung và ranh giới khóa của chúng, thay endpoint upstream bằng MCP fixture (dữ liệu tiền đặt cho test) đi kèm package, khởi động qua Cordis Loader thật, và xác minh việc phát hiện công cụ.

Trước khi merge, mỗi nhà cung cấp phiên bản cố định phải cung cấp riêng bằng chứng thủ công sau:

1. Phiên DSH A gọi công cụ ghi, ghi một giá trị duy nhất vào bộ nhớ, và nhận kết quả thành công.
2. Phiên DSH B mới, dưới cùng phạm vi lưu trữ của nhà cung cấp, gọi tìm kiếm hoặc gọi lại và trả về giá trị đó mà không cần dựa vào transcript (bản ghi hội thoại) của phiên A.
3. Phiên B sử dụng giá trị gọi lại đó trong câu trả lời tiếp theo.

"Phiên mới" nghĩa là phiên DSH mới tạo trong cùng một Host, không cần khởi động lại Host. Client MCP chung phát hiện công cụ theo cách bất đồng bộ, không tự kết nối lại sau khi tiến trình con hoặc đường truyền tải HTTP đóng; việc xác minh sẽ chờ công cụ xuất hiện trước lượt đầu tiên, và chỉ dùng HMR hoặc khởi động lại Host sau khi crash.

## Các phương án thay thế đã cân nhắc

**Mỗi nhà cung cấp dùng một plugin DSH.** Không áp dụng, vì cách này lặp lại tầng xác thực, cấu hình, vòng đời và bọc công cụ mà MCP đã chuẩn hóa sẵn, và mở rộng phạm vi bảo trì theo mỗi nhà cung cấp thêm vào.

**Registry preset nhà cung cấp bộ nhớ.** Không áp dụng, vì registry sẽ khiến các phiên bản và khuyến nghị bên thứ ba trông như một giao diện sản phẩm DSH được hỗ trợ chính thức. Overlay có thể sao chép giúp quyền sở hữu và độ lệch phiên bản luôn hiển thị rõ ràng.

**Chạy `npx` hoặc `go run` bên trong mục cấu hình MCP.** Không áp dụng, vì khảo sát cho thấy lần tải npm đầu tiên có thể vượt quá timeout khởi tạo MCP, và cache `npx` bị gián đoạn có thể trở nên không dùng được. DSH chịu trách nhiệm khởi động tiến trình server, không phải trình quản lý package của nhà cung cấp. Lệnh cài đặt phiên bản cố định thuộc về điều kiện tiên quyết rõ ràng.

**Để client MCP chung bơm chỉ dẫn dùng chung.** Không áp dụng, vì bridge đó cũng phục vụ các MCP server không liên quan đến bộ nhớ, và thay đổi prompt chung sẽ mang ngữ nghĩa của nhà cung cấp trở lại mã runtime dùng chung.

## Hệ quả

Sau khi chọn một file, model có thể sử dụng toàn bộ giao diện công cụ MCP mà nhà cung cấp phát hiện được; schema công cụ và chi phí token do nhà cung cấp quyết định. Gỡ bỏ `--config` sẽ gỡ bỏ server bộ nhớ. Người dùng trực tiếp chấp nhận giấy phép, chính sách dữ liệu, phí dịch vụ đám mây và mô hình vận hành của từng bên upstream.

Phương án chung này thay thế cho các thay đổi trước đây dành riêng cho từng nhà cung cấp. Khi có độ lệch phiên bản nhà cung cấp trong tương lai, chỉ cần cập nhật và xác minh lại phiên bản cố định của một ví dụ nhỏ, không cần thêm nhánh runtime vào DSH.
