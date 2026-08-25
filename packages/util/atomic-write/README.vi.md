# dsh-atomic-write

[English](README.md) | Tiếng Việt

Cơ chế thay thế file nguyên tử (atomic) không phụ thuộc (zero-dependency), dùng chung cho các kho lưu trữ dạng file tuyệt đối không được phép để lại nội dung dở dang, bị chiếm quyền qua symlink, hoặc có quyền quá rộng trên đĩa: tài liệu cấu hình người dùng (`dsh-settings-file`) và kho lưu credential (`dsh-credentials-local`).

## Bề mặt giao diện

```ts
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

declare const text: string
declare const render: (previous: string) => string

await writeFileAtomic('/home/u/.dsh/settings.yaml', text, { mode: 0o600 })

// Read-modify-write against the same file from several processes.
await withFileLock('/home/u/.dsh/settings.yaml', async () => {
  await writeFileAtomic('/home/u/.dsh/settings.yaml', render(text), { mode: 0o600 })
})
```

`writeFileAtomic` commit một chuỗi (string) đã được render sẵn. Các ước định (convention) được liệt kê theo thứ tự chúng ngăn chặn lỗi:

- **Tạo file tạm độc quyền (exclusive)** (`wx` + hậu tố ngẫu nhiên): open sẽ từ chối theo dấu symlink được gài sẵn tại đường dẫn tạm có thể đoán được.
- **inode hoàn toàn mới mang `mode` đi hết qua rename**: khi thay thế file cũ có quyền quá rộng, quyền được thu hẹp ngay lập tức, không có race condition kiểu chmod. `mode` là bắt buộc, để quyết định về quyền luôn hiện diện rõ ràng tại mỗi điểm gọi (giống mọi inode mới, nó vẫn chịu ảnh hưởng của umask tiến trình).
- **`rename` thay thế chính bản thân đích symlink**, không bao giờ ghi xuyên qua file mà nó trỏ tới.
- **File anh em cùng thư mục** đảm bảo rename rơi trên cùng một hệ thống file, giữ cho việc hoán đổi vẫn nguyên tử.
- Tự động tạo thư mục cha; bất kỳ thất bại nào cũng sẽ xóa file tạm và ném lại lỗi đó; bên đọc chỉ có thể quan sát được nội dung cũ hoặc nội dung mới hoàn chỉnh.

`withFileLock` tuần tự hóa các bên ghi vào cùng một file xuyên tiến trình, phục vụ cho vòng lặp đọc-render-commit mà chỉ dựa vào commit nguyên tử là không đủ an toàn. Lock là file `<filename>.lock` cùng thư mục, được tạo bằng `wx`, do đó bên đọc không bao giờ tham gia cạnh tranh; bên chờ dùng exponential backoff, hết thời gian chờ sẽ báo lỗi thay vì chặn vô hạn định. Bên cạnh tranh không bao giờ xóa lock hiện có: tuổi của lock không thể phân biệt giữa chủ sở hữu đã crash và bên ghi bị tạm dừng nhưng vẫn còn sống.

## Trải nghiệm model

Không có: gói này là nguyên thủy hệ thống file thuần túy, không có nội dung nào ở đây tới được request của model.

#### Ảnh hưởng KV Cache

Không có; không có nội dung nào ở đây đi vào tiền tố request.

## Giới hạn đã biết và việc còn hoãn lại

- **Nguyên tử nhưng không đảm bảo bền vững (persistent)** — không thực hiện `fsync` trên file hay thư mục chứa nó, do đó sau khi crash có thể quan sát thấy rename bị hoàn tác. Các kho lưu trữ dạng file ở đây sẽ đọc lại và phát hành lại khi khởi động, để tính bền vững lại cho bên gọi tự quyết định chính sách.
- **Chỉ hỗ trợ nội dung dạng chuỗi** — chưa cung cấp dạng `Buffer` hay streaming cho tới khi có bên tiêu thụ cần đến.
- **Lock còn sót lại cần người vận hành khôi phục**: tiến trình giữ lock thoát ra có thể để lại file lock cùng cấp. Bên ghi sau đó hết thời gian chờ cũng không xóa nó; người vận hành chỉ xóa nó sau khi xác nhận không còn bên ghi nào đang giữ lock đó. Bản thân thời gian tồn tại của file không thể chứng minh an toàn rằng không còn ai giữ nó.
