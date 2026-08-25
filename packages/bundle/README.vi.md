# bundle/ — Gói tổ hợp plugin profile

[English](README.md) | Tiếng Việt

Gói tổ hợp Profile: các gói npm khai báo `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` trong manifest (tệp khai báo metadata), do đó có thể được cài đặt như một lớp patch vào tổ hợp `dsh --profile` ([quy ước profile](../boot/app-boot/README.md#profiles)). Thực thể của gói tổ hợp là danh sách patch của nó; một số gói tổ hợp còn kèm theo plugin gắn kết (glue) thời gian chạy được gắn bởi patch của chúng.

| Gói | Trách nhiệm | ctx key |
|---|---|---|
| [`base/`](base/README.md) | Lõi dsh dùng chung, được áp dụng đầu tiên cho mỗi profile | — (chỉ patch) |
| [`web-app/`](web-app/README.md) | Lớp hiển thị trình duyệt: lớp patch web + plugin gắn kết thời gian chạy | Gắn nhiều dòng cấu hình |
| [`headless/`](headless/README.md) | Chế độ tác vụ một lần chạy trực tiếp trên base, không có lớp Host hay Web | Gắn `headless-runner` |

Gói tổ hợp tích hợp sẵn được giải quyết từ thư mục cài đặt dsh; gói tổ hợp ngoài cây (out-of-tree) được cài đặt vào profile thông qua `dsh plugin --profile <name> add <package>`.
