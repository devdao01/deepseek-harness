# @deepseek-ai/dsh-tool-terminal

[English](README.md) | 中文

Cung cấp 6 công cụ hướng tới model dựa trên `ctx.terminals`: `terminal_open`, `terminal_send`, `terminal_read`, `terminal_signal`, `terminal_close` và `terminal_list`. Mỗi thao tác đều đòi hỏi cung cấp đúng `Agent` khởi tạo, nên ngay cả khi model biết được id của một agent (agent thông minh) khác, cũng không thể thao tác terminal của agent đó.

`terminal_send(run_in_background: true)` sẽ tái sử dụng `ctx.jobs`; việc kiểm tra trước của task và việc dự trữ độc quyền gửi cho mỗi session của dịch vụ PTY đều diễn ra trước khi trả về job id. Hệ thống thu thập kết quả hoàn thành qua `job_output`, `job_kill` sẽ gửi `SIGINT` tới nhóm tiến trình foreground. Gửi ở foreground dùng card lời gọi/kết quả terminal. Gửi ở background dùng card thực thi chung; các thao tác mở, đọc, gửi tín hiệu, đóng và liệt kê lần lượt dùng card `execute`, `read`, `execute`, `delete` và `read` chung. Không thao tác nào khai báo vị trí nguồn.

## Cấu hình

| Khóa | Giá trị mặc định | Ý nghĩa |
|---|---:|---|
| `enableRunInBackground` | `true` | Công khai và chấp nhận `run_in_background`; đặt false thì schema sẽ bỏ trường này, và từ chối việc cố truyền tham số chưa khai báo |
| `maxResultBytes` | `262144` | Giới hạn UTF-8 (tối thiểu `64`) cho mỗi kết quả terminal đầy đủ hoặc đầu ra task PTY; được tính sau khi đã cộng metadata chờ, session, phân trang, cắt bớt và trạng thái task |

Cả hai giá trị đều được xác thực khi nạp. Giới hạn kết quả tối thiểu đảm bảo mỗi id session hay job do registry cấp phát đều có thể xuất hiện trong xác nhận tạo. Khi kết quả vượt `maxResultBytes`, chỉ cần còn không gian, việc render sẽ dành chỗ cho metadata điều khiển và dấu cắt bớt; việc cắt bớt sẽ giữ đúng ranh giới UTF-8. Mỗi callback nội dung cuối cùng do từng terminal định nghĩa đều áp dụng cùng một giới hạn này, bao gồm cả các lỗi, từ chối, rút ngắn, thay thế hoặc chặn của chính sách pre-execute, around-execute và post-execute đã được chuẩn hóa; kết quả chính sách nhiều khối có cấu trúc sẽ giữ nguyên cấu trúc của nó.

## Trải nghiệm model

### System prompt

#### Model nhìn thấy gì

Plugin này đóng góp section hướng dẫn cố định sau:

##### Hướng dẫn terminal

```markdown
Use a terminal session only when work needs persistent terminal state or interactive stdin; prefer shell/read/write/edit for bounded one-shot operations. Track every terminal session id and close sessions that no longer matter. An inferred_idle or timeout result does not prove the foreground command exited.
```

#### Ảnh hưởng Token

Trong suốt thời gian plugin hoạt động, mỗi request sẽ phát sinh một chi phí input cố định nhỏ.

#### Ảnh hưởng KV Cache

Khi phạm vi đăng ký và văn bản hướng dẫn không đổi, tiền tố sẽ giữ ổn định.

### Tool schema

#### Model nhìn thấy gì

6 schema đã sinh ra được liệt kê trong [mục lục `dsh-tool-terminal`](../../../docs/tool-catalog.md#deepseek-aidsh-tool-terminal). Khi plugin này hoạt động, request sẽ chứa chi phí schema token cố định của chúng; khi lọc công cụ theo phạm vi agent, các schema này có thể bị ẩn đi.

#### Ảnh hưởng Token

Request có công cụ hiển thị sẽ phát sinh chi phí schema cố định.

#### Ảnh hưởng KV Cache

Khi khả năng hiển thị và định nghĩa công cụ không đổi, tiền tố sẽ giữ ổn định.

### Kết quả công cụ và context task

#### Model nhìn thấy gì

Spawn sẽ trả về id và MOTD có giới hạn. Gửi/đọc sẽ trả về văn bản terminal có giới hạn cùng dấu sẵn sàng/lịch sử. Chế độ background trả về job id chung. Mọi kết quả văn bản đơn do bản thân terminal hoặc chính sách tạo ra, sau khi đã đi qua lỗi công cụ hoặc pipeline, từ chối, rút ngắn, thay thế, chặn đã chuẩn hóa và văn bản trạng thái task chung, đều bị giới hạn bởi `maxResultBytes`. Kết quả chính sách nhiều khối có cấu trúc sẽ giữ nguyên cấu trúc của nó. Kết quả sẽ được giữ lại trong lịch sử session cho đến khi nén (compaction); việc đọc task gia tăng sẽ không lặp lại đầu ra đã được tiêu thụ. Bên gọi bằng chương trình sẽ nhận được snapshot session có kiểu, DTO đọc/gửi có giới hạn từ provider, kết quả tín hiệu và đóng, hoặc `{ kind: "background", jobId }`; việc render Native sẽ áp dụng các giới hạn hiển thị nêu trên.

#### Ảnh hưởng Token

Kết quả văn bản đơn do bản thân terminal và chính sách tạo ra thay đổi theo dữ liệu, và bị giới hạn bởi `maxResultBytes`; nếu chính sách chủ động thay thế bằng nội dung nhiều khối có cấu trúc, thì chính sách đó chịu trách nhiệm giới hạn nội dung. Mỗi kết quả trả về đều được giữ lại trong lịch sử cho đến khi nén.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); kết quả mới nằm sau tiền tố request có thể tái sử dụng.

## Hạn chế đã biết và công việc hoãn lại

- Không công khai chuỗi phím có tên, TUI, BEL, thay đổi kích thước, tự khởi động hay schema chia sẻ giữa các agent.
- Chế độ background đồng thời phụ thuộc vào `@deepseek-ai/dsh-jobs` và bộ điều khiển hướng tới model của nó.
