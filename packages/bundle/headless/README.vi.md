# `@deepseek-ai/dsh-headless`

[English](README.md) | Tiếng Việt

Gói tổ hợp tác vụ một lần chạy của dsh. [`cordis.patch.yml`](cordis.patch.yml) chồng trực tiếp lên [`dsh-base`](../base/README.md): cung cấp persona coding và chế độ công cụ, vô hiệu hóa HMR (hot module replacement — thay thế module nóng), gắn worker của Code Mode như một năng lực thực thi cốt lõi, và chèn plugin `headless-runner` của gói này (cấu hình dưới dạng `{task}`, được giải quyết từ provider `headlessStartup` đã inject). Nó không gắn bất kỳ plugin Host, HTTP server, Web runtime hay trình duyệt nào.

Sau khi Loader kết toán, runner đọc [`ctx.agentDefaultModel`](../../core/agent-default-model/README.md) dùng chung, tạo một Agent (tác tử) bền vững hoàn toàn mới qua `ctx.agents`, gửi tác vụ dưới dạng tin nhắn người dùng thông thường, và chờ hoàn tất toàn bộ. Nó thực hiện flush trên Session rồi mới tổng hợp khoảng sự kiện bền vững mà nó tự sở hữu, ghi tin nhắn văn bản assistant không rỗng cuối cùng vào stdout, rồi yêu cầu thoát qua hook `ctx.appExit` do launcher cung cấp ([`dsh-cmdline`](../../boot/cmdline/README.md)) (`turn/end` cuối cùng hoàn tất → 0, còn lại là 1). Khi lý do kết thúc cuối cùng là `error`, nó còn ghi code và message vào stderr; khi chạy thành công, stderr giữ nguyên rỗng. Tiến trình không mở cổng lắng nghe nào. Văn bản tác vụ chính là dòng lệnh của ứng dụng này: provider `headless-startup` thông thường ([`src/startup.ts`](src/startup.ts)) inject `ctx.cmdlineArgs` ([`dsh-cmdline`](../../boot/cmdline/README.md)), đọc tham số vị trí của `dsh --profile headless "task"`, in `--help` riêng của ứng dụng, và cung cấp `headlessStartup`; runner inject service đó, rồi đọc tác vụ từ cấu hình lazy. Tác vụ bị thiếu hoặc chỉ toàn khoảng trắng sẽ bị từ chối trước khi runner được kích hoạt.

## Trải nghiệm Model

Không có tác động, vì runner gửi tác vụ dưới dạng tin nhắn người dùng thông thường; prompt và công cụ được cung cấp bởi các mục tương ứng trong gói tổ hợp base và headless.

#### Tác động KV Cache

Không có; runner không thêm bất cứ thứ gì vào tiền tố yêu cầu.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ gửi một tác vụ**: runner không có bề mặt (surface) cho đầu vào tiếp theo tương tác; nó chờ toàn bộ công việc mà Agent hoàn tất trước khi quay về idle, và in ra tin nhắn assistant không rỗng cuối cùng trong khoảng đó.
- **`ctx.appExit` do launcher giữ**: khởi động profile headless bên ngoài launcher `dsh` sẽ báo lỗi rõ ràng khi kích hoạt, cho đến khi host cung cấp yêu cầu thoát đó.
