# dsh-native-command

[English](README.md) | Tiếng Việt

**Bộ chạy `execFile` không phụ thuộc, không qua shell** dùng chung cho tích hợp hệ điều hành nguyên bản phía host: một lần gọi `runNativeCommand(command, args, signal)` spawn trực tiếp file thực thi (không bao giờ ghép chuỗi shell), bắt stdout/stderr theo utf8, truyền tiếp abort của bên gọi thành việc chấm dứt tiến trình con, và ẩn cửa sổ console thoáng qua trên Windows. Khi thất bại, lệnh gọi sẽ bị reject với lỗi; lỗi này kèm theo `code` thoát và cả hai luồng output đã bắt được, để bên gọi có thể phân loại (thiếu công cụ, đã hủy, thất bại thật sự) mà không cần chạy lại.

Cả hai bên tiêu thụ của nó đều là tích hợp nguyên bản phía host: lệnh chọn của OS mà [`directory-picker-native`](../../host/directory-picker-native/README.md) dùng ở backend, và thao tác gateway giao đường dẫn cho ứng dụng mặc định mở (`host.openPath` của [`dsh-host-apiproxy`](../../host/apiproxy/README.md)). Kiểu `NativeCommandRunner` là ranh giới lệnh có thể inject cho các bên gọi này.

Đây là **thư viện, không phải service hay plugin**: không có `ctx`, không đăng ký gì, không giữ trạng thái, không phát sự kiện.

## Bề mặt giao diện

```ts
import { runNativeCommand, type NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
```

## Trải nghiệm model

Không có; đây là pipeline tiến trình con phía host, không có gì ở đây đi vào request của model.

#### Ảnh hưởng KV Cache

Không có; gói này không lắp ráp cũng không gửi request tới bên cung cấp.

## Giới hạn đã biết và việc còn hoãn lại

- **Không giới hạn dung lượng output** — hai luồng được đệm không giới hạn trong bộ nhớ; hiện tại mỗi bên gọi chỉ chạy các công cụ nguyên bản nhỏ có output là một đường dẫn hoặc một dòng lỗi. Trước khi trỏ nó vào lệnh có lượng output đáng kể, hãy tích hợp giới hạn `dsh-output-retention`.
