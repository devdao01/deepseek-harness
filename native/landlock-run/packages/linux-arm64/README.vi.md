# @deepseek-ai/node-addon-landlock-run-linux-arm64

[English](README.md) | 中文

Launcher Landlock `bin/landlock-run` dựng sẵn cho linux-arm64: một file nhị phân musl tĩnh (không dùng cross toolchain) được biên dịch gốc từ mã nguồn C đi kèm gói [`@deepseek-ai/node-addon-landlock-run`](https://www.npmjs.com/package/@deepseek-ai/node-addon-landlock-run). Trường `os`/`cpu` của npm chọn gói này lúc cài đặt; gói entry định vị nó tới đường dẫn file. Gói này không chứa JavaScript, và không bao giờ được import.

File nhị phân này bị git bỏ qua, và đi vào tarball npm qua danh sách `files`; nếu file thiếu hoặc sai kiến trúc ELF, cổng `prepack` sẽ từ chối đóng gói, còn pipeline phát hành sẽ kiểm chứng theo từng byte rằng file nhị phân đã đóng gói khớp với artifact build CI gốc của nó. Liên kết tĩnh musl khiến cùng một file nhị phân dùng được cho cả bản phân phối glibc lẫn musl, vì vậy tên gói không có hậu tố libc.

Gói cùng cấp: `@deepseek-ai/node-addon-landlock-run-linux-x64`.
