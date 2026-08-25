# @deepseek-ai/dsh-session-log-export

[English](README.md) | Tiếng Việt

Điều khiển tải xuống log Web Session, sử dụng endpoint ZIP dạng streaming của Host thuộc sở hữu `dsh-host-apiproxy`. Nửa Host đăng ký `/export`; nửa trình duyệt cung cấp thao tác `Session log` kích thước 111×32 trong Session Header, cùng một bộ điều khiển tải xuống và cửa sổ dùng chung cho nút này và slash command. Việc tạo ZIP, đọc JSONL/zstd gốc, sub-session, tệp đính kèm, backpressure và ngữ nghĩa lỗi HTTP vẫn do [triển khai tải xuống ApiProxy](../../host/apiproxy/README.md) đảm nhiệm.

## Quy ước lệnh

| Đầu vào | Kết quả |
|---|---|
| `/export` | Ghi lại một vòng đời lệnh người dùng; trình duyệt gửi lệnh sau khi nhận xác nhận thực thi cục bộ sẽ tải xuống `GET /api/session.export?sessionId=<id>&includeDescendants=true`. |
| `/export <path>` | Trả về lỗi. Việc tải xuống trên trình duyệt chọn vị trí đích thông qua hành vi tải xuống thông thường của trình duyệt. |

Lệnh này chỉ được gắn bởi Web bundle. Chỉ khi `/export` trả về thành công, xác nhận `command/executed` cục bộ mới kích hoạt việc tải xuống qua slash command trên trình duyệt đã gửi lệnh; các tab khác vẫn hiển thị dòng lệnh lâu bền nhưng không thực thi lại tác dụng phụ trên trình duyệt. Nút Header gọi trực tiếp cùng một bộ điều khiển. Cả hai lối vào đều phát một `HEAD` dò trước, sau đó giao URL GET cho trình quản lý tải xuống của trình duyệt; JavaScript không đệm ZIP; chúng dùng chung việc gộp các yêu cầu đồng thời, hủy dò trước khi plugin được giải phóng, xử lý lỗi ở giai đoạn chuẩn bị, hành vi lưu của trình duyệt, và cùng một Modal.

Endpoint tải xuống của Host sẽ flush root Session đang hoạt động trước `readRaw`, do đó ZIP được kích hoạt bởi slash command sẽ chứa cặp sự kiện `command/run` và `command/done` khởi động việc tải xuống. Session lâu bền đã nguội không cần flush.

Cửa sổ báo cáo trạng thái đang chuẩn bị, bắt đầu tải xuống, hoặc thất bại. Đóng cửa sổ không hủy việc tải xuống đang diễn ra; khi thao tác đó hoàn tất sau đó cũng không mở lại cửa sổ. Mỗi Session chỉ cho phép một lượt tải xuống tại một thời điểm, các thao tác lặp lại sẽ dùng chung tác vụ đó.

## Cấu thành

```yaml
- id: session-log-download
  name: '@deepseek-ai/dsh-session-log-export'
```

Web bundle gắn gói này cùng `dsh-host-apiproxy`, `dsh-commands`, `dsh-client-ui-commands` và `dsh-client-ui-conversation`. Gói này đóng góp nút và cửa sổ vào danh sách `conversation.session.header.utilities` ngoài cùng bên phải, độc lập với các mục cấu hình mode, Subagent và Task trong `conversation.session.header.actions` cạnh tiêu đề; Trajectory không bao gồm lối vào export.

## Trải nghiệm mô hình

### Điều khiển `/export` của người dùng

#### Mô hình thấy gì

Không gì cả. `/export` nằm trên mặt phẳng lệnh người dùng, việc tải ZIP không đi vào lịch sử mô hình.

#### Ảnh hưởng Token

Bằng không. Lệnh này không tạo lượt mô hình nào.

#### Ảnh hưởng KV Cache

Không có. Chỉ có vòng đời lệnh log và việc tải xuống trên trình duyệt, không thay đổi tiền tố request phái sinh.

## Hạn chế đã biết và công việc hoãn lại

- Endpoint tải xuống yêu cầu backend lâu bền phải có artifact gốc theo từng Session. Backend JSONL đi kèm hỗ trợ artifact dạng văn bản thuần và zstd; thay đổi này không bao gồm export SQLite.
- Đây là tải xuống trên trình duyệt, không phải ghi đường dẫn Host. Vị trí đích do trình duyệt chọn, không trả về đường dẫn Host hay thao tác thư mục gốc.
- Việc dò trước chỉ báo cáo các lỗi phát hiện được trước khi ZIP bắt đầu streaming. Lỗi đọc sub-session hoặc tệp đính kèm xảy ra sau khi trình duyệt đã chấp nhận GET sẽ do trình quản lý tải xuống của trình duyệt báo cáo, không qua cửa sổ.
