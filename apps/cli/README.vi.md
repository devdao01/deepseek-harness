# `@deepseek-ai/dsh`

[English](README.md) | Tiếng Việt

`dsh` là lệnh dùng để khởi động profile trong DeepSeek Harness; một profile được tạo thành từ nhiều lớp patch của các bundle plugin xếp chồng theo thứ tự, rồi đến lớp cấu hình ghi đè (override) của riêng người dùng áp lên trên cùng. [`src/args.ts`](src/args.ts) đảm nhiệm cú pháp lệnh, [`src/bin.ts`](src/bin.ts) chỉ tải runner đã được chọn. Lệnh không hợp lệ, option thuộc mode khác, lỗi cấu hình, và khởi động thất bại đều thoát với trạng thái khác 0.

## Các mode entry

| Lệnh | Công dụng |
|---|---|
| `dsh --profile <name>` | Khởi động profile chỉ định, nằm tại `$DSH_HOME/profiles/<name>`. |
| `dsh --profile headless "job"` | Chạy một phiên bền vững hoàn toàn mới, in ra câu trả lời cuối cùng rồi thoát. |
| `dsh web` | Bí danh của `--profile web`. |
| `dsh plugin --profile <name> <pnpm args>` | Quản lý plugin của profile đó bằng cách chuyển tiếp tới pnpm trong thư mục profile. |

Thư mục nơi lệnh được chạy sẽ là workspace root mặc định. Profile `web` và `headless` sẽ tự khởi tạo từ template đi kèm khi dùng lần đầu; mọi profile khác đều phải được tạo qua `dsh plugin`.

## Tham số ứng dụng

Launcher chỉ phân tích (parse) các flag của riêng nó, và chuyển mọi thứ phía sau cho profile đã khởi động; bất kỳ plugin ứng dụng nào được inject vào profile đó đều có thể đọc snapshot bất biến dùng chung này ([`dsh-cmdline`](../../packages/boot/cmdline/README.md)). Vì vậy, flag của launcher phải được viết trước tiên; token đầu tiên mà launcher không nhận diện được sẽ đánh dấu điểm bắt đầu của tham số ứng dụng:

```sh
dsh --profile web --port 8080       # --port belongs to the web app
dsh --profile tui --resume <id>     # example, assuming the tui profile is installed; --resume belongs to the terminal app
dsh --profile headless "run the tests"
dsh --profile web --help            # the web app's flags, not the launcher's
dsh --help                          # the launcher's own help
```

## Profile

Thư mục profile chứa một `package.json` ghi lại các phụ thuộc plugin ngoài cây (out-of-tree), cùng profile manifest (bảng kê metadata) `dsh.profile` với danh sách `bundles` được sắp thứ tự bên trong; ngoài ra còn có một `cordis.patch.yml` lưu lớp patch của riêng người dùng.

Cây cấu hình bắt đầu từ gốc rỗng, rồi lần lượt xếp chồng các lớp cấu hình sau:
- Patch của từng bundle trong `dsh.profile.bundles`
- `cordis.patch.yml` của chính profile, rồi đến `$DSH_HOME/cordis.patch.yml` ở cấp home
- Lớp ghi đè do `--patch` chỉ định

Các bundle được liệt kê trong `dsh.profile.bundles` trước tiên được phân giải từ thư mục cài đặt dsh (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-headless`), sau đó từ `node_modules` của chính profile; pnpm sẽ cài các plugin ngoài cây vào thư mục đó.

Dùng `--dump-default-config` và `--dump-config` để kiểm tra cây cấu hình đã tổ hợp mà không cần khởi động.

Thứ tự ưu tiên chính xác của các lớp, các flag, hành vi tắt, giá trị mặc định khi triển khai, và cách chạy từ mã nguồn, xem [tài liệu tham chiếu hành vi CLI (giao diện dòng lệnh)](reference/README.md).

## Phát triển

Chạy ở môi trường production cần các package đã được build và artifact frontend. Hãy chạy `pnpm run build` riêng ở thư mục gốc repo, sau đó dùng `pnpm dsh <args...>` để chạy entry point TypeScript và chuyển tiếp toàn bộ tham số; quy ước phân giải module xem tại [tài liệu tham chiếu chạy từ mã nguồn](reference/README.md#source-execution).
