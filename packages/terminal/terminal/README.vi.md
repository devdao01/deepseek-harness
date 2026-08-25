# @deepseek-ai/dsh-terminal

[English](README.md) | 中文

Seam PTY bền vững có phạm vi sở hữu giới hạn. `TerminalSessionService` được đăng ký là `ctx.terminals`, sinh ra id session không minh bạch (opaque), định tuyến việc tạo qua backend có tên, giới hạn mỗi thao tác trong đúng một `Agent` đang hoạt động, và chờ backend dừng hẳn hoàn toàn khi agent (agent thông minh) đó hoặc dịch vụ dispose (giải phóng tài nguyên).

## Quy ước

- Backend đăng ký một `type` ổn định, và trả về `TerminalBackendSession` chưa được công bố; quá trình thiết lập thất bại hoặc bị hủy phải dọn dẹp tài nguyên đã cấp phát một phần. Nếu việc dọn dẹp thất bại, thì từ chối với `TerminalBackendCleanupError`, để registry có thể giữ lại lỗi dọn dẹp này sau khi hủy.
- Việc hủy spawn sẽ giữ nguyên nguyên nhân hủy chính xác do bên gọi cung cấp. Sau khi backend thiết lập xong, dispose của dịch vụ và việc chủ sở hữu biến mất vẫn tương ứng với hai loại thất bại khác nhau, có thể định tuyến bằng máy.
- Việc dispose của chủ sở hữu và dịch vụ sẽ hủy quá trình thiết lập chưa công bố thông qua tín hiệu do dịch vụ giữ, và chờ backend kết toán, rollback rồi mới trả về.
- Nếu việc đóng khi rollback thất bại, hoặc backend báo cáo dọn dẹp khởi động thất bại, vòng đời dispose sẽ kết thúc bằng reject, không tuyên bố đã dừng hẳn hoàn toàn. Việc hủy do bên gọi kích hoạt vẫn nhận được nguyên nhân chính xác của nó; lỗi rollback do vòng đời kích hoạt cũng sẽ khiến spawn đang chờ bị từ chối.
- Lỗi dọn dẹp backend xảy ra sau khi bên gọi hủy vẫn được tính là hoạt động của chủ sở hữu, cho đến khi chủ sở hữu hoặc dịch vụ dispose và tiêu thụ, báo cáo lỗi đó, để tránh việc chính sách vòng đời hiểu nhầm một lỗi dọn dẹp là đã dừng hẳn hoàn toàn.
- `hasOwnerActivity(owner)` bao phủ toàn bộ quá trình từ thiết lập chưa công bố đến khi đóng cuối cùng, giúp chính sách vòng đời giới hạn chính xác theo từng chủ sở hữu, không bị ảnh hưởng bởi race condition khi công bố.
- Spawn thành công sẽ công bố một `TerminalSessionId`. `name` tùy chọn chỉ là metadata hiển thị cục bộ của chủ sở hữu, không bao giờ đại diện cho quyền hạn.
- Một session tối đa chỉ chấp nhận một thao tác gửi đang hoạt động. Thao tác đọc và tín hiệu có thể quan sát thao tác gửi đó; trước khi thao tác hiện tại kết toán, một lần gửi khác sẽ thất bại.
- `TerminalSendResult.waitReason` và `sessionStatus` độc lập với nhau. `session_exit` mô tả tiến trình PTY cấp cao nhất, chứ không phải bất kỳ lệnh foreground tùy ý nào.
- `kill()` và dispose chỉ hoàn tất sau khi cây tiến trình mà backend đã bắt được dừng hẳn hoàn toàn. Việc dọn dẹp thất bại sẽ kết thúc bằng reject, chứ không tuyên bố thành công; đồng thời nó sẽ xóa backend và giới hạn registry tương ứng, để lần đóng tiếp theo có thể thử lại, và không gây nhiễu tới các lần thử mới hơn.

Seam này không bao gồm `node-pty`, sandbox, tool schema, prompt, task hay chính sách render terminal. Bản triển khai chịu trách nhiệm về cơ chế terminal; bên tiêu thụ chịu trách nhiệm về việc hiển thị cho model và đăng ký task background tùy chọn.

## Trải nghiệm model

### Bên tiêu thụ gián tiếp

#### Model nhìn thấy gì

Không có nội dung nào hiển thị trực tiếp. Gói này không đăng ký prompt hay công cụ nào; schema hiển thị và văn bản kết quả thuộc trách nhiệm của `@deepseek-ai/dsh-tool-terminal`.

#### Ảnh hưởng Token

Không có ảnh hưởng trực tiếp. Trạng thái session đang hoạt động được giữ cục bộ trong tiến trình, cho đến khi bên tiêu thụ trả về kết quả có giới hạn.

#### Ảnh hưởng KV Cache

Không trực tiếp làm thất hiệu; thay đổi tiền tố request thuộc trách nhiệm của bên tiêu thụ nêu trên.

## Hạn chế đã biết và công việc hoãn lại

- Session chỉ tồn tại cục bộ trong tiến trình, không khôi phục sau khi harness khởi động lại.
- Hệ thống cố ý không hỗ trợ chia sẻ giữa các agent; thiết kế session chia sẻ trong tương lai cần quy ước quyền hạn độc lập.
